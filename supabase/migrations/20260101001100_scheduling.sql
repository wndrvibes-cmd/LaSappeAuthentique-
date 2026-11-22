-- ============================================================================
-- 0011 — Planification des automatisations
--
--  Deux pièces :
--   1. le calcul de `next_run_at` à partir de l'expression cron, pour que le
--      back-office affiche la prochaine échéance ;
--   2. la tâche planifiée qui appelle l'Edge Function `automation-tick`.
--
--  ⚠️ La partie 2 nécessite deux valeurs propres à VOTRE projet. Elle est donc
--  livrée sous forme de procédure à appeler une fois, et non exécutée
--  automatiquement — une migration ne peut pas connaître l'URL de votre projet.
--
--      select app.enable_automation_schedule(
--        'https://VOTRE-REF.supabase.co',
--        'VOTRE_CRON_SECRET'
--      );
--
--  Le secret doit être identique à celui défini côté Edge Function :
--      supabase secrets set CRON_SECRET=...
-- ============================================================================

--  pg_cron et pg_net sont disponibles sur Supabase mais doivent être activées.
--  On tente l'activation sans faire échouer la migration : le calcul de la
--  prochaine échéance et le back-office fonctionnent sans elles ; seul le
--  déclenchement automatique en dépend.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron indisponible (%). Le déclenchement automatique des '
    'automatisations restera manuel jusqu''à son activation dans '
    'Database > Extensions.', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net indisponible (%). Idem : activation requise pour la '
    'planification.', sqlerrm;
end $$;

-- ───────── Prochaine échéance d'une expression cron (5 champs) ──────────
--  Implémentation volontairement simple : elle couvre les expressions
--  utilisées par le back-office (valeurs fixes, « * », listes et pas « */n »).
create or replace function app.next_cron_occurrence(
  p_cron text,
  p_from timestamptz default now()
) returns timestamptz
language plpgsql immutable as $$
declare
  parts text[];
  f_min text; f_hour text; f_dom text; f_mon text; f_dow text;
  candidate timestamptz;
  i integer := 0;
begin
  parts := regexp_split_to_array(trim(p_cron), '\s+');
  if array_length(parts, 1) <> 5 then
    return null;
  end if;
  f_min := parts[1]; f_hour := parts[2]; f_dom := parts[3];
  f_mon := parts[4]; f_dow := parts[5];

  -- Balayage minute par minute sur 366 jours au maximum.
  candidate := date_trunc('minute', p_from) + interval '1 minute';
  while i < 527040 loop
    if app.cron_field_matches(f_min,  extract(minute from candidate)::int)
      and app.cron_field_matches(f_hour, extract(hour   from candidate)::int)
      and app.cron_field_matches(f_mon,  extract(month  from candidate)::int)
      and (
        -- Convention cron : si jour-du-mois ET jour-de-semaine sont tous deux
        -- restreints, l'un OU l'autre suffit.
        (f_dom = '*' and f_dow = '*')
        or (f_dom <> '*' and f_dow = '*'
            and app.cron_field_matches(f_dom, extract(day from candidate)::int))
        or (f_dom = '*' and f_dow <> '*'
            and app.cron_field_matches(f_dow, extract(dow from candidate)::int))
        or (f_dom <> '*' and f_dow <> '*'
            and (app.cron_field_matches(f_dom, extract(day from candidate)::int)
              or app.cron_field_matches(f_dow, extract(dow from candidate)::int)))
      )
    then
      return candidate;
    end if;
    candidate := candidate + interval '1 minute';
    i := i + 1;
  end loop;

  return null;
end $$;

-- Un champ cron correspond-il à une valeur ? (« * », « 5 », « 1-5 », « 1,3,5 », « */15 »)
create or replace function app.cron_field_matches(p_field text, p_value integer)
returns boolean
language plpgsql immutable as $$
declare
  item text;
  bounds text[];
  step integer;
begin
  if p_field = '*' then return true; end if;

  foreach item in array string_to_array(p_field, ',') loop
    if item like '*/%' then
      step := substring(item from 3)::int;
      if step > 0 and p_value % step = 0 then return true; end if;
    elsif item like '%-%' then
      bounds := string_to_array(item, '-');
      if p_value between bounds[1]::int and bounds[2]::int then return true; end if;
    elsif item ~ '^\d+$' then
      if p_value = item::int then return true; end if;
    end if;
  end loop;

  return false;
end $$;

-- ───────── Mise à jour automatique de next_run_at ───────────────────────
create or replace function app.refresh_next_run_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' then
    new.next_run_at := app.next_cron_occurrence(new.schedule_cron, now());
  else
    new.next_run_at := null;
  end if;
  return new;
end $$;

create trigger automations_next_run
  before insert or update of schedule_cron, status on public.automations
  for each row execute function app.refresh_next_run_at();

-- Initialisation sur les automatisations déjà enregistrées
update public.automations
   set next_run_at = case when status = 'active'
                          then app.next_cron_occurrence(schedule_cron, now())
                     end;

-- ════════════════════════════════════════════════════════════════════════
--  Activation de la planification — à appeler UNE FOIS avec vos valeurs
-- ════════════════════════════════════════════════════════════════════════
create or replace function app.enable_automation_schedule(
  p_project_url text,
  p_cron_secret text
) returns text
language plpgsql security definer as $$
declare
  v_job_name constant text := 'lsa-automation-tick';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron n''est pas activée. Activez-la dans Supabase : '
      'Database > Extensions > pg_cron, puis relancez cette fonction.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net n''est pas activée. Activez-la dans Supabase : '
      'Database > Extensions > pg_net, puis relancez cette fonction.';
  end if;
  if p_project_url is null or p_project_url = '' then
    raise exception 'URL du projet requise (ex. https://xxxx.supabase.co)';
  end if;
  if p_cron_secret is null or length(p_cron_secret) < 16 then
    raise exception 'Le secret doit comporter au moins 16 caractères';
  end if;

  -- Remplace une planification existante
  perform cron.unschedule(jobid)
     from cron.job where jobname = v_job_name;

  -- Toutes les 15 minutes : la fonction ne traite que les automatisations
  -- actives dont l'échéance est franchie, le reste est ignoré.
  perform cron.schedule(
    v_job_name,
    '*/15 * * * *',
    format(
      $job$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object('cronSecret', %L, 'triggerSource', 'schedule'),
        timeout_milliseconds := 50000
      );
      $job$,
      rtrim(p_project_url, '/') || '/functions/v1/automation-tick',
      p_cron_secret
    )
  );

  return format('Planification « %s » active : appel toutes les 15 minutes de %s',
                v_job_name, rtrim(p_project_url, '/') || '/functions/v1/automation-tick');
end $$;

revoke all on function app.enable_automation_schedule(text, text) from public, anon, authenticated;

comment on function app.enable_automation_schedule(text, text) is
  'Active la planification des automatisations. À appeler une fois depuis '
  'l''éditeur SQL avec l''URL du projet et le même secret que CRON_SECRET.';

-- ───────── Désactivation ────────────────────────────────────────────────
create or replace function app.disable_automation_schedule() returns text
language plpgsql security definer as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'lsa-automation-tick';
  return 'Planification désactivée. Les automatisations ne se déclencheront plus seules.';
end $$;

revoke all on function app.disable_automation_schedule() from public, anon, authenticated;
