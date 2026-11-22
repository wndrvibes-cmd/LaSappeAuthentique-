-- ============================================================================
-- 0004 — Promotions, codes de réduction, fournisseurs, paramètres boutique
-- ============================================================================

-- ─────────────────── Codes de réduction / promotions ────────────────
create table public.discounts (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  title              text not null,
  type               discount_type not null default 'percentage',
  value              numeric(12,2) not null check (value >= 0),   -- % ou montant
  min_subtotal       numeric(12,2) not null default 0 check (min_subtotal >= 0),
  max_discount       numeric(12,2) check (max_discount >= 0),     -- plafond en €
  applies_to_category uuid references public.categories(id) on delete set null,
  applies_to_product  uuid references public.products(id) on delete set null,
  usage_limit        integer check (usage_limit > 0),             -- null = illimité
  usage_limit_per_customer integer check (usage_limit_per_customer > 0),
  used_count         integer not null default 0 check (used_count >= 0),
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint discount_percentage_range
    check (type <> 'percentage' or value <= 100),
  constraint discount_window check (ends_at is null or ends_at > starts_at)
);
create index discounts_active_idx on public.discounts(is_active, starts_at, ends_at);

create table public.discount_redemptions (
  id          bigserial primary key,
  discount_id uuid not null references public.discounts(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  amount      numeric(12,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (discount_id, order_id)
);
create index redemptions_profile_idx on public.discount_redemptions(profile_id);

-- Promotions automatiques sans code (ex. « -20 % sur les manteaux »)
create table public.promotions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  type         discount_type not null default 'percentage',
  value        numeric(12,2) not null check (value >= 0),
  category_id  uuid references public.categories(id) on delete cascade,
  product_id   uuid references public.products(id) on delete cascade,
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  is_active    boolean not null default true,
  banner_text  text,
  created_at   timestamptz not null default now()
);
create index promotions_active_idx on public.promotions(is_active, starts_at, ends_at);

-- ──────────────────────────── Fournisseurs ──────────────────────────
create table public.suppliers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  contact_name      text,
  email             citext,
  phone             text,
  country_code      char(2),
  website           text,
  -- Paramètres chaîne d'approvisionnement (modules Nexscope supply-chain)
  lead_time_days    integer not null default 21 check (lead_time_days >= 0),
  production_days   integer not null default 14 check (production_days >= 0),
  shipping_days     integer not null default 7  check (shipping_days >= 0),
  payment_terms_days integer not null default 0 check (payment_terms_days >= 0),
  min_order_quantity integer not null default 1 check (min_order_quantity >= 1),
  min_order_value   numeric(12,2) not null default 0,
  currency          char(3) not null default 'EUR',
  reliability_score integer check (reliability_score between 0 and 100),
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.products
  add constraint products_supplier_fk
  foreign key (supplier_id) references public.suppliers(id) on delete set null;
create index products_supplier_idx on public.products(supplier_id);

-- Bons de commande fournisseur
create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  supplier_id   uuid not null references public.suppliers(id) on delete restrict,
  status        text not null default 'draft',     -- draft|sent|received|cancelled
  currency      char(3) not null default 'EUR',
  total         numeric(12,2) not null default 0,
  expected_at   date,
  received_at   timestamptz,
  note          text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  variant_id        uuid not null references public.product_variants(id) on delete restrict,
  quantity          integer not null check (quantity > 0),
  unit_cost         numeric(12,2) not null check (unit_cost >= 0),
  received_quantity integer not null default 0 check (received_quantity >= 0)
);
create index po_items_po_idx on public.purchase_order_items(purchase_order_id);

-- ───────────────── Paramètres boutique (singleton) ──────────────────
create table public.shop_settings (
  id                   boolean primary key default true,
  shop_name            text not null default 'La Sappe Authentique',
  tagline              text not null default 'Pièces de caractère, matières nobles.',
  contact_email        citext not null default 'contact@lasappeauthentique.fr',
  support_phone        text,
  currency             char(3) not null default 'EUR',
  default_locale       text not null default 'fr',
  vat_rate             numeric(6,4) not null default 0.2000,
  prices_include_vat   boolean not null default true,
  free_shipping_above  numeric(12,2) default 120,
  -- Objectifs économiques servant de référence aux modules Nexscope
  target_net_margin    numeric(6,4) not null default 0.2500,
  target_cac           numeric(12,2),
  monthly_fixed_costs  numeric(12,2) not null default 0,
  -- Réglages du moteur d'intelligence
  ai_model             text not null default 'claude-opus-5',
  ai_enabled           boolean not null default true,
  address              jsonb not null default '{}',
  social               jsonb not null default '{}',
  announcement         text,
  updated_at           timestamptz not null default now(),
  constraint shop_settings_singleton check (id)
);

insert into public.shop_settings (id) values (true) on conflict do nothing;

create trigger touch_discounts  before update on public.discounts   for each row execute function app.touch_updated_at();
create trigger touch_suppliers  before update on public.suppliers   for each row execute function app.touch_updated_at();
create trigger touch_po         before update on public.purchase_orders for each row execute function app.touch_updated_at();
create trigger touch_settings   before update on public.shop_settings   for each row execute function app.touch_updated_at();
