-- ============================================================================
-- 0007 — Logique métier : prix effectifs, marges réelles, remises,
--        stock, analytics. Ces vues alimentent à la fois le back-office
--        et les modules Nexscope (données réelles, jamais simulées).
-- ============================================================================

-- ───────────────── Prix effectif d'une variante ─────────────────────
create or replace view public.variant_pricing as
  select v.id                                   as variant_id,
         v.product_id,
         v.sku,
         v.title                                as variant_title,
         p.name                                 as product_name,
         p.slug                                 as product_slug,
         coalesce(v.price, p.base_price)        as price,
         coalesce(v.compare_at_price, p.compare_at_price) as compare_at_price,
         coalesce(v.cost_price, p.cost_price)   as cost_price,
         p.currency,
         p.status,
         p.category_id
    from public.product_variants v
    join public.products p on p.id = v.product_id
   where v.is_active;

-- ══════════════════ Marge réelle par variante ═══════════════════════
--  Reprend la décomposition de coûts du script Nexscope
--  profit-margin-calculator (coût produit, logistique entrante,
--  préparation, commission PSP, publicité, retours) adaptée au DTC.
create or replace view public.variant_margins as
  select vp.variant_id,
         vp.product_id,
         vp.sku,
         vp.product_name,
         vp.variant_title,
         vp.price,
         vp.cost_price,
         p.inbound_shipping,
         p.handling_fee,
         round(vp.price * p.payment_fee_rate + p.payment_fee_fixed, 2) as payment_fee,
         round(vp.price * p.ad_spend_ratio, 2)                         as ad_cost,
         round(p.return_rate * (p.return_fee + coalesce(vp.cost_price,0) * 0.5), 2) as return_cost,
         -- Marge brute = prix − coût produit − logistique − préparation
         round(vp.price - coalesce(vp.cost_price,0) - p.inbound_shipping - p.handling_fee, 2) as gross_profit,
         -- Marge nette = marge brute − PSP − publicité − retours
         round(vp.price
               - coalesce(vp.cost_price,0) - p.inbound_shipping - p.handling_fee
               - (vp.price * p.payment_fee_rate + p.payment_fee_fixed)
               - (vp.price * p.ad_spend_ratio)
               - (p.return_rate * (p.return_fee + coalesce(vp.cost_price,0) * 0.5)), 2) as net_profit,
         case when vp.price > 0 then
           round(((vp.price - coalesce(vp.cost_price,0) - p.inbound_shipping - p.handling_fee)
                  / vp.price)::numeric, 4)
         end as gross_margin,
         case when vp.price > 0 then
           round(((vp.price
                   - coalesce(vp.cost_price,0) - p.inbound_shipping - p.handling_fee
                   - (vp.price * p.payment_fee_rate + p.payment_fee_fixed)
                   - (vp.price * p.ad_spend_ratio)
                   - (p.return_rate * (p.return_fee + coalesce(vp.cost_price,0) * 0.5)))
                  / vp.price)::numeric, 4)
         end as net_margin
    from public.variant_pricing vp
    join public.products p on p.id = vp.product_id;

-- ════════════════ Validation d'un code de réduction ═════════════════
create or replace function public.validate_discount(
  p_code text,
  p_subtotal numeric,
  p_profile_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d public.discounts;
  v_amount numeric(12,2) := 0;
  v_used_by_customer integer := 0;
begin
  select * into d from public.discounts
   where code = upper(trim(p_code)) and is_active
   limit 1;

  if d is null then
    return jsonb_build_object('valid', false, 'reason', 'Code inconnu ou désactivé');
  end if;
  if d.starts_at > now() then
    return jsonb_build_object('valid', false, 'reason', 'Ce code n''est pas encore actif');
  end if;
  if d.ends_at is not null and d.ends_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'Ce code a expiré');
  end if;
  if d.usage_limit is not null and d.used_count >= d.usage_limit then
    return jsonb_build_object('valid', false, 'reason', 'Ce code a atteint sa limite d''utilisation');
  end if;
  if p_subtotal < d.min_subtotal then
    return jsonb_build_object('valid', false, 'reason',
      format('Minimum d''achat de %s € requis', trim(to_char(d.min_subtotal,'FM999990.00'))));
  end if;

  if d.usage_limit_per_customer is not null and p_profile_id is not null then
    select count(*) into v_used_by_customer from public.discount_redemptions
     where discount_id = d.id and profile_id = p_profile_id;
    if v_used_by_customer >= d.usage_limit_per_customer then
      return jsonb_build_object('valid', false, 'reason', 'Vous avez déjà utilisé ce code');
    end if;
  end if;

  v_amount := case d.type
                when 'percentage'     then p_subtotal * d.value / 100.0
                when 'fixed_amount'   then least(d.value, p_subtotal)
                when 'free_shipping'  then 0
              end;

  if d.max_discount is not null then
    v_amount := least(v_amount, d.max_discount);
  end if;

  return jsonb_build_object(
    'valid', true,
    'discount_id', d.id,
    'code', d.code,
    'title', d.title,
    'type', d.type,
    'value', d.value,
    'amount', round(v_amount, 2),
    'free_shipping', d.type = 'free_shipping'
  );
end $$;

grant execute on function public.validate_discount(text, numeric, uuid) to anon, authenticated;

-- ═══════════════════ Mouvements de stock atomiques ══════════════════
create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_delta integer,
  p_reason stock_move_reason,
  p_reference text default null,
  p_note text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_new integer;
begin
  if not public.is_staff() then
    raise exception 'Accès réservé à l''équipe' using errcode = '42501';
  end if;

  insert into public.inventory_levels (variant_id, on_hand)
  values (p_variant_id, greatest(p_delta, 0))
  on conflict (variant_id) do update
    set on_hand = greatest(public.inventory_levels.on_hand + p_delta, 0)
  returning on_hand into v_new;

  insert into public.stock_movements (variant_id, delta, reason, reference, note, created_by)
  values (p_variant_id, p_delta, p_reason, p_reference, p_note, auth.uid());

  -- Alerte automatique sous le seuil de réapprovisionnement
  insert into public.alerts (kind, severity, title, message, variant_id, product_id, data)
  select case when av.available <= 0 then 'out_of_stock' else 'low_stock' end,
         case when av.available <= 0 then 'critical' else 'warning' end,
         case when av.available <= 0
              then format('Rupture de stock — %s', vp.product_name)
              else format('Stock bas — %s', vp.product_name) end,
         format('%s (%s) : %s unité(s) disponible(s), seuil fixé à %s.',
                vp.product_name, vp.variant_title, av.available, av.reorder_point),
         p_variant_id, vp.product_id,
         jsonb_build_object('available', av.available, 'reorder_point', av.reorder_point)
    from public.variant_availability av
    join public.variant_pricing vp on vp.variant_id = av.variant_id
   where av.variant_id = p_variant_id
     and av.available <= av.reorder_point
     and not exists (
       select 1 from public.alerts a
        where a.variant_id = p_variant_id
          and a.kind in ('low_stock','out_of_stock')
          and not a.is_resolved
     );

  return v_new;
end $$;

grant execute on function public.adjust_stock(uuid, integer, stock_move_reason, text, text) to authenticated;

-- ════════════════════════ Analytics commerciales ════════════════════
-- Chiffre d'affaires et marge par jour (données réelles de commandes)
create or replace view public.kpi_daily as
  select date_trunc('day', o.placed_at)::date        as day,
         count(distinct o.id)                        as orders,
         count(distinct o.email)                     as customers,
         sum(o.total)                                as revenue,
         sum(o.subtotal)                             as subtotal,
         sum(o.discount_total)                       as discounts,
         sum(o.shipping_total)                       as shipping,
         sum(o.cogs_total)                           as cogs,
         sum(o.total - o.cogs_total)                 as gross_profit,
         case when sum(o.total) > 0
              then round(((sum(o.total) - sum(o.cogs_total)) / sum(o.total))::numeric, 4) end as gross_margin,
         round(avg(o.total), 2)                      as average_order_value,
         sum(i.quantity)                             as units
    from public.orders o
    left join public.order_items i on i.order_id = o.id
   where o.placed_at is not null
     and o.status not in ('cancelled','refunded')
   group by 1;

-- Performance par produit : ventes, CA, marge, rotation
create or replace view public.product_performance as
  select p.id                                        as product_id,
         p.name,
         p.slug,
         p.status,
         p.category_id,
         c.name                                      as category_name,
         coalesce(sum(i.quantity), 0)                as units_sold,
         coalesce(sum(i.line_total), 0)              as revenue,
         coalesce(sum(i.unit_cost * i.quantity), 0)  as cogs,
         coalesce(sum(i.line_total) - sum(i.unit_cost * i.quantity), 0) as gross_profit,
         case when coalesce(sum(i.line_total),0) > 0
              then round(((sum(i.line_total) - sum(i.unit_cost * i.quantity))
                          / sum(i.line_total))::numeric, 4) end as gross_margin,
         count(distinct o.id)                        as order_count,
         max(o.placed_at)                            as last_sold_at,
         (select coalesce(sum(av.available), 0)
            from public.variant_availability av
            join public.product_variants pv on pv.id = av.variant_id
           where pv.product_id = p.id)              as stock_available,
         (select round(avg(r.rating), 2) from public.product_reviews r
           where r.product_id = p.id and r.is_published) as average_rating,
         (select count(*) from public.product_reviews r
           where r.product_id = p.id and r.is_published) as review_count
    from public.products p
    left join public.categories c on c.id = p.category_id
    left join public.order_items i on i.variant_id in (
         select id from public.product_variants where product_id = p.id)
    left join public.orders o on o.id = i.order_id
         and o.placed_at is not null
         and o.status not in ('cancelled','refunded')
   group by p.id, p.name, p.slug, p.status, p.category_id, c.name;

-- Santé du stock : couverture en jours à partir des ventes réelles 30 j
create or replace view public.inventory_health as
  with sales_30d as (
    select i.variant_id, sum(i.quantity)::numeric / 30.0 as daily_velocity
      from public.order_items i
      join public.orders o on o.id = i.order_id
     where o.placed_at >= now() - interval '30 days'
       and o.status not in ('cancelled','refunded')
     group by i.variant_id
  )
  select av.variant_id,
         av.product_id,
         vp.product_name,
         vp.variant_title,
         av.sku,
         av.on_hand,
         av.reserved,
         av.available,
         av.reorder_point,
         coalesce(s.daily_velocity, 0)                     as daily_velocity,
         case when coalesce(s.daily_velocity, 0) > 0
              then round((av.available / s.daily_velocity)::numeric, 1) end as days_of_cover,
         av.needs_restock,
         vp.cost_price,
         round(av.on_hand * coalesce(vp.cost_price, 0), 2)  as stock_value_at_cost
    from public.variant_availability av
    join public.variant_pricing vp on vp.variant_id = av.variant_id
    left join sales_30d s on s.variant_id = av.variant_id;

-- Économie unitaire globale de la boutique (entrée des modules
-- ecommerce-growth-strategy : AOV, marge de contribution, CA récurrent)
create or replace function public.store_unit_economics(p_days integer default 90)
returns jsonb
language sql stable security definer set search_path = public as $$
  with window_orders as (
    select * from public.orders
     where placed_at >= now() - make_interval(days => p_days)
       and status not in ('cancelled','refunded')
  ),
  base as (
    select count(*)::numeric                             as order_count,
           count(distinct email)::numeric                as customer_count,
           coalesce(sum(total), 0)                       as revenue,
           coalesce(sum(cogs_total), 0)                  as cogs,
           coalesce(avg(total), 0)                       as aov
      from window_orders
  ),
  repeat_customers as (
    select count(*)::numeric as repeaters from (
      select email from window_orders group by email having count(*) > 1
    ) t
  )
  select jsonb_build_object(
    'window_days', p_days,
    'orders', base.order_count,
    'customers', base.customer_count,
    'revenue', round(base.revenue, 2),
    'cogs', round(base.cogs, 2),
    'gross_profit', round(base.revenue - base.cogs, 2),
    'gross_margin', case when base.revenue > 0
                         then round(((base.revenue - base.cogs) / base.revenue)::numeric, 4) end,
    'aov', round(base.aov, 2),
    'orders_per_customer', case when base.customer_count > 0
                                then round((base.order_count / base.customer_count)::numeric, 2) end,
    'repeat_customers', repeat_customers.repeaters,
    'repeat_rate', case when base.customer_count > 0
                        then round((repeat_customers.repeaters / base.customer_count)::numeric, 4) end,
    'contribution_per_order', case when base.order_count > 0
                                   then round(((base.revenue - base.cogs) / base.order_count)::numeric, 2) end,
    'monthly_fixed_costs', (select monthly_fixed_costs from public.shop_settings),
    'target_net_margin',   (select target_net_margin   from public.shop_settings),
    'target_cac',          (select target_cac          from public.shop_settings)
  )
  from base, repeat_customers;
$$;

grant execute on function public.store_unit_economics(integer) to authenticated;

-- ════════════ Paramètres publics de la boutique ═════════════════════
--  La table `shop_settings` contient des données d'exploitation qui ne
--  doivent PAS être lisibles publiquement : marge nette cible, coût
--  d'acquisition visé, charges fixes mensuelles, modèle d'analyse.
--  La boutique n'a besoin que de l'identité et des règles d'affichage :
--  cette vue expose exactement cela, et rien de plus.
create or replace view public.shop_public_settings as
  select shop_name,
         tagline,
         contact_email,
         support_phone,
         currency,
         default_locale,
         vat_rate,
         prices_include_vat,
         free_shipping_above,
         address,
         social,
         announcement
    from public.shop_settings
   where id;

comment on view public.shop_public_settings is
  'Sous-ensemble publiable de shop_settings. Les objectifs économiques '
  '(marge cible, CAC, charges fixes) restent réservés à l''équipe.';
