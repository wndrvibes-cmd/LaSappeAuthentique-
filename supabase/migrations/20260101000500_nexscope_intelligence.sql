-- ============================================================================
-- 0005 — Couche d'intelligence commerciale Nexscope
--
--  Modèle : chaque compétence du dépôt nexscope-ai/eCommerce-Skills est
--  enregistrée comme un MODULE exécutable. Trois modes d'exécution :
--    • engine    → algorithme déterministe exécuté dans l'application
--                  (portage TypeScript des scripts Python du dépôt)
--    • reasoning → instructions SKILL.md réelles envoyées au modèle avec
--                  les données réelles de la boutique injectées
--    • hybrid    → l'engine calcule, le modèle interprète
-- ============================================================================

-- ─────────────────── Registre des compétences Nexscope ──────────────
create table public.nexscope_skills (
  slug             text primary key,              -- 'profit-margin-calculator-shopify'
  name             text not null,
  category         text not null,                 -- 'Prix & Rentabilité', …
  platform         text,                          -- 'shopify','amazon','etsy'…
  emoji            text,
  description      text not null,
  source_path      text not null,                 -- chemin réel dans le dépôt
  execution_mode   text not null default 'reasoning'
                   check (execution_mode in ('engine','reasoning','hybrid')),
  engine_key       text,                          -- clé de l'engine TS associé
  has_scripts      boolean not null default false,-- scripts Python d'origine
  requires_external_data boolean not null default false,
  external_data_note text,                        -- ce qu'il faut connecter
  is_enabled       boolean not null default true,
  is_core          boolean not null default false,-- module mis en avant
  position         integer not null default 100,
  -- Instructions SKILL.md réelles, mises en cache depuis le dépôt public
  instructions     text,
  instructions_sha text,
  instructions_fetched_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index nexscope_skills_category_idx on public.nexscope_skills(category, position);
create index nexscope_skills_mode_idx     on public.nexscope_skills(execution_mode);
create index nexscope_skills_core_idx      on public.nexscope_skills(is_core) where is_enabled;

-- ──────────────── Exécutions de modules (analyses sauvegardées) ─────
create table public.skill_runs (
  id            uuid primary key default gen_random_uuid(),
  skill_slug    text not null references public.nexscope_skills(slug) on delete restrict,
  title         text not null,
  status        skill_run_status not null default 'queued',
  execution_mode text not null,

  -- Contexte métier rattaché
  product_id    uuid references public.products(id) on delete set null,
  variant_id    uuid references public.product_variants(id) on delete set null,
  category_id   uuid references public.categories(id) on delete set null,

  inputs        jsonb not null default '{}',      -- paramètres saisis
  context_snapshot jsonb not null default '{}',   -- données boutique injectées
  engine_output jsonb,                            -- résultat déterministe
  report_markdown text,                           -- analyse rédigée
  recommendations jsonb not null default '[]',    -- actions proposées
  metrics       jsonb not null default '{}',      -- indicateurs clés extraits

  model         text,
  input_tokens  integer,
  output_tokens integer,
  duration_ms   integer,
  error         text,

  is_pinned     boolean not null default false,
  automation_id uuid,                              -- FK posée plus bas
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index skill_runs_slug_idx    on public.skill_runs(skill_slug, created_at desc);
create index skill_runs_product_idx on public.skill_runs(product_id, created_at desc);
create index skill_runs_status_idx  on public.skill_runs(status, created_at desc);
create index skill_runs_pinned_idx  on public.skill_runs(is_pinned) where is_pinned;

-- ──────────────────── Veille concurrentielle ────────────────────────
create table public.competitors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  website     text,
  platform    text,                               -- 'shopify','amazon','etsy'…
  country_code char(2),
  positioning text,                               -- 'premium','entrée de gamme'…
  notes       text,
  is_tracked  boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.competitor_products (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid not null references public.competitors(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null, -- équivalent interne
  title          text not null,
  url            text,
  external_sku   text,
  currency       char(3) not null default 'EUR',
  last_price     numeric(12,2),
  last_checked_at timestamptz,
  is_tracked     boolean not null default true,
  created_at     timestamptz not null default now()
);
create index competitor_products_competitor_idx on public.competitor_products(competitor_id);
create index competitor_products_product_idx    on public.competitor_products(product_id);

-- Relevés de prix concurrents (saisie manuelle, import CSV ou API externe)
create table public.price_observations (
  id                    bigserial primary key,
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  price                 numeric(12,2) not null check (price >= 0),
  shipping_price        numeric(12,2),
  in_stock              boolean,
  source                text not null default 'manual'
                        check (source in ('manual','csv_import','api','automation')),
  observed_at           timestamptz not null default now()
);
create index price_observations_cp_idx on public.price_observations(competitor_product_id, observed_at desc);

-- Historique de NOS prix (traçabilité des décisions de pricing)
create table public.price_history (
  id          bigserial primary key,
  product_id  uuid not null references public.products(id) on delete cascade,
  variant_id  uuid references public.product_variants(id) on delete cascade,
  old_price   numeric(12,2),
  new_price   numeric(12,2) not null,
  reason      text,
  skill_run_id uuid references public.skill_runs(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index price_history_product_idx on public.price_history(product_id, created_at desc);

-- ───────────── Recherche produit / opportunités commerciales ────────
create table public.product_opportunities (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  category_hint  text,
  source         text not null default 'manual'
                 check (source in ('manual','skill_run','import')),
  skill_run_id   uuid references public.skill_runs(id) on delete set null,
  -- Scores d'évaluation (grille du dépôt Nexscope : demande / concurrence / marge)
  demand_score     integer check (demand_score between 0 and 100),
  competition_score integer check (competition_score between 0 and 100),
  margin_score     integer check (margin_score between 0 and 100),
  logistics_score  integer check (logistics_score between 0 and 100),
  total_score      integer check (total_score between 0 and 100),
  verdict          text,                           -- 'à tester','à écarter'…
  est_cost         numeric(12,2),
  est_price        numeric(12,2),
  est_margin_pct   numeric(6,2),
  rationale        text,
  evidence         jsonb not null default '[]',    -- sources / preuves saisies
  status           text not null default 'new'
                   check (status in ('new','researching','validated','rejected','launched')),
  converted_product_id uuid references public.products(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index opportunities_status_idx on public.product_opportunities(status, total_score desc);

-- ────────────────── Avis clients + analyse d'avis ───────────────────
create table public.product_reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  order_id    uuid references public.orders(id) on delete set null,
  author_name text not null,
  rating      integer not null check (rating between 1 and 5),
  title       text,
  body        text,
  is_verified boolean not null default false,
  is_published boolean not null default false,
  source      text not null default 'shop',       -- shop | import
  created_at  timestamptz not null default now()
);
create index product_reviews_product_idx on public.product_reviews(product_id, is_published, created_at desc);

-- ───────── Mentions de marque / réputation (brand-monitoring) ───────
create table public.brand_mentions (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,                      -- 'web','instagram','presse'…
  url         text,
  title       text,
  excerpt     text,
  sentiment   text check (sentiment in ('positive','neutral','negative')),
  severity    text check (severity in ('info','warning','critical')),
  is_handled  boolean not null default false,
  detected_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index brand_mentions_handled_idx on public.brand_mentions(is_handled, detected_at desc);

create trigger touch_nexscope_skills before update on public.nexscope_skills      for each row execute function app.touch_updated_at();
create trigger touch_opportunities   before update on public.product_opportunities for each row execute function app.touch_updated_at();
