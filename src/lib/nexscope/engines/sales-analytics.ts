/**
 * MOTEUR — Analyse des ventes
 *
 * Porté depuis :
 *   sales-tracking-tool/SKILL.md, shopify-analytics-guide/SKILL.md,
 *   etsy-shop-analytics/SKILL.md, tiktok-shop-analytics/SKILL.md
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Calculs : tendance période sur période, concentration du chiffre
 * d'affaires (Pareto et indice de Herfindahl), produits en accélération
 * ou en décrochage, contribution à la marge, détection d'anomalies.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, pct, round, safeDiv, stdDev } from '../shared';

export interface DailyPoint { day: string; revenue: number; orders: number; grossProfit: number; units: number }

export interface ProductPoint {
  productId: string; name: string; slug: string;
  unitsCurrent: number; revenueCurrent: number; grossProfitCurrent: number;
  unitsPrevious: number; revenuePrevious: number;
  stockAvailable: number; grossMargin: number | null;
}

export interface SalesAnalyticsInput {
  windowDays: number;
  current: DailyPoint[];
  previous: DailyPoint[];
  products: ProductPoint[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function runSalesAnalytics(i: SalesAnalyticsInput): EngineResult {
  const revNow = sum(i.current.map((d) => d.revenue));
  const revPrev = sum(i.previous.map((d) => d.revenue));
  const ordNow = sum(i.current.map((d) => d.orders));
  const ordPrev = sum(i.previous.map((d) => d.orders));
  const gpNow = sum(i.current.map((d) => d.grossProfit));
  const unitsNow = sum(i.current.map((d) => d.units));

  const revGrowth = revPrev > 0 ? safeDiv(revNow - revPrev, revPrev) : null;
  const ordGrowth = ordPrev > 0 ? safeDiv(ordNow - ordPrev, ordPrev) : null;
  const aovNow = safeDiv(revNow, ordNow);
  const aovPrev = safeDiv(revPrev, ordPrev);
  const aovGrowth = aovPrev > 0 ? safeDiv(aovNow - aovPrev, aovPrev) : null;
  const grossMargin = safeDiv(gpNow, revNow);

  // ── Concentration du chiffre d'affaires ──
  const ranked = [...i.products].filter((p) => p.revenueCurrent > 0)
    .sort((a, b) => b.revenueCurrent - a.revenueCurrent);
  const totalProductRevenue = sum(ranked.map((p) => p.revenueCurrent));
  let cum = 0;
  let paretoCount = 0;
  for (const p of ranked) {
    cum += p.revenueCurrent;
    paretoCount += 1;
    if (safeDiv(cum, totalProductRevenue) >= 0.8) break;
  }
  // Indice de Herfindahl : 1 = un seul produit porte tout, proche de 0 = bien réparti
  const hhi = round(sum(ranked.map((p) => safeDiv(p.revenueCurrent, totalProductRevenue) ** 2)), 4);
  const top3Share = safeDiv(sum(ranked.slice(0, 3).map((p) => p.revenueCurrent)), totalProductRevenue);

  // ── Accélérations et décrochages ──
  const withBoth = i.products.filter((p) => p.revenuePrevious > 0 || p.revenueCurrent > 0);
  const movers = withBoth.map((p) => ({
    p,
    delta: p.revenueCurrent - p.revenuePrevious,
    growth: p.revenuePrevious > 0 ? safeDiv(p.revenueCurrent - p.revenuePrevious, p.revenuePrevious) : null,
  }));
  const risers = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
  const fallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);

  // ── Détection d'anomalies journalières (±2 écarts-types) ──
  const dailyRev = i.current.map((d) => d.revenue);
  const mean = safeDiv(sum(dailyRev), dailyRev.length);
  const sd = stdDev(dailyRev);
  const anomalies = i.current.filter((d) => sd > 0 && Math.abs(d.revenue - mean) > 2 * sd);

  const metrics: Metric[] = [
    { key: 'revenue', label: `Chiffre d’affaires (${i.windowDays} j)`, value: round(revNow, 2), unit: '€' },
    { key: 'growth', label: 'Évolution vs période précédente',
      value: revGrowth !== null ? round(revGrowth * 100, 1) : 0, unit: '%',
      status: revGrowth === null ? undefined : revGrowth >= 0.1 ? 'healthy' : revGrowth >= -0.05 ? 'warning' : 'danger' },
    { key: 'orders', label: 'Commandes', value: ordNow, unit: 'u' },
    { key: 'aov', label: 'Panier moyen', value: round(aovNow, 2), unit: '€',
      status: aovGrowth === null ? undefined : aovGrowth >= 0 ? 'healthy' : 'warning' },
    { key: 'units', label: 'Unités vendues', value: unitsNow, unit: 'u' },
    { key: 'gross_margin', label: 'Marge brute', value: round(grossMargin * 100, 1), unit: '%',
      status: grossMargin >= 0.6 ? 'healthy' : grossMargin >= 0.45 ? 'warning' : 'danger', benchmark: 60 },
    { key: 'concentration', label: 'Part des 3 premiers produits', value: round(top3Share * 100, 1), unit: '%',
      status: top3Share <= 0.5 ? 'healthy' : top3Share <= 0.7 ? 'warning' : 'danger',
      hint: 'Au-delà de 70 %, la boutique dépend de trop peu de références.' },
  ];

  const findings: Finding[] = [];
  if (ordNow === 0)
    findings.push({ severity: 'info', title: 'Aucune commande sur la période',
      detail: 'L’analyse des ventes s’activera dès les premières commandes enregistrées.' });

  if (revGrowth !== null && revGrowth < -0.1)
    findings.push({ severity: 'critical', title: `Chiffre d’affaires en recul de ${pct(Math.abs(revGrowth))}`,
      detail: `${eur(round(revNow, 2))} contre ${eur(round(revPrev, 2))} sur la période précédente.${ordGrowth !== null && aovGrowth !== null ? ` Décomposition : commandes ${ordGrowth >= 0 ? '+' : ''}${pct(ordGrowth)}, panier moyen ${aovGrowth >= 0 ? '+' : ''}${pct(aovGrowth)}.` : ''}`,
      impact: `${eur(round(revNow - revPrev, 2))} de chiffre d’affaires` });
  else if (revGrowth !== null && revGrowth > 0.2)
    findings.push({ severity: 'info', title: `Croissance de ${pct(revGrowth)}`,
      detail: `${eur(round(revNow, 2))} contre ${eur(round(revPrev, 2))}. Vérifier que les stocks des références en accélération suivent.` });

  if (top3Share > 0.7 && ranked.length > 3)
    findings.push({ severity: 'warning', title: 'Chiffre d’affaires trop concentré',
      detail: `Les 3 premières références font ${pct(top3Share)} du total (indice de concentration ${hhi}). Une rupture sur l’une d’elles ferait chuter le chiffre d’affaires d’autant.` });

  if (fallers.length && fallers[0].growth !== null && fallers[0].growth < -0.3)
    findings.push({ severity: 'warning', title: `Décrochage sur « ${fallers[0].p.name} »`,
      detail: `${eur(round(fallers[0].p.revenueCurrent, 2))} contre ${eur(round(fallers[0].p.revenuePrevious, 2))}, soit ${pct(fallers[0].growth)}. Vérifier disponibilité, prix et visibilité de la fiche.` });

  const risingLowStock = risers.filter((m) => m.p.stockAvailable > 0 && m.p.stockAvailable < m.p.unitsCurrent);
  if (risingLowStock.length)
    findings.push({ severity: 'critical', title: `${risingLowStock.length} produit(s) en accélération avec un stock insuffisant`,
      detail: `${risingLowStock.map((m) => `${m.p.name} (${m.p.stockAvailable} en stock pour ${m.p.unitsCurrent} vendues)`).join(', ')}. Risque de rupture sur les meilleures ventes du moment.` });

  const lowMargin = i.products.filter((p) => p.grossMargin !== null && p.grossMargin < 0.4 && p.revenueCurrent > 0);
  if (lowMargin.length)
    findings.push({ severity: 'warning', title: `${lowMargin.length} produit(s) vendus sous 40 % de marge brute`,
      detail: `Ils représentent ${eur(round(sum(lowMargin.map((p) => p.revenueCurrent)), 2))} de chiffre d’affaires pour seulement ${eur(round(sum(lowMargin.map((p) => p.grossProfitCurrent)), 2))} de marge.` });

  for (const a of anomalies.slice(0, 3))
    findings.push({ severity: 'info', title: `Journée atypique le ${a.day}`,
      detail: `${eur(round(a.revenue, 2))} contre une moyenne de ${eur(round(mean, 2))} (± ${eur(round(sd, 2))}). Vérifier s’il s’agit d’une opération commerciale, d’un pic de trafic ou d’une anomalie de saisie.` });

  const recommendations: Recommendation[] = [];
  if (risingLowStock.length)
    recommendations.push({ priority: 1, title: 'Réapprovisionner en priorité les produits en accélération',
      detail: `${risingLowStock.map((m) => m.p.name).join(', ')}. Ce sont les ventes les plus faciles à ne pas perdre.`,
      requiresApproval: true, actionType: 'purchase_order',
      payload: { product_ids: risingLowStock.map((m) => m.p.productId) } });
  if (top3Share > 0.7 && ranked.length > 3)
    recommendations.push({ priority: 2, title: 'Élargir la base de chiffre d’affaires',
      detail: `Travailler la visibilité des références de rang 4 à 10, qui ne font aujourd’hui que ${pct(safeDiv(sum(ranked.slice(3, 10).map((p) => p.revenueCurrent)), totalProductRevenue))} du total.` });
  if (fallers.length)
    recommendations.push({ priority: 2, title: `Diagnostiquer les ${fallers.length} références en recul`,
      detail: 'Lancer un audit SEO de fiche et une comparaison de prix concurrents sur ces références pour distinguer un problème de visibilité d’un problème de positionnement prix.' });
  if (aovGrowth !== null && aovGrowth < -0.05)
    recommendations.push({ priority: 2, title: `Panier moyen en baisse de ${pct(Math.abs(aovGrowth))}`,
      detail: `${eur(aovNow)} contre ${eur(aovPrev)}. Vérifier le poids des remises et la mise en avant des produits complémentaires.` });

  const tables: EngineTable[] = [
    {
      title: 'Meilleures ventes de la période',
      columns: [
        { key: 'rang', label: '#', align: 'right' }, { key: 'produit', label: 'Produit' },
        { key: 'unites', label: 'Unités', align: 'right' },
        { key: 'ca', label: 'Chiffre d’affaires', align: 'right' },
        { key: 'marge', label: 'Marge brute', align: 'right' },
        { key: 'part', label: '% du CA', align: 'right' },
        { key: 'evolution', label: 'Évolution', align: 'right' },
      ],
      rows: ranked.slice(0, 15).map((p, idx) => {
        const m = movers.find((x) => x.p.productId === p.productId);
        return {
          rang: idx + 1, produit: p.name, unites: p.unitsCurrent,
          ca: eur(round(p.revenueCurrent, 2)),
          marge: p.grossMargin !== null ? pct(p.grossMargin) : '—',
          part: pct(safeDiv(p.revenueCurrent, totalProductRevenue)),
          evolution: m?.growth !== null && m?.growth !== undefined
            ? `${m.growth >= 0 ? '+' : ''}${pct(m.growth)}` : 'nouveau',
        };
      }),
      note: `${paretoCount} référence(s) sur ${ranked.length} réalisent 80 % du chiffre d’affaires.`,
    },
  ];

  if (fallers.length)
    tables.push({
      title: 'Références en recul',
      columns: [
        { key: 'produit', label: 'Produit' },
        { key: 'avant', label: 'Période précédente', align: 'right' },
        { key: 'apres', label: 'Période courante', align: 'right' },
        { key: 'ecart', label: 'Écart', align: 'right' },
        { key: 'stock', label: 'Stock', align: 'right' },
      ],
      rows: fallers.map((m) => ({
        produit: m.p.name,
        avant: eur(round(m.p.revenuePrevious, 2)),
        apres: eur(round(m.p.revenueCurrent, 2)),
        ecart: `${eur(round(m.delta, 2))}${m.growth !== null ? ` (${pct(m.growth)})` : ''}`,
        stock: m.p.stockAvailable,
      })),
    });

  return {
    engineKey: 'sales-analytics',
    title: `Analyse des ventes — ${i.windowDays} derniers jours`,
    summary: ordNow === 0
      ? 'Aucune commande sur la période.'
      : `${eur(round(revNow, 2))} de chiffre d’affaires${revGrowth !== null ? ` (${revGrowth >= 0 ? '+' : ''}${pct(revGrowth)})` : ''} · ${ordNow} commande(s) · panier moyen ${eur(aovNow)} · marge brute ${pct(grossMargin)}.`,
    status: revGrowth !== null && revGrowth < -0.1 ? 'danger'
          : top3Share > 0.7 || (revGrowth !== null && revGrowth < 0) ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { revNow: round(revNow, 2), revPrev: round(revPrev, 2), revGrowth, aovNow: round(aovNow, 2),
           grossMargin, hhi, top3Share, paretoCount, risers: risers.map((m) => m.p.name),
           fallers: fallers.map((m) => m.p.name), anomalies: anomalies.map((a) => a.day) },
    dataGaps: i.previous.length === 0
      ? ['Pas d’historique sur la période précédente : les évolutions ne sont pas calculables. Elles apparaîtront après une première période complète.']
      : [],
  };
}
