/**
 * Edge Function — exécution d'une automatisation.
 *
 * Appelée soit manuellement depuis le back-office, soit par une tâche
 * planifiée (pg_cron) qui lui transmet les automatisations dues.
 *
 * GARDE-FOU CENTRAL DU PROJET : cette fonction n'applique JAMAIS un
 * changement de prix, une dépense publicitaire ou une commande fournisseur.
 * Elle observe, calcule, et crée :
 *   • des ALERTES, pour ce qui doit être su ;
 *   • des DEMANDES D'APPROBATION, pour ce qui doit être décidé.
 *
 * L'application effective passe par la fonction SQL `apply_approval()`, qui
 * vérifie le rôle de l'appelant, l'existence d'une décision et la date
 * d'expiration avant toute écriture.
 */
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { requireStaff, serviceClient } from '../_shared/supabase.ts';

type Db = ReturnType<typeof serviceClient>;

interface Payload {
  automationId?: string;
  triggerSource?: 'manual' | 'schedule' | 'webhook';
  /** Jeton partagé, pour un appel planifié sans session utilisateur. */
  cronSecret?: string;
}

interface Finding { severity: string; title: string; detail: string }

interface Outcome {
  summary: string;
  findings: Finding[];
  approvalsCreated: number;
  alertsCreated: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `${round2(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`;
const pct = (n: number) => `${(n * 100).toFixed(1)} %`;

/* ─────────────────────────── Alerte de stock ─────────────────────────── */

async function runStockAlert(db: Db, automationId: string): Promise<Outcome> {
  const { data: health } = await db
    .from('inventory_health').select('*').eq('needs_restock', true);

  const rows = health ?? [];
  const stockouts = rows.filter((h) => h.available <= 0);
  const low = rows.filter((h) => h.available > 0);
  let alertsCreated = 0;

  for (const h of rows) {
    // Pas de doublon : une alerte ouverte suffit
    const { data: existing } = await db.from('alerts').select('id')
      .eq('variant_id', h.variant_id).eq('is_resolved', false)
      .in('kind', ['low_stock', 'out_of_stock']).maybeSingle();
    if (existing) continue;

    await db.from('alerts').insert({
      kind: h.available <= 0 ? 'out_of_stock' : 'low_stock',
      severity: h.available <= 0 ? 'critical' : 'warning',
      title: h.available <= 0
        ? `Rupture — ${h.product_name}`
        : `Stock bas — ${h.product_name}`,
      message:
        `${h.product_name} (${h.variant_title}) : ${h.available} unité(s) disponible(s), ` +
        `seuil fixé à ${h.reorder_point}.` +
        (h.days_of_cover !== null ? ` Couverture restante : ${h.days_of_cover} jours.` : ''),
      data: {
        available: h.available, reorder_point: h.reorder_point,
        daily_velocity: h.daily_velocity, days_of_cover: h.days_of_cover,
      },
      product_id: h.product_id,
      variant_id: h.variant_id,
      automation_id: automationId,
    });
    alertsCreated += 1;
  }

  return {
    summary: rows.length === 0
      ? 'Aucune référence sous son seuil de réapprovisionnement.'
      : `${stockouts.length} rupture(s) et ${low.length} référence(s) sous le seuil. ` +
        `${alertsCreated} nouvelle(s) alerte(s).`,
    findings: rows.slice(0, 20).map((h) => ({
      severity: h.available <= 0 ? 'critical' : 'warning',
      title: `${h.product_name} — ${h.variant_title}`,
      detail: `${h.available} disponible(s), seuil ${h.reorder_point}`,
    })),
    approvalsCreated: 0,
    alertsCreated,
  };
}

/* ───────────────────── Marges sous l'objectif ────────────────────────── */

async function runMarginAnalysis(db: Db, automationId: string): Promise<Outcome> {
  const [{ data: settings }, { data: margins }] = await Promise.all([
    db.from('shop_settings').select('target_net_margin').maybeSingle(),
    db.from('variant_margins').select('*'),
  ]);

  const target = Number(settings?.target_net_margin ?? 0.25);
  const below = (margins ?? [])
    .filter((m) => m.net_margin !== null && Number(m.net_margin) < target)
    .sort((a, b) => Number(a.net_margin) - Number(b.net_margin));
  const atLoss = below.filter((m) => Number(m.net_margin) < 0);

  let alertsCreated = 0;

  // Une seule alerte de synthèse, pour ne pas noyer le back-office
  if (below.length > 0) {
    const { data: existing } = await db.from('alerts').select('id')
      .eq('kind', 'margin_below_target').eq('is_resolved', false)
      .eq('automation_id', automationId).maybeSingle();

    if (!existing) {
      await db.from('alerts').insert({
        kind: 'margin_below_target',
        severity: atLoss.length > 0 ? 'critical' : 'warning',
        title: atLoss.length > 0
          ? `${atLoss.length} référence(s) vendue(s) à perte`
          : `${below.length} référence(s) sous l'objectif de marge`,
        message:
          `Objectif : ${pct(target)} de marge nette. ` +
          `${below.length} référence(s) en dessous` +
          (atLoss.length > 0 ? `, dont ${atLoss.length} à perte` : '') + '. ' +
          `Les plus éloignées : ${below.slice(0, 3).map((m) => `${m.product_name} (${pct(Number(m.net_margin))})`).join(', ')}.`,
        data: {
          target, below_count: below.length, at_loss_count: atLoss.length,
          worst: below.slice(0, 10).map((m) => ({
            sku: m.sku, product: m.product_name,
            net_margin: m.net_margin, price: m.price,
          })),
        },
        automation_id: automationId,
      });
      alertsCreated = 1;
    }
  }

  return {
    summary: below.length === 0
      ? `Toutes les références atteignent l'objectif de ${pct(target)}.`
      : `${below.length} référence(s) sous l'objectif de ${pct(target)}` +
        (atLoss.length > 0 ? `, dont ${atLoss.length} à perte` : '') + '.',
    findings: below.slice(0, 20).map((m) => ({
      severity: Number(m.net_margin) < 0 ? 'critical' : 'warning',
      title: `${m.product_name} — ${m.variant_title}`,
      detail: `Marge nette ${pct(Number(m.net_margin))} au prix de ${eur(Number(m.price))}`,
    })),
    approvalsCreated: 0,
    alertsCreated,
  };
}

/* ─────────────────── Recommandation de prix encadrée ─────────────────── */

async function runPriceRecommendation(
  db: Db, automationId: string, config: Record<string, unknown>, maxChangePct: number,
): Promise<Outcome> {
  const [{ data: settings }, { data: margins }, { data: competitorProducts }] = await Promise.all([
    db.from('shop_settings').select('target_net_margin').maybeSingle(),
    db.from('variant_margins').select('*'),
    db.from('competitor_products').select('product_id, last_price, last_checked_at')
      .eq('is_tracked', true).not('last_price', 'is', null),
  ]);

  const target = Number(config.target_margin ?? settings?.target_net_margin ?? 0.25);
  const bound = Number(config.max_change_pct ?? maxChangePct ?? 0.08);
  const minMarkup = 1.25;

  // Médiane des prix concurrents récents, par produit
  const freshCutoff = Date.now() - 30 * 86400000;
  const pricesByProduct = new Map<string, number[]>();
  for (const cp of competitorProducts ?? []) {
    if (!cp.product_id || !cp.last_checked_at) continue;
    if (new Date(cp.last_checked_at).getTime() < freshCutoff) continue;
    const list = pricesByProduct.get(cp.product_id) ?? [];
    list.push(Number(cp.last_price));
    pricesByProduct.set(cp.product_id, list);
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const changes: Record<string, unknown>[] = [];
  const findings: Finding[] = [];

  for (const m of margins ?? []) {
    if (m.net_margin === null) continue;
    const currentMargin = Number(m.net_margin);
    if (currentMargin >= target) continue;

    const currentPrice = Number(m.price);
    // Coût complet implicite déduit de la marge nette réelle
    const impliedCost = currentPrice * (1 - currentMargin);
    let proposed = impliedCost / (1 - target);

    const marketPrices = pricesByProduct.get(m.product_id);
    let reason = `marge actuelle ${pct(currentMargin)} sous l'objectif de ${pct(target)}`;
    if (marketPrices?.length) {
      const med = median(marketPrices);
      // On ne dépasse pas la médiane marché sans raison : prudence
      if (proposed > med * 1.15) {
        proposed = Math.max(med * 1.05, currentPrice);
        reason += ` ; proposition contenue près de la médiane marché (${eur(med)})`;
      } else {
        reason += ` ; médiane marché à ${eur(med)}`;
      }
    }

    // Garde-fous : borne de variation, puis prix plancher
    const maxUp = currentPrice * (1 + bound);
    let bounded = Math.min(proposed, maxUp);
    const floor = impliedCost * minMarkup;
    let note = '';
    if (bounded < floor) {
      if (floor <= maxUp) {
        bounded = floor;
      } else {
        bounded = maxUp;
        note = ` La hausse est plafonnée à ${pct(bound)} : le prix plancher de ` +
               `${eur(floor)} ne peut pas être atteint en une seule passe.`;
      }
    }
    // Arrondi psychologique, re-borné pour ne jamais franchir la limite
    let finalPrice = round2(Math.floor(bounded) + 0.9);
    if (finalPrice > maxUp) finalPrice = round2(Math.floor(bounded) - 0.1);
    if (finalPrice <= currentPrice) continue;

    const changePct = (finalPrice - currentPrice) / currentPrice;
    if (Math.abs(changePct) < 0.01) continue;

    changes.push({
      product_id: m.product_id,
      variant_id: m.variant_id,
      sku: m.sku,
      name: `${m.product_name} — ${m.variant_title}`,
      current_price: currentPrice,
      new_price: finalPrice,
      change_pct: round2(changePct * 10000) / 10000,
      reason: reason + note,
    });
    findings.push({
      severity: 'warning',
      title: `${m.product_name} — ${m.variant_title}`,
      detail: `${eur(currentPrice)} → ${eur(finalPrice)} (${pct(changePct)}) · ${reason}`,
    });
  }

  if (changes.length === 0) {
    return {
      summary: `Aucun ajustement de prix nécessaire : toutes les références atteignent ${pct(target)}.`,
      findings: [], approvalsCreated: 0, alertsCreated: 0,
    };
  }

  // Une seule demande d'approbation groupée, jamais appliquée automatiquement
  const estimatedImpact = changes.reduce(
    (s, c) => s + (Number(c.new_price) - Number(c.current_price)), 0);

  const { error } = await db.from('approval_requests').insert({
    action_type: changes.length > 1 ? 'bulk_price_change' : 'price_change',
    risk: 'high',
    status: 'pending',
    title: `Ajustement de ${changes.length} prix pour atteindre ${pct(target)} de marge`,
    rationale:
      `Généré par l'automatisation de recommandation de prix.\n\n` +
      `${changes.length} référence(s) sont sous l'objectif de marge nette de ${pct(target)}. ` +
      `Les hausses proposées sont bornées à ±${pct(bound)} par passe et ne descendent ` +
      `jamais sous ${minMarkup}× le coût complet.\n\n` +
      `Gain de marge estimé : ${eur(estimatedImpact)} par unité vendue, cumulé sur ces ` +
      `références. Aucune modification n'a été appliquée : votre validation est requise.`,
    payload: {
      changes,
      guardrails: {
        max_change_pct: bound, min_markup_over_cost: minMarkup, target_net_margin: target,
      },
    },
    previous_state: changes.map((c) => ({
      variant_id: c.variant_id, sku: c.sku, price: c.current_price,
    })),
    estimated_impact: {
      references: changes.length,
      gain_par_unite_cumule: round2(estimatedImpact),
    },
    source_automation_id: automationId,
  });

  return {
    summary:
      `${changes.length} ajustement(s) de prix proposé(s), soumis à approbation. ` +
      `Aucune modification appliquée.`,
    findings: findings.slice(0, 20),
    approvalsCreated: error ? 0 : 1,
    alertsCreated: 0,
  };
}

/* ────────────────────── Veille des prix concurrents ──────────────────── */

async function runPriceAlert(
  db: Db, automationId: string, config: Record<string, unknown>,
): Promise<Outcome> {
  const threshold = Number(config.deviation_threshold ?? 0.08);
  const [{ data: margins }, { data: competitorProducts }] = await Promise.all([
    db.from('variant_margins').select('*'),
    db.from('competitor_products')
      .select('product_id, title, last_price, last_checked_at, competitors(name)')
      .eq('is_tracked', true).not('last_price', 'is', null),
  ]);

  const freshCutoff = Date.now() - 30 * 86400000;
  const byProduct = new Map<string, { prices: number[]; names: string[] }>();
  for (const cp of competitorProducts ?? []) {
    if (!cp.product_id || !cp.last_checked_at) continue;
    if (new Date(cp.last_checked_at).getTime() < freshCutoff) continue;
    const entry = byProduct.get(cp.product_id) ?? { prices: [], names: [] };
    entry.prices.push(Number(cp.last_price));
    const name = (cp.competitors as { name?: string } | null)?.name;
    if (name) entry.names.push(name);
    byProduct.set(cp.product_id, entry);
  }

  // Prix de référence : la variante la moins chère de chaque produit
  const ourPrice = new Map<string, { price: number; name: string }>();
  for (const m of margins ?? []) {
    const existing = ourPrice.get(m.product_id);
    const price = Number(m.price);
    if (!existing || price < existing.price) {
      ourPrice.set(m.product_id, { price, name: m.product_name });
    }
  }

  const findings: Finding[] = [];
  let alertsCreated = 0;

  for (const [productId, entry] of byProduct) {
    const ours = ourPrice.get(productId);
    if (!ours || entry.prices.length === 0) continue;

    const sorted = [...entry.prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const deviation = (ours.price - med) / med;

    if (Math.abs(deviation) < threshold) continue;

    const kind = deviation > 0 ? 'competitor_price_drop' : 'competitor_price_rise';
    const { data: existing } = await db.from('alerts').select('id')
      .eq('product_id', productId).eq('kind', kind).eq('is_resolved', false).maybeSingle();

    if (!existing) {
      await db.from('alerts').insert({
        kind,
        severity: Math.abs(deviation) > 0.2 ? 'warning' : 'info',
        title: deviation > 0
          ? `${ours.name} : ${pct(deviation)} au-dessus du marché`
          : `${ours.name} : ${pct(Math.abs(deviation))} sous le marché`,
        message:
          `Votre prix ${eur(ours.price)} contre une médiane de ${eur(med)} sur ` +
          `${entry.prices.length} relevé(s) (${[...new Set(entry.names)].join(', ')}). ` +
          (deviation > 0
            ? "Un écart durable au-dessus du marché doit être justifié par une différence visible."
            : "Il y a probablement de la marge laissée sur la table."),
        data: {
          our_price: ours.price, market_median: med,
          deviation, observations: entry.prices.length,
        },
        product_id: productId,
        automation_id: automationId,
      });
      alertsCreated += 1;
    }

    findings.push({
      severity: Math.abs(deviation) > 0.2 ? 'warning' : 'info',
      title: ours.name,
      detail: `${eur(ours.price)} vs médiane ${eur(med)} (${pct(deviation)})`,
    });
  }

  const withoutData = [...ourPrice.keys()].filter((id) => !byProduct.has(id)).length;

  return {
    summary: byProduct.size === 0
      ? "Aucun relevé de prix concurrent récent : la veille doit être alimentée " +
        "(saisie manuelle ou import CSV) avant de produire une analyse."
      : `${byProduct.size} produit(s) comparé(s), ${findings.length} écart(s) significatif(s) ` +
        `au-delà de ${pct(threshold)}. ${alertsCreated} nouvelle(s) alerte(s).` +
        (withoutData > 0 ? ` ${withoutData} produit(s) sans relevé récent.` : ''),
    findings: findings.slice(0, 20),
    approvalsCreated: 0,
    alertsCreated,
  };
}

/* ──────────────────────── Rapport de ventes ──────────────────────────── */

async function runSalesReport(
  db: Db, automationId: string, config: Record<string, unknown>,
): Promise<Outcome> {
  const windowDays = Number(config.window_days ?? 7);
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const previousSince = new Date(Date.now() - windowDays * 2 * 86400000).toISOString();

  const [{ data: eco }, { data: perf }, { data: currentOrders }, { data: previousOrders }] =
    await Promise.all([
      db.rpc('store_unit_economics', { p_days: windowDays }),
      db.from('product_performance').select('*')
        .order('revenue', { ascending: false }).limit(10),
      db.from('orders').select('total, cogs_total').gte('placed_at', since)
        .not('placed_at', 'is', null).not('status', 'in', '("cancelled","refunded")'),
      db.from('orders').select('total').gte('placed_at', previousSince).lt('placed_at', since)
        .not('placed_at', 'is', null).not('status', 'in', '("cancelled","refunded")'),
    ]);

  const revenue = (currentOrders ?? []).reduce((s, o) => s + Number(o.total), 0);
  const previousRevenue = (previousOrders ?? []).reduce((s, o) => s + Number(o.total), 0);
  const growth = previousRevenue > 0 ? (revenue - previousRevenue) / previousRevenue : null;
  const cogs = (currentOrders ?? []).reduce((s, o) => s + Number(o.cogs_total), 0);

  let alertsCreated = 0;

  // Recul marqué : on alerte
  if (growth !== null && growth < -0.2 && previousRevenue > 0) {
    await db.from('alerts').insert({
      kind: 'sales_drop',
      severity: 'warning',
      title: `Chiffre d'affaires en recul de ${pct(Math.abs(growth))}`,
      message:
        `${eur(revenue)} sur ${windowDays} jours contre ${eur(previousRevenue)} ` +
        `sur la période précédente. À diagnostiquer : disponibilité des best-sellers, ` +
        `visibilité des fiches, ou positionnement prix.`,
      data: { revenue, previous_revenue: previousRevenue, growth, window_days: windowDays },
      automation_id: automationId,
    });
    alertsCreated += 1;
  }

  const findings: Finding[] = (perf ?? []).slice(0, 10).map((p) => ({
    severity: 'info',
    title: p.name,
    detail: `${p.units_sold} unité(s), ${eur(Number(p.revenue))}` +
      (p.gross_margin !== null ? `, marge ${pct(Number(p.gross_margin))}` : ''),
  }));

  const ecoData = eco as { orders?: number; aov?: number } | null;

  return {
    summary:
      `${windowDays} jours : ${eur(revenue)} de chiffre d'affaires, ` +
      `${ecoData?.orders ?? 0} commande(s), panier moyen ${eur(Number(ecoData?.aov ?? 0))}, ` +
      `marge brute ${eur(revenue - cogs)}` +
      (growth !== null ? ` (${growth >= 0 ? '+' : ''}${pct(growth)} vs période précédente)` : '') + '.',
    findings,
    approvalsCreated: 0,
    alertsCreated,
  };
}

/* ─────────────────── Suivi des performances produit ──────────────────── */

async function runPerformanceTracking(db: Db, automationId: string): Promise<Outcome> {
  const { data: perf } = await db.from('product_performance').select('*');
  const rows = perf ?? [];

  const neverSold = rows.filter((p) => p.units_sold === 0 && p.status === 'active');
  const lowMargin = rows.filter(
    (p) => p.gross_margin !== null && Number(p.gross_margin) < 0.4 && Number(p.revenue) > 0);
  const outOfStockSellers = rows.filter((p) => p.units_sold > 0 && p.stock_available <= 0);

  let alertsCreated = 0;

  for (const p of outOfStockSellers) {
    const { data: existing } = await db.from('alerts').select('id')
      .eq('product_id', p.product_id).eq('kind', 'out_of_stock')
      .eq('is_resolved', false).maybeSingle();
    if (existing) continue;
    await db.from('alerts').insert({
      kind: 'out_of_stock',
      severity: 'critical',
      title: `${p.name} : produit qui vend, en rupture totale`,
      message:
        `${p.units_sold} unité(s) vendues pour ${eur(Number(p.revenue))}, ` +
        `et plus aucun stock disponible. Chaque jour de rupture est une vente perdue.`,
      data: { units_sold: p.units_sold, revenue: p.revenue },
      product_id: p.product_id,
      automation_id: automationId,
    });
    alertsCreated += 1;
  }

  return {
    summary:
      `${rows.length} produit(s) suivis : ${outOfStockSellers.length} en rupture parmi ceux ` +
      `qui vendent, ${neverSold.length} en ligne sans aucune vente, ` +
      `${lowMargin.length} sous 40 % de marge brute. ${alertsCreated} alerte(s) créée(s).`,
    findings: [
      ...outOfStockSellers.slice(0, 10).map((p) => ({
        severity: 'critical', title: p.name,
        detail: `${p.units_sold} vendue(s), stock épuisé`,
      })),
      ...neverSold.slice(0, 10).map((p) => ({
        severity: 'info', title: p.name,
        detail: 'En ligne, aucune vente enregistrée',
      })),
    ],
    approvalsCreated: 0,
    alertsCreated,
  };
}

/* ───────────────────────── Exécution générique ───────────────────────── */

async function execute(db: Db, automation: {
  id: string; kind: string; config: Record<string, unknown>;
  max_price_change_pct: number; skill_slug: string | null;
}): Promise<Outcome> {
  switch (automation.kind) {
    case 'stock_alert':
      return runStockAlert(db, automation.id);
    case 'price_alert':
    case 'competitor_watch':
      return runPriceAlert(db, automation.id, automation.config);
    case 'price_recommendation':
      return runPriceRecommendation(db, automation.id, automation.config,
                                    Number(automation.max_price_change_pct));
    case 'sales_report':
      return runSalesReport(db, automation.id, automation.config);
    case 'performance_tracking':
      return runPerformanceTracking(db, automation.id);
    case 'skill_analysis':
      // Analyse programmée : on exécute le diagnostic de marge, qui est le
      // calcul déterministe le plus utile sans intervention humaine.
      return runMarginAnalysis(db, automation.id);
    default:
      throw new Error(`Type d'automatisation non pris en charge : ${automation.kind}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return errorResponse('Méthode non autorisée', 405);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Corps de requête invalide');
  }

  const db = serviceClient();
  const cronSecret = Deno.env.get('CRON_SECRET');
  const isCron = Boolean(cronSecret && payload.cronSecret === cronSecret);

  // Un appel manuel exige un compte équipe ; un appel planifié, le jeton partagé.
  if (!isCron) {
    try {
      await requireStaff(req);
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Accès refusé', 403);
    }
  }

  /* Automatisations à exécuter */
  let automations: {
    id: string; name: string; kind: string; config: Record<string, unknown>;
    max_price_change_pct: number; skill_slug: string | null; status: string;
  }[] = [];

  if (payload.automationId) {
    const { data } = await db.from('automations').select('*').eq('id', payload.automationId);
    automations = (data ?? []) as typeof automations;
  } else if (isCron) {
    // Appel planifié sans cible : uniquement les automatisations actives dont
    // l'échéance est franchie. La tâche cron tourne toutes les 15 minutes ;
    // sans ce filtre, une automatisation hebdomadaire s'exécuterait des
    // centaines de fois par semaine.
    const { data } = await db.from('automations').select('*')
      .eq('status', 'active')
      .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`);
    automations = (data ?? []) as typeof automations;
  } else {
    return errorResponse('automationId manquant');
  }

  if (automations.length === 0) {
    return jsonResponse({
      status: 'skipped', summary: 'Aucune automatisation à exécuter.',
      approvalsCreated: 0, alertsCreated: 0, executed: 0,
    });
  }

  const results: { name: string; status: string; summary: string }[] = [];
  let totalApprovals = 0;
  let totalAlerts = 0;

  for (const automation of automations) {
    const startedAt = Date.now();
    const { data: run } = await db.from('automation_runs').insert({
      automation_id: automation.id,
      status: 'running',
      trigger_source: payload.triggerSource ?? (isCron ? 'schedule' : 'manual'),
    }).select('id').single();

    try {
      const outcome = await execute(db, automation);
      totalApprovals += outcome.approvalsCreated;
      totalAlerts += outcome.alertsCreated;

      if (run) {
        await db.from('automation_runs').update({
          status: 'succeeded',
          summary: outcome.summary,
          findings: outcome.findings,
          approvals_created: outcome.approvalsCreated,
          alerts_created: outcome.alertsCreated,
          duration_ms: Date.now() - startedAt,
          finished_at: new Date().toISOString(),
        }).eq('id', run.id);
      }

      // `next_run_at` est recalculé par le trigger SQL dès que `schedule_cron`
      // ou `status` sont touchés : on les réécrit à l'identique pour forcer le
      // recalcul de la prochaine échéance après cette exécution.
      const { data: current } = await db.from('automations')
        .select('run_count, schedule_cron, status').eq('id', automation.id).single();
      await db.from('automations').update({
        last_run_at: new Date().toISOString(),
        last_status: 'succeeded',
        run_count: (current?.run_count ?? 0) + 1,
        schedule_cron: current?.schedule_cron ?? automation.config.schedule_cron as string,
        status: current?.status ?? 'active',
      }).eq('id', automation.id);

      results.push({ name: automation.name, status: 'succeeded', summary: outcome.summary });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur inconnue';
      console.error('[automation-tick]', automation.name, message);

      if (run) {
        await db.from('automation_runs').update({
          status: 'failed', error: message,
          duration_ms: Date.now() - startedAt,
          finished_at: new Date().toISOString(),
        }).eq('id', run.id);
      }
      // Même en cas d'échec, l'échéance avance : sinon la tâche planifiée
      // relancerait l'automatisation en boucle toutes les 15 minutes.
      const { data: current } = await db.from('automations')
        .select('schedule_cron, status').eq('id', automation.id).single();
      await db.from('automations').update({
        last_run_at: new Date().toISOString(), last_status: 'failed',
        schedule_cron: current?.schedule_cron ?? '0 7 * * 1',
        status: current?.status ?? 'active',
      }).eq('id', automation.id);

      // Une automatisation en échec doit être visible
      await db.from('alerts').insert({
        kind: 'automation_failed', severity: 'warning',
        title: `Automatisation en échec — ${automation.name}`,
        message: message,
        automation_id: automation.id,
      });
      totalAlerts += 1;

      results.push({ name: automation.name, status: 'failed', summary: message });
    }
  }

  const failed = results.filter((r) => r.status === 'failed').length;

  return jsonResponse({
    status: failed === 0 ? 'succeeded' : failed === results.length ? 'failed' : 'partial',
    summary: results.length === 1
      ? results[0].summary
      : `${results.length} automatisation(s) exécutée(s)${failed ? `, ${failed} en échec` : ''}.`,
    approvalsCreated: totalApprovals,
    alertsCreated: totalAlerts,
    executed: results.length,
    results,
  });
});
