-- ============================================================================
-- 0001 — Extensions, types partagés et fonctions utilitaires
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";      -- recherche floue produit
create extension if not exists "unaccent";     -- recherche FR sans accents
create extension if not exists "citext";

-- Schéma technique (non exposé à l'API)
create schema if not exists app;
revoke all on schema app from anon, authenticated;

-- ─────────────────────────── Énumérations ───────────────────────────
do $$ begin
  create type app_role           as enum ('customer','staff','admin');
  create type product_status     as enum ('draft','active','archived');
  create type order_status        as enum ('pending','paid','processing','shipped','delivered','cancelled','refunded');
  create type payment_status      as enum ('pending','authorized','paid','failed','refunded','partially_refunded');
  create type fulfillment_status  as enum ('unfulfilled','partial','fulfilled','returned');
  create type discount_type       as enum ('percentage','fixed_amount','free_shipping');
  create type stock_move_reason   as enum ('purchase','sale','return','adjustment','loss','transfer','initial');
  create type skill_run_status    as enum ('queued','running','succeeded','failed');
  create type automation_status   as enum ('active','paused');
  create type approval_status     as enum ('pending','approved','rejected','expired','applied');
  create type approval_risk       as enum ('low','medium','high');
  create type address_kind        as enum ('shipping','billing');
exception when duplicate_object then null; end $$;

-- ───────────────────── Horodatage automatique ───────────────────────
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────── Normalisation texte pour la recherche (FR) ───────────
create or replace function app.normalize_text(txt text) returns text
language sql immutable parallel safe as $$
  select lower(public.unaccent(coalesce(txt, '')));
$$;

-- ───────────────────── Génération de slug propre ────────────────────
create or replace function app.slugify(txt text) returns text
language sql immutable parallel safe as $$
  select trim(both '-' from regexp_replace(
           lower(public.unaccent(coalesce(txt, ''))),
           '[^a-z0-9]+', '-', 'g'));
$$;

-- ───────────── Numérotation lisible des commandes (LSA-00001) ───────
create sequence if not exists app.order_number_seq start 1001;

create or replace function app.next_order_number() returns text
language sql volatile as $$
  select 'LSA-' || lpad(nextval('app.order_number_seq')::text, 5, '0');
$$;
