-- ============================================================================
-- 0003 — Comptes clients, adresses, panier, favoris, commandes, paiements
-- ============================================================================

-- ─────────────────────── Profils (1-1 avec auth.users) ──────────────
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          citext not null,
  full_name      text,
  phone          text,
  role           app_role not null default 'customer',
  accepts_marketing boolean not null default false,
  locale         text not null default 'fr',
  notes          text,                                  -- notes internes (staff)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);

-- Création automatique du profil à l'inscription
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Helpers de rôle utilisés par les politiques RLS
create or replace function public.current_role() returns app_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'customer'::app_role);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() in ('staff','admin');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin';
$$;

-- ──────────────────────────── Adresses ──────────────────────────────
create table public.addresses (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  kind         address_kind not null default 'shipping',
  full_name    text not null,
  line1        text not null,
  line2        text,
  postal_code  text not null,
  city         text not null,
  country_code char(2) not null default 'FR',
  phone        text,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index addresses_profile_idx on public.addresses(profile_id);
create unique index addresses_one_default_per_kind
  on public.addresses(profile_id, kind) where is_default;

-- ───────────────── Panier (persistant + invité par token) ───────────
create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete cascade,
  guest_token uuid unique,                               -- panier anonyme
  currency    char(3) not null default 'EUR',
  discount_code text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cart_owner_present check (profile_id is not null or guest_token is not null)
);
create unique index carts_one_per_profile on public.carts(profile_id) where profile_id is not null;

create table public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references public.carts(id) on delete cascade,
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  quantity    integer not null check (quantity > 0),
  added_at    timestamptz not null default now(),
  unique (cart_id, variant_id)
);
create index cart_items_cart_idx on public.cart_items(cart_id);

-- ──────────────────────────── Favoris ───────────────────────────────
create table public.wishlist_items (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (profile_id, product_id)
);

-- ─────────────────── Zones et méthodes de livraison ─────────────────
create table public.shipping_zones (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  country_codes char(2)[] not null,
  is_active     boolean not null default true
);

create table public.shipping_methods (
  id                uuid primary key default gen_random_uuid(),
  zone_id           uuid not null references public.shipping_zones(id) on delete cascade,
  name              text not null,
  carrier           text,
  price             numeric(12,2) not null check (price >= 0),
  free_above        numeric(12,2) check (free_above >= 0),   -- franco de port
  delay_min_days    integer not null default 2,
  delay_max_days    integer not null default 5,
  is_active         boolean not null default true,
  position          integer not null default 0
);
create index shipping_methods_zone_idx on public.shipping_methods(zone_id, position);

-- ──────────────────────────── Commandes ─────────────────────────────
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique default app.next_order_number(),
  profile_id        uuid references public.profiles(id) on delete set null,
  email             citext not null,
  phone             text,

  status            order_status       not null default 'pending',
  payment_status    payment_status     not null default 'pending',
  fulfillment_status fulfillment_status not null default 'unfulfilled',

  currency          char(3) not null default 'EUR',
  subtotal          numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total    numeric(12,2) not null default 0 check (discount_total >= 0),
  shipping_total    numeric(12,2) not null default 0 check (shipping_total >= 0),
  tax_total         numeric(12,2) not null default 0 check (tax_total >= 0),
  total             numeric(12,2) not null default 0 check (total >= 0),

  -- Coût réel reconstitué à la commande → alimente les analyses de marge
  cogs_total        numeric(12,2) not null default 0,

  discount_code     text,
  shipping_method_id uuid references public.shipping_methods(id) on delete set null,
  shipping_address  jsonb,                        -- figée au moment de l'achat
  billing_address   jsonb,

  payment_provider  text,                         -- 'stripe'
  payment_intent_id text,
  tracking_number   text,
  tracking_url      text,
  customer_note     text,
  internal_note     text,

  placed_at         timestamptz,
  paid_at           timestamptz,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index orders_profile_idx on public.orders(profile_id, created_at desc);
create index orders_status_idx  on public.orders(status, created_at desc);
create index orders_payment_intent_idx on public.orders(payment_intent_id);
create index orders_placed_idx  on public.orders(placed_at desc);

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  variant_id    uuid references public.product_variants(id) on delete set null,
  -- Dénormalisation volontaire : la ligne reste lisible même si le produit évolue
  product_name  text not null,
  variant_title text not null,
  sku           text not null,
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  unit_cost     numeric(12,2) not null default 0 check (unit_cost >= 0),
  quantity      integer not null check (quantity > 0),
  line_total    numeric(12,2) not null check (line_total >= 0),
  image_path    text
);
create index order_items_order_idx   on public.order_items(order_id);
create index order_items_variant_idx on public.order_items(variant_id);

-- Journal des événements de commande (traçabilité)
create table public.order_events (
  id         bigserial primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  type       text not null,                       -- 'created','paid','shipped','note'…
  payload    jsonb not null default '{}',
  actor_id   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id, created_at desc);

-- ───────────────────── Emails transactionnels ───────────────────────
create table public.email_log (
  id          bigserial primary key,
  template    text not null,                      -- 'order_confirmation', 'shipped'…
  recipient   citext not null,
  order_id    uuid references public.orders(id) on delete set null,
  subject     text,
  provider_id text,
  status      text not null default 'queued',      -- queued | sent | failed
  error       text,
  created_at  timestamptz not null default now()
);
create index email_log_order_idx on public.email_log(order_id, created_at desc);

create trigger touch_profiles before update on public.profiles for each row execute function app.touch_updated_at();
create trigger touch_carts    before update on public.carts    for each row execute function app.touch_updated_at();
create trigger touch_orders   before update on public.orders   for each row execute function app.touch_updated_at();
