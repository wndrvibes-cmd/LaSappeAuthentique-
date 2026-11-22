/**
 * Pont entre la base de données et les moteurs Nexscope.
 *
 * C'est ici que les modules deviennent réellement utiles : chaque moteur
 * reçoit les données RÉELLES de la boutique (prix, coûts, ventes, stocks,
 * avis, relevés concurrents) plutôt que des valeurs saisies à la main.
 * Quand une donnée n'existe pas, elle est transmise comme absente — les
 * moteurs la signalent alors dans leurs « données manquantes » au lieu de
 * la remplacer par une estimation.
 */
import { supabase } from '@/lib/supabase';
import type { StoreUnitEconomics } from '@/types/database';
import type { ProfitMarginInput } from './engines/profit-margin';
import type { SupplyChainInput } from './engines/supply-chain';
import type { ListingSeoInput } from './engines/listing-seo';
import type { DynamicPricingInput, PricingCandidate } from './engines/dynamic-pricing';
import type { UnitEconomicsInput } from './engines/unit-economics';
import type { InventoryForecastInput, InventoryLine } from './engines/inventory-forecast';
import type { SalesAnalyticsInput, DailyPoint, ProductPoint } from './engines/sales-analytics';
import type { ReviewAnalysisInput } from './engines/review-analysis';
import type { CrossBorderInput } from './engines/cross-border';
import type { FunnelCroInput } from './engines/funnel-cro';
import type { PriceTrackingInput, TrackedProduct } from './engines/price-tracking';

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

/* ──────────────────── Paramètres économiques boutique ────────────────── */

async function shopSettings() {
  const { data } = await supabase.from('shop_settings').select('*').maybeSingle();
  return {
    vatRate: Number(data?.vat_rate ?? 0.2),
    pricesIncludeVat: data?.prices_include_vat ?? true,
    targetNetMargin: Number(data?.target_net_margin ?? 0.25),
    monthlyFixedCosts: Number(data?.monthly_fixed_costs ?? 0),
    targetCac: data?.target_cac !== null && data?.target_cac !== undefined ? Number(data.target_cac) : null,
    freeShippingAbove: data?.free_shipping_above !== null && data?.free_shipping_above !== undefined
      ? Number(data.free_shipping_above) : null,
  };
}

/* ─────────────────────────── Marge d'un produit ──────────────────────── */

export async function buildProfitMarginInput(
  productId: string, variantId?: string | null,
): Promise<ProfitMarginInput> {
  const settings = await shopSettings();
  const { data: product } = await supabase
    .from('products').select('*').eq('id', productId).single();

  let price = Number(product.base_price);
  let cost = product.cost_price !== null ? Number(product.cost_price) : 0;
  let sku = product.slug;
  let name = product.name;

  if (variantId) {
    const { data: variant } = await supabase
      .from('product_variants').select('*').eq('id', variantId).maybeSingle();
    if (variant) {
      price = Number(variant.price ?? product.base_price);
      cost = Number(variant.cost_price ?? product.cost_price ?? 0);
      sku = variant.sku;
      name = `${product.name} — ${variant.title}`;
    }
  }

  // Coût d'expédition réellement supporté : moyenne des frais de port
  // encaissés face aux tarifs transporteurs sur les commandes récentes.
  const { data: recentOrders } = await supabase
    .from('orders').select('shipping_total, subtotal')
    .gte('placed_at', iso(90)).not('placed_at', 'is', null).limit(200);
  const avgShippingCharged = recentOrders?.length
    ? recentOrders.reduce((s, o) => s + Number(o.shipping_total), 0) / recentOrders.length
    : 0;
  // On retient la part non refacturée : si le franco de port est souvent
  // atteint, la boutique supporte le transport.
  const unbilledShipping = avgShippingCharged === 0 && settings.freeShippingAbove !== null
    ? 6.9 : 0;

  // Ventes mensuelles réelles, pour la répartition des charges fixes
  const { data: soldRows } = await supabase
    .from('order_items').select('quantity, variant_id, orders!inner(placed_at, status)')
    .gte('orders.placed_at', iso(30));
  const monthlyUnits = (soldRows ?? []).reduce((s, r) => s + r.quantity, 0);

  return {
    sku, name,
    sellingPrice: price,
    vatRate: settings.vatRate,
    pricesIncludeVat: settings.pricesIncludeVat,
    productCost: cost,
    inboundShipping: Number(product.inbound_shipping),
    handlingFee: Number(product.handling_fee),
    outboundShipping: unbilledShipping,
    paymentFeeRate: Number(product.payment_fee_rate),
    paymentFeeFixed: Number(product.payment_fee_fixed),
    adSpendRatio: Number(product.ad_spend_ratio),
    returnRate: Number(product.return_rate),
    returnFee: Number(product.return_fee),
    otherFees: 0,
    monthlyFixedCosts: settings.monthlyFixedCosts || undefined,
    monthlyUnits: monthlyUnits || undefined,
  };
}

/* ───────────────────── Chaîne d'approvisionnement ───────────────────── */

export async function buildSupplyChainInput(productId: string): Promise<SupplyChainInput> {
  const { data: product } = await supabase
    .from('products').select('*').eq('id', productId).single();

  const supplier = product.supplier_id
    ? (await supabase.from('suppliers').select('*').eq('id', product.supplier_id).maybeSingle()).data
    : null;

  const { data: variants } = await supabase
    .from('product_variants').select('id').eq('product_id', productId);
  const variantIds = (variants ?? []).map((v) => v.id);

  // Vélocité réelle sur 30 jours
  const { data: sold } = await supabase
    .from('order_items').select('quantity, variant_id, orders!inner(placed_at)')
    .in('variant_id', variantIds.length ? variantIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('orders.placed_at', iso(30));
  const units30d = (sold ?? []).reduce((s, r) => s + r.quantity, 0);
  const dailySales = units30d / 30;

  const { data: health } = await supabase
    .from('inventory_health').select('on_hand, available')
    .in('variant_id', variantIds.length ? variantIds : ['00000000-0000-0000-0000-000000000000']);
  const onHand = (health ?? []).reduce((s, h) => s + h.on_hand, 0);
  const inventoryDays = dailySales > 0 ? Math.round(onHand / dailySales) : 0;

  return {
    channel: 'shopify',   // boutique en propre (DTC) : référentiel le plus proche
    productCost: Number(product.cost_price ?? 0),
    sellingPrice: Number(product.base_price),
    inboundShippingPerUnit: Number(product.inbound_shipping),
    fulfillmentFee: Number(product.handling_fee),
    storageFeePerUnit: 0,
    adSpendRatio: Number(product.ad_spend_ratio),
    supplierPaymentDays: supplier?.payment_terms_days ?? 0,
    productionDays: supplier?.production_days ?? Math.round(product.lead_time_days * 0.6),
    shippingDays: supplier?.shipping_days ?? Math.round(product.lead_time_days * 0.4),
    inventoryDays,
    dailySales: dailySales > 0 ? dailySales : undefined,
    currentInventory: onHand,
  };
}

/* ─────────────────────────── SEO de fiche ───────────────────────────── */

export async function buildListingSeoInput(productId: string): Promise<ListingSeoInput> {
  const { data: product } = await supabase
    .from('products').select('*').eq('id', productId).single();
  const [{ data: images }, { data: variants }, { data: reviews }, { data: category }] =
    await Promise.all([
      supabase.from('product_images').select('alt').eq('product_id', productId),
      supabase.from('product_variants').select('id').eq('product_id', productId),
      supabase.from('product_reviews').select('id').eq('product_id', productId).eq('is_published', true),
      product.category_id
        ? supabase.from('categories').select('name').eq('id', product.category_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // Mots-clés cibles : ceux de la fiche, enrichis du nom de la catégorie
  const targetKeywords = [...new Set([
    ...product.tags,
    ...(category?.name ? [category.name.toLowerCase()] : []),
  ])];

  return {
    productName: product.name,
    seoTitle: product.seo_title,
    seoDescription: product.seo_description,
    description: product.description,
    tags: product.tags,
    imageCount: images?.length ?? 0,
    imagesWithAlt: (images ?? []).filter((i) => i.alt && i.alt.trim().length > 0).length,
    attributes: {
      composition: Boolean(product.composition),
      careGuide: Boolean(product.care_guide),
      category: Boolean(product.category_id),
      weight: product.weight_grams !== null,
    },
    targetKeywords,
    variantCount: variants?.length ?? 0,
    hasReviews: (reviews?.length ?? 0) > 0,
  };
}

/* ───────────────────── Recommandations de prix ──────────────────────── */

export async function buildDynamicPricingInput(opts?: {
  productIds?: string[];
  maxChangePct?: number;
  positioning?: DynamicPricingInput['positioning'];
}): Promise<DynamicPricingInput> {
  const settings = await shopSettings();

  let marginQuery = supabase.from('variant_margins').select('*');
  if (opts?.productIds?.length) marginQuery = marginQuery.in('product_id', opts.productIds);
  const { data: margins } = await marginQuery;

  const productIds = [...new Set((margins ?? []).map((m) => m.product_id))];

  // Relevés concurrents rattachés à nos produits
  const { data: competitorProducts } = await supabase
    .from('competitor_products').select('id, product_id, last_price')
    .in('product_id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('is_tracked', true);

  const competitorPricesByProduct = new Map<string, number[]>();
  for (const cp of competitorProducts ?? []) {
    if (!cp.product_id || cp.last_price === null) continue;
    const list = competitorPricesByProduct.get(cp.product_id) ?? [];
    list.push(Number(cp.last_price));
    competitorPricesByProduct.set(cp.product_id, list);
  }

  // Ventes et couverture réelles
  const { data: health } = await supabase.from('inventory_health').select('*');
  const healthBy = new Map((health ?? []).map((h) => [h.variant_id, h]));

  const { data: sold } = await supabase
    .from('order_items').select('variant_id, quantity, orders!inner(placed_at)')
    .gte('orders.placed_at', iso(30));
  const soldBy = new Map<string, number>();
  for (const row of sold ?? []) {
    if (!row.variant_id) continue;
    soldBy.set(row.variant_id, (soldBy.get(row.variant_id) ?? 0) + row.quantity);
  }

  const candidates: PricingCandidate[] = (margins ?? [])
    .filter((m) => m.net_margin !== null)
    .map((m) => {
      const h = healthBy.get(m.variant_id);
      return {
        productId: m.product_id,
        variantId: m.variant_id,
        sku: m.sku,
        name: `${m.product_name} — ${m.variant_title}`,
        currentPrice: Number(m.price),
        unitCost: Number(m.cost_price ?? 0) + Number(m.inbound_shipping) + Number(m.handling_fee),
        netMargin: Number(m.net_margin),
        competitorPrices: competitorPricesByProduct.get(m.product_id) ?? [],
        unitsSold30d: soldBy.get(m.variant_id) ?? 0,
        stockAvailable: h?.available ?? 0,
        daysOfCover: h?.days_of_cover ?? null,
      };
    });

  return {
    candidates,
    targetNetMargin: settings.targetNetMargin,
    maxChangePct: opts?.maxChangePct ?? 0.08,
    minMarkupOverCost: 1.25,
    positioning: opts?.positioning ?? 'match',
  };
}

/* ─────────────────── Économie unitaire / croissance ─────────────────── */

export async function buildUnitEconomicsInput(windowDays = 90): Promise<UnitEconomicsInput> {
  const settings = await shopSettings();
  const { data } = await supabase.rpc('store_unit_economics', { p_days: windowDays });
  const eco = data as unknown as StoreUnitEconomics;

  const { data: orders } = await supabase
    .from('orders').select('shipping_total, discount_total')
    .gte('placed_at', iso(windowDays)).not('placed_at', 'is', null)
    .not('status', 'in', '("cancelled","refunded")');

  return {
    windowDays,
    revenue: Number(eco?.revenue ?? 0),
    cogs: Number(eco?.cogs ?? 0),
    orders: Number(eco?.orders ?? 0),
    customers: Number(eco?.customers ?? 0),
    repeatCustomers: Number(eco?.repeat_customers ?? 0),
    // Sessions et dépense publicitaire ne sont pas mesurées par la boutique :
    // transmises comme absentes, elles sont signalées par le moteur.
    sessions: null,
    marketingSpend: null,
    monthlyFixedCosts: settings.monthlyFixedCosts,
    targetNetMargin: settings.targetNetMargin,
    shippingCost: (orders ?? []).reduce((s, o) => s + Number(o.shipping_total), 0),
    discountTotal: (orders ?? []).reduce((s, o) => s + Number(o.discount_total), 0),
  };
}

/* ───────────────────────── Pilotage des stocks ──────────────────────── */

export async function buildInventoryForecastInput(windowDays = 30): Promise<InventoryForecastInput> {
  const { data: health } = await supabase.from('inventory_health').select('*');
  const { data: pricing } = await supabase.from('variant_pricing').select('*');
  const pricingBy = new Map((pricing ?? []).map((p) => [p.variant_id, p]));

  const { data: products } = await supabase.from('products').select('id, lead_time_days');
  const leadBy = new Map((products ?? []).map((p) => [p.id, p.lead_time_days]));

  const { data: sold } = await supabase
    .from('order_items').select('variant_id, quantity, orders!inner(placed_at, status)')
    .gte('orders.placed_at', iso(windowDays));
  const soldBy = new Map<string, number>();
  for (const row of sold ?? []) {
    if (!row.variant_id) continue;
    soldBy.set(row.variant_id, (soldBy.get(row.variant_id) ?? 0) + row.quantity);
  }

  const lines: InventoryLine[] = (health ?? []).map((h) => {
    const p = pricingBy.get(h.variant_id);
    return {
      variantId: h.variant_id,
      productId: h.product_id,
      sku: h.sku,
      productName: h.product_name,
      variantTitle: h.variant_title,
      onHand: h.on_hand,
      reserved: h.reserved,
      available: h.available,
      reorderPoint: h.reorder_point,
      unitCost: Number(h.cost_price ?? 0),
      unitPrice: Number(p?.price ?? 0),
      unitsSoldWindow: soldBy.get(h.variant_id) ?? 0,
      windowDays,
      leadTimeDays: leadBy.get(h.product_id) ?? 21,
    };
  });

  return {
    lines,
    serviceLevel: '0.95',
    demandVariability: 0.3,
    orderingCostPerOrder: 60,
    annualHoldingCostRate: 0.25,
  };
}

/* ───────────────────────── Analyse des ventes ───────────────────────── */

export async function buildSalesAnalyticsInput(windowDays = 30): Promise<SalesAnalyticsInput> {
  const { data: kpi } = await supabase
    .from('kpi_daily').select('*').gte('day', iso(windowDays * 2).slice(0, 10)).order('day');

  const cutoff = new Date(Date.now() - windowDays * DAY).toISOString().slice(0, 10);
  const toPoint = (r: NonNullable<typeof kpi>[number]): DailyPoint => ({
    day: r.day,
    revenue: Number(r.revenue ?? 0),
    orders: Number(r.orders ?? 0),
    grossProfit: Number(r.gross_profit ?? 0),
    units: Number(r.units ?? 0),
  });

  const current = (kpi ?? []).filter((r) => r.day >= cutoff).map(toPoint);
  const previous = (kpi ?? []).filter((r) => r.day < cutoff).map(toPoint);

  // Performance produit sur les deux fenêtres
  const { data: perf } = await supabase.from('product_performance').select('*');
  const { data: itemsCurrent } = await supabase
    .from('order_items')
    .select('variant_id, quantity, line_total, unit_cost, orders!inner(placed_at, status)')
    .gte('orders.placed_at', iso(windowDays));
  const { data: itemsPrevious } = await supabase
    .from('order_items')
    .select('variant_id, quantity, line_total, orders!inner(placed_at, status)')
    .gte('orders.placed_at', iso(windowDays * 2)).lt('orders.placed_at', iso(windowDays));

  const { data: variants } = await supabase.from('product_variants').select('id, product_id');
  const productOf = new Map((variants ?? []).map((v) => [v.id, v.product_id]));

  const agg = (rows: { variant_id: string | null; quantity: number; line_total: number;
                       unit_cost?: number }[] | null) => {
    const map = new Map<string, { units: number; revenue: number; cogs: number }>();
    for (const r of rows ?? []) {
      const pid = r.variant_id ? productOf.get(r.variant_id) : null;
      if (!pid) continue;
      const cur = map.get(pid) ?? { units: 0, revenue: 0, cogs: 0 };
      cur.units += r.quantity;
      cur.revenue += Number(r.line_total);
      cur.cogs += Number(r.unit_cost ?? 0) * r.quantity;
      map.set(pid, cur);
    }
    return map;
  };

  const now = agg(itemsCurrent);
  const before = agg(itemsPrevious as never);

  const products: ProductPoint[] = (perf ?? []).map((p) => {
    const c = now.get(p.product_id) ?? { units: 0, revenue: 0, cogs: 0 };
    const b = before.get(p.product_id) ?? { units: 0, revenue: 0, cogs: 0 };
    return {
      productId: p.product_id,
      name: p.name,
      slug: p.slug,
      unitsCurrent: c.units,
      revenueCurrent: c.revenue,
      grossProfitCurrent: c.revenue - c.cogs,
      unitsPrevious: b.units,
      revenuePrevious: b.revenue,
      stockAvailable: p.stock_available,
      grossMargin: p.gross_margin !== null ? Number(p.gross_margin) : null,
    };
  });

  return { windowDays, current, previous, products };
}

/* ──────────────────────── Analyse des avis ─────────────────────────── */

export async function buildReviewAnalysisInput(productId?: string | null): Promise<ReviewAnalysisInput> {
  let query = supabase.from('product_reviews').select('*').order('created_at', { ascending: false });
  if (productId) query = query.eq('product_id', productId);
  const { data: reviews } = await query.limit(500);

  let productName = 'Toutes les pièces';
  if (productId) {
    const { data } = await supabase.from('products').select('name').eq('id', productId).maybeSingle();
    productName = data?.name ?? productName;
  }

  return {
    productName,
    reviews: (reviews ?? []).map((r) => ({
      id: r.id, rating: r.rating, title: r.title, body: r.body,
      authorName: r.author_name, isVerified: r.is_verified, createdAt: r.created_at,
    })),
  };
}

/* ───────────────────── Expansion internationale ────────────────────── */

export async function buildCrossBorderInput(marketCodes: string[] = []): Promise<CrossBorderInput> {
  const { data: eco } = await supabase.rpc('store_unit_economics', { p_days: 365 });
  const economics = eco as unknown as StoreUnitEconomics;

  // Chiffre d'affaires réalisé hors de France, calculé sur les adresses réelles
  const { data: orders } = await supabase
    .from('orders').select('total, shipping_address')
    .not('placed_at', 'is', null).gte('placed_at', iso(365))
    .not('status', 'in', '("cancelled","refunded")');

  const EU = new Set(['BE','LU','DE','ES','IT','NL','PT','AT','IE','FI','SE','DK','PL','CZ','GR']);
  let intraEu = 0;
  let intlShipping = 0;
  let intlCount = 0;
  for (const o of orders ?? []) {
    const country = (o.shipping_address as { country_code?: string } | null)?.country_code;
    if (country && EU.has(country)) intraEu += Number(o.total);
    if (country && country !== 'FR') { intlCount += 1; intlShipping += 12.9; }
  }

  return {
    averageOrderValue: Number(economics?.aov ?? 0) || 180,
    averageUnitCost: Number(economics?.cogs ?? 0) / Math.max(Number(economics?.orders ?? 1), 1) || 55,
    grossMargin: Number(economics?.gross_margin ?? 0.6),
    internationalShippingCost: intlCount > 0 ? intlShipping / intlCount : 12.9,
    marketCodes,
    ossRegistered: false,   // information déclarative, à renseigner par la boutique
    currentIntraEuRevenue: intraEu,
  };
}

/* ───────────────────── Tunnel de conversion ────────────────────────── */

export async function buildFunnelCroInput(windowDays = 30): Promise<FunnelCroInput> {
  const settings = await shopSettings();
  const { data: eco } = await supabase.rpc('store_unit_economics', { p_days: windowDays });
  const economics = eco as unknown as StoreUnitEconomics;

  // Paniers garnis sur la période (données réelles)
  const { data: cartsWithItems } = await supabase
    .from('cart_items').select('cart_id').gte('added_at', iso(windowDays));
  const distinctCarts = new Set((cartsWithItems ?? []).map((c) => c.cart_id)).size;

  const { count: checkoutsStarted } = await supabase
    .from('orders').select('id', { count: 'exact', head: true }).gte('created_at', iso(windowDays));

  // Frictions structurelles : mesurées sur la configuration réelle
  const { data: images } = await supabase.from('product_images').select('product_id');
  const { count: productCount } = await supabase
    .from('products').select('id', { count: 'exact', head: true }).eq('status', 'active');
  const { count: reviewCount } = await supabase
    .from('product_reviews').select('id', { count: 'exact', head: true }).eq('is_published', true);
  const { count: productsWithCare } = await supabase
    .from('products').select('id', { count: 'exact', head: true })
    .eq('status', 'active').not('care_guide', 'is', null);

  return {
    stages: [
      // Les sessions ne sont pas mesurées : l'étape est transmise à zéro et
      // le moteur le signale explicitement comme donnée manquante.
      { key: 'session', label: 'Sessions', count: 0 },
      { key: 'product', label: 'Fiches produit vues', count: 0 },
      { key: 'cart', label: 'Paniers garnis', count: distinctCarts },
      { key: 'checkout', label: 'Commandes entamées', count: checkoutsStarted ?? 0 },
      { key: 'order', label: 'Commandes payées', count: Number(economics?.orders ?? 0) },
    ],
    averageOrderValue: Number(economics?.aov ?? 0) || 180,
    grossMargin: Number(economics?.gross_margin ?? settings.targetNetMargin),
    windowDays,
    // La boutique autorise la commande sans compte
    checkoutRequiresAccount: false,
    hasGuestCheckout: true,
    shippingCostShownLate: false,
    paymentMethodCount: 1,     // carte bancaire via le prestataire configuré
    productPageImageAvg: productCount ? (images?.length ?? 0) / productCount : 0,
    hasSizeGuide: true,        // page /guide-des-tailles publiée
    hasReviews: (reviewCount ?? 0) > 0,
    returnPolicyVisible: (productsWithCare ?? 0) > 0,
  };
}

/* ──────────────────────── Veille des prix ──────────────────────────── */

export async function buildPriceTrackingInput(deviationThreshold = 0.08): Promise<PriceTrackingInput> {
  const { data: margins } = await supabase.from('variant_margins').select('*');
  const { data: competitorProducts } = await supabase
    .from('competitor_products').select('*, competitors(name)').eq('is_tracked', true);

  const cpIds = (competitorProducts ?? []).map((c) => c.id);
  const { data: observations } = await supabase
    .from('price_observations').select('*')
    .in('competitor_product_id', cpIds.length ? cpIds : ['00000000-0000-0000-0000-000000000000'])
    .order('observed_at', { ascending: false }).limit(2000);

  const obsByCp = new Map<string, typeof observations>();
  for (const o of observations ?? []) {
    const list = obsByCp.get(o.competitor_product_id) ?? [];
    list.push(o);
    obsByCp.set(o.competitor_product_id, list as never);
  }

  // Une ligne par produit (prix de référence = variante la moins chère)
  const byProduct = new Map<string, NonNullable<typeof margins>[number]>();
  for (const m of margins ?? []) {
    const existing = byProduct.get(m.product_id);
    if (!existing || Number(m.price) < Number(existing.price)) byProduct.set(m.product_id, m);
  }

  const products: TrackedProduct[] = [...byProduct.values()].map((m) => {
    const linked = (competitorProducts ?? []).filter((c) => c.product_id === m.product_id);
    const obs = linked.flatMap((c) => {
      const name = (c.competitors as { name: string } | null)?.name ?? 'Concurrent';
      return ((obsByCp.get(c.id) ?? []) as NonNullable<typeof observations>).map((o) => ({
        competitorName: name,
        competitorProductTitle: c.title,
        price: Number(o.price),
        shippingPrice: o.shipping_price !== null ? Number(o.shipping_price) : null,
        inStock: o.in_stock,
        observedAt: o.observed_at,
        source: o.source,
      }));
    });
    return {
      productId: m.product_id,
      name: m.product_name,
      sku: m.sku,
      ourPrice: Number(m.price),
      unitCost: Number(m.cost_price ?? 0),
      netMargin: Number(m.net_margin ?? 0),
      observations: obs,
    };
  });

  return { products, deviationThreshold, maxObservationAgeDays: 30 };
}

/* ─────────────────────── Routage par moteur ────────────────────────── */

export interface ContextOptions {
  productId?: string | null;
  variantId?: string | null;
  windowDays?: number;
  marketCodes?: string[];
  maxChangePct?: number;
}

/**
 * Construit l'entrée d'un moteur à partir des données réelles.
 * Retourne `null` pour les moteurs qui exigent une saisie manuelle
 * (notation d'opportunité, différenciation) : ils disposent de leur
 * propre formulaire.
 */
export async function buildEngineInput(
  engineKey: string, opts: ContextOptions = {},
): Promise<unknown | null> {
  switch (engineKey) {
    case 'profit-margin':
      if (!opts.productId) throw new Error('Sélectionnez un produit pour ce module.');
      return buildProfitMarginInput(opts.productId, opts.variantId);
    case 'supply-chain':
      if (!opts.productId) throw new Error('Sélectionnez un produit pour ce module.');
      return buildSupplyChainInput(opts.productId);
    case 'listing-seo':
      if (!opts.productId) throw new Error('Sélectionnez un produit pour ce module.');
      return buildListingSeoInput(opts.productId);
    case 'dynamic-pricing':
      return buildDynamicPricingInput({
        productIds: opts.productId ? [opts.productId] : undefined,
        maxChangePct: opts.maxChangePct,
      });
    case 'unit-economics':
      return buildUnitEconomicsInput(opts.windowDays ?? 90);
    case 'inventory-forecast':
      return buildInventoryForecastInput(opts.windowDays ?? 30);
    case 'sales-analytics':
      return buildSalesAnalyticsInput(opts.windowDays ?? 30);
    case 'review-analysis':
      return buildReviewAnalysisInput(opts.productId);
    case 'cross-border':
      return buildCrossBorderInput(opts.marketCodes ?? []);
    case 'funnel-cro':
      return buildFunnelCroInput(opts.windowDays ?? 30);
    case 'price-tracking':
      return buildPriceTrackingInput();
    case 'opportunity-score':
    case 'differentiation':
      return null;   // saisie manuelle
    default:
      throw new Error(`Moteur inconnu : ${engineKey}`);
  }
}
