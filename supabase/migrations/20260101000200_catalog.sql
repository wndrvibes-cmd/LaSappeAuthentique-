-- ============================================================================
-- 0002 — Catalogue : catégories, produits, variantes, options, images
-- ============================================================================

-- ──────────────────────────── Catégories ────────────────────────────
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references public.categories(id) on delete set null,
  slug          text not null unique,
  name          text not null,
  description   text,
  image_url     text,
  position      integer not null default 0,
  is_visible    boolean not null default true,
  seo_title     text,
  seo_description text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint categories_no_self_parent check (parent_id is distinct from id)
);
create index categories_parent_idx on public.categories(parent_id);
create index categories_visible_idx on public.categories(is_visible, position);

-- ───────────────────────────── Produits ─────────────────────────────
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  subtitle        text,
  description     text,
  story           text,                                  -- récit éditorial de la pièce
  care_guide      text,                                  -- entretien
  composition     text,                                  -- matières
  brand           text not null default 'La Sappe Authentique',
  status          product_status not null default 'draft',
  category_id     uuid references public.categories(id) on delete set null,

  -- Prix de référence (les variantes peuvent surcharger)
  base_price      numeric(12,2) not null check (base_price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price >= 0),
  currency        char(3) not null default 'EUR',

  -- Économie unitaire — alimente les modules Nexscope (marge, pricing)
  cost_price       numeric(12,2) check (cost_price >= 0),      -- coût d'achat FOB
  inbound_shipping numeric(12,2) not null default 0,           -- logistique entrante / unité
  handling_fee     numeric(12,2) not null default 0,           -- préparation / emballage
  payment_fee_rate numeric(6,4)  not null default 0.0290,      -- commission PSP (2,90 %)
  payment_fee_fixed numeric(12,2) not null default 0.25,
  ad_spend_ratio   numeric(6,4)  not null default 0,           -- part publicitaire ciblée
  return_rate      numeric(6,4)  not null default 0,           -- taux de retour observé
  return_fee       numeric(12,2) not null default 0,           -- coût de traitement d'un retour

  -- Logistique
  weight_grams    integer check (weight_grams >= 0),
  supplier_id     uuid,                                        -- FK posée en 0004
  lead_time_days  integer not null default 21 check (lead_time_days >= 0),

  -- SEO / mise en avant
  seo_title       text,
  seo_description text,
  tags            text[] not null default '{}',
  is_featured     boolean not null default false,

  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint products_compare_gt_base
    check (compare_at_price is null or compare_at_price >= base_price)
);
create index products_status_idx     on public.products(status, published_at desc);
create index products_category_idx   on public.products(category_id);
create index products_featured_idx   on public.products(is_featured) where status = 'active';
create index products_tags_idx       on public.products using gin(tags);
create index products_search_idx     on public.products
  using gin ((app.normalize_text(name || ' ' || coalesce(subtitle,'') || ' ' || coalesce(description,''))) gin_trgm_ops);

-- ──────────────── Options de variante (Taille, Couleur…) ────────────
create table public.product_options (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,                     -- « Taille », « Couleur »
  position    integer not null default 0,
  unique (product_id, name)
);

create table public.product_option_values (
  id          uuid primary key default gen_random_uuid(),
  option_id   uuid not null references public.product_options(id) on delete cascade,
  value       text not null,                     -- « M », « Bordeaux »
  swatch_hex  text,                              -- pastille couleur
  position    integer not null default 0,
  unique (option_id, value),
  constraint swatch_hex_format check (swatch_hex is null or swatch_hex ~* '^#[0-9a-f]{6}$')
);
create index option_values_option_idx on public.product_option_values(option_id, position);

-- ──────────────────────────── Variantes ─────────────────────────────
create table public.product_variants (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  sku             text not null unique,
  barcode         text,
  title           text not null,                 -- « M / Bordeaux »
  price           numeric(12,2) check (price >= 0),          -- null ⇒ base_price
  compare_at_price numeric(12,2) check (compare_at_price >= 0),
  cost_price      numeric(12,2) check (cost_price >= 0),     -- null ⇒ produit
  weight_grams    integer check (weight_grams >= 0),
  position        integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index variants_product_idx on public.product_variants(product_id, position);

-- Liaison variante ↔ valeurs d'options
create table public.variant_option_values (
  variant_id       uuid not null references public.product_variants(id) on delete cascade,
  option_value_id  uuid not null references public.product_option_values(id) on delete cascade,
  primary key (variant_id, option_value_id)
);

-- ──────────────────────────── Images ────────────────────────────────
create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  variant_id  uuid references public.product_variants(id) on delete set null,
  storage_path text not null,                    -- chemin dans le bucket Storage
  alt         text,
  position    integer not null default 0,
  width       integer,
  height       integer,
  created_at  timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id, position);

-- ──────────── Stock par variante + journal des mouvements ───────────
create table public.inventory_levels (
  variant_id        uuid primary key references public.product_variants(id) on delete cascade,
  on_hand           integer not null default 0,
  reserved          integer not null default 0 check (reserved >= 0),
  reorder_point     integer not null default 5 check (reorder_point >= 0),
  reorder_quantity  integer not null default 20 check (reorder_quantity >= 0),
  updated_at        timestamptz not null default now(),
  constraint inventory_on_hand_non_negative check (on_hand >= 0)
);

create table public.stock_movements (
  id          bigserial primary key,
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  delta       integer not null,
  reason      stock_move_reason not null,
  reference   text,                              -- n° de commande, bon de réception…
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index stock_movements_variant_idx on public.stock_movements(variant_id, created_at desc);

-- Vue : stock disponible à la vente
create or replace view public.variant_availability as
  select v.id as variant_id,
         v.product_id,
         v.sku,
         coalesce(i.on_hand, 0)                              as on_hand,
         coalesce(i.reserved, 0)                             as reserved,
         greatest(coalesce(i.on_hand,0) - coalesce(i.reserved,0), 0) as available,
         coalesce(i.reorder_point, 0)                        as reorder_point,
         (coalesce(i.on_hand,0) - coalesce(i.reserved,0)) <= coalesce(i.reorder_point,0) as needs_restock
    from public.product_variants v
    left join public.inventory_levels i on i.variant_id = v.id;

-- Triggers updated_at
create trigger touch_categories    before update on public.categories        for each row execute function app.touch_updated_at();
create trigger touch_products      before update on public.products          for each row execute function app.touch_updated_at();
create trigger touch_variants      before update on public.product_variants  for each row execute function app.touch_updated_at();
create trigger touch_inventory     before update on public.inventory_levels  for each row execute function app.touch_updated_at();
