-- ============================================================================
-- 0006 — Centre d'automatisation et file d'approbation
--
--  PRINCIPE DE SÉCURITÉ (exigence du cahier des charges) :
--  aucune action sensible — modification de prix, dépense publicitaire,
--  commande fournisseur, envoi d'email de masse — n'est exécutée par une
--  automatisation. Elle produit une DEMANDE D'APPROBATION que l'administrateur
--  valide explicitement. L'application de l'action est tracée et réversible.
-- ============================================================================

create table public.automations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  kind            text not null check (kind in (
                    'skill_analysis',      -- exécute un module Nexscope
                    'price_alert',         -- surveille les prix concurrents
                    'stock_alert',         -- surveille les seuils de stock
                    'competitor_watch',    -- veille concurrentielle
                    'sales_report',        -- rapport de ventes périodique
                    'price_recommendation',-- recommandation de prix (→ approbation)
                    'performance_tracking' -- suivi des performances produits
                  )),
  skill_slug      text references public.nexscope_skills(slug) on delete set null,
  status          automation_status not null default 'active',

  -- Planification (cron 5 champs, évalué en UTC par la fonction planifiée)
  schedule_cron   text not null default '0 7 * * 1',
  timezone        text not null default 'Europe/Paris',
  config          jsonb not null default '{}',     -- seuils, cibles, options

  -- Garde-fous
  requires_approval boolean not null default true,
  max_price_change_pct numeric(6,4) not null default 0.10,   -- borne de sécurité
  notify_email    citext,

  last_run_at     timestamptz,
  last_status     text,
  next_run_at     timestamptz,
  run_count       integer not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index automations_status_idx on public.automations(status, next_run_at);

alter table public.skill_runs
  add constraint skill_runs_automation_fk
  foreign key (automation_id) references public.automations(id) on delete set null;

-- ───────────────── Historique d'exécution des automatisations ───────
create table public.automation_runs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  status        text not null default 'running'
                check (status in ('running','succeeded','failed','skipped')),
  trigger_source text not null default 'schedule'
                check (trigger_source in ('schedule','manual','webhook')),
  summary       text,
  findings      jsonb not null default '[]',      -- constats détectés
  skill_run_id  uuid references public.skill_runs(id) on delete set null,
  approvals_created integer not null default 0,
  alerts_created    integer not null default 0,
  error         text,
  duration_ms   integer,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index automation_runs_automation_idx on public.automation_runs(automation_id, started_at desc);

-- ───────────── File d'approbation des actions sensibles ─────────────
create table public.approval_requests (
  id            uuid primary key default gen_random_uuid(),
  action_type   text not null check (action_type in (
                  'price_change',
                  'bulk_price_change',
                  'ad_budget_change',
                  'purchase_order',
                  'inventory_adjustment',
                  'discount_creation',
                  'bulk_email'
                )),
  risk          approval_risk not null default 'medium',
  status        approval_status not null default 'pending',
  title         text not null,
  rationale     text not null,                    -- pourquoi cette action
  -- Description exacte et exécutable de l'action proposée
  payload       jsonb not null,
  -- Valeurs actuelles, pour pouvoir revenir en arrière
  previous_state jsonb,
  estimated_impact jsonb not null default '{}',   -- effet chiffré attendu

  source_automation_id uuid references public.automations(id) on delete set null,
  source_skill_run_id  uuid references public.skill_runs(id) on delete set null,
  product_id    uuid references public.products(id) on delete set null,

  expires_at    timestamptz not null default (now() + interval '14 days'),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  applied_at    timestamptz,
  apply_error   text,
  created_at    timestamptz not null default now()
);
create index approvals_status_idx  on public.approval_requests(status, created_at desc);
create index approvals_product_idx on public.approval_requests(product_id);

-- ─────────────────────────── Alertes ────────────────────────────────
create table public.alerts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in (
                'low_stock','out_of_stock','competitor_price_drop',
                'competitor_price_rise','margin_below_target','sales_drop',
                'sales_spike','review_negative','brand_mention','automation_failed'
              )),
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  title       text not null,
  message     text not null,
  data        jsonb not null default '{}',
  product_id  uuid references public.products(id) on delete cascade,
  variant_id  uuid references public.product_variants(id) on delete cascade,
  automation_id uuid references public.automations(id) on delete set null,
  is_read     boolean not null default false,
  is_resolved boolean not null default false,
  created_at  timestamptz not null default now()
);
create index alerts_unread_idx on public.alerts(is_read, created_at desc);
create index alerts_kind_idx   on public.alerts(kind, created_at desc);

create trigger touch_automations before update on public.automations for each row execute function app.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
--  Application contrôlée d'une approbation
--  Seul un administrateur authentifié peut appeler cette fonction ; elle
--  vérifie la décision, applique l'action et journalise l'opération.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.apply_approval(p_approval_id uuid, p_note text default null)
returns public.approval_requests
language plpgsql security definer set search_path = public, app as $$
declare
  v_req public.approval_requests;
  v_item jsonb;
  v_old_price numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Seul un administrateur peut appliquer une approbation'
      using errcode = '42501';
  end if;

  select * into v_req from public.approval_requests
   where id = p_approval_id for update;

  if v_req is null then
    raise exception 'Demande d''approbation introuvable';
  end if;
  if v_req.status <> 'approved' then
    raise exception 'La demande doit être approuvée avant application (statut actuel : %)', v_req.status;
  end if;
  if v_req.expires_at < now() then
    update public.approval_requests set status = 'expired' where id = p_approval_id;
    raise exception 'Cette demande a expiré';
  end if;

  if v_req.action_type in ('price_change','bulk_price_change') then
    -- payload = { "changes": [ { "product_id": uuid, "variant_id": uuid|null, "new_price": num } ] }
    for v_item in select * from jsonb_array_elements(v_req.payload -> 'changes') loop
      if (v_item ->> 'variant_id') is not null then
        select price into v_old_price from public.product_variants
         where id = (v_item ->> 'variant_id')::uuid;
        update public.product_variants
           set price = (v_item ->> 'new_price')::numeric
         where id = (v_item ->> 'variant_id')::uuid;
      else
        select base_price into v_old_price from public.products
         where id = (v_item ->> 'product_id')::uuid;
        update public.products
           set base_price = (v_item ->> 'new_price')::numeric
         where id = (v_item ->> 'product_id')::uuid;
      end if;

      insert into public.price_history
        (product_id, variant_id, old_price, new_price, reason, skill_run_id, approved_by)
      values (
        (v_item ->> 'product_id')::uuid,
        nullif(v_item ->> 'variant_id','')::uuid,
        v_old_price,
        (v_item ->> 'new_price')::numeric,
        coalesce(p_note, v_req.title),
        v_req.source_skill_run_id,
        auth.uid()
      );
    end loop;

  elsif v_req.action_type = 'inventory_adjustment' then
    -- payload = { "adjustments": [ { "variant_id": uuid, "delta": int, "note": text } ] }
    for v_item in select * from jsonb_array_elements(v_req.payload -> 'adjustments') loop
      insert into public.inventory_levels (variant_id, on_hand)
      values ((v_item ->> 'variant_id')::uuid, greatest((v_item ->> 'delta')::int, 0))
      on conflict (variant_id) do update
        set on_hand = greatest(public.inventory_levels.on_hand + (v_item ->> 'delta')::int, 0);

      insert into public.stock_movements (variant_id, delta, reason, note, created_by)
      values ((v_item ->> 'variant_id')::uuid, (v_item ->> 'delta')::int,
              'adjustment', coalesce(v_item ->> 'note', v_req.title), auth.uid());
    end loop;

  elsif v_req.action_type = 'discount_creation' then
    insert into public.discounts (code, title, type, value, min_subtotal, usage_limit, starts_at, ends_at)
    values (
      upper(v_req.payload ->> 'code'),
      coalesce(v_req.payload ->> 'title', v_req.title),
      coalesce((v_req.payload ->> 'type')::discount_type, 'percentage'),
      (v_req.payload ->> 'value')::numeric,
      coalesce((v_req.payload ->> 'min_subtotal')::numeric, 0),
      nullif(v_req.payload ->> 'usage_limit','')::int,
      coalesce((v_req.payload ->> 'starts_at')::timestamptz, now()),
      nullif(v_req.payload ->> 'ends_at','')::timestamptz
    )
    on conflict (code) do nothing;

  else
    -- ad_budget_change, purchase_order, bulk_email : l'exécution se fait
    -- dans le système externe concerné. On marque la décision comme
    -- appliquée pour la traçabilité, sans action automatique côté boutique.
    null;
  end if;

  update public.approval_requests
     set status = 'applied',
         applied_at = now(),
         decision_note = coalesce(p_note, decision_note)
   where id = p_approval_id
  returning * into v_req;

  return v_req;
end $$;

revoke all on function public.apply_approval(uuid, text) from public, anon;
grant execute on function public.apply_approval(uuid, text) to authenticated;
