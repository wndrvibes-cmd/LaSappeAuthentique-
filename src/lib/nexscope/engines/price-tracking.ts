/**
 * MOTEUR — Veille des prix concurrents
 *
 * Porté depuis :
 *   competitor-price-tracker/SKILL.md, competitor-price-analysis/SKILL.md,
 *   walmart-price-tracker/SKILL.md, share-of-shelf/SKILL.md
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * ⚠️ Ce moteur analyse les relevés de prix PRÉSENTS EN BASE. Il ne collecte
 * rien de lui-même : les relevés sont saisis manuellement, importés par CSV,
 * ou poussés par une source de données marché connectée. Aucun prix n'est
 * inventé — une référence sans relevé est signalée comme telle.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, pct, round, safeDiv, stdDev } from '../shared';

export interface CompetitorObservation {
  competitorName: string;
  competitorProductTitle: string;
  price: number;
  shippingPrice: number | null;
  inStock: boolean | null;
  observedAt: string;
  source: 'manual' | 'csv_import' | 'api' | 'automation';
}

export interface TrackedProduct {
  productId: string;
  name: string;
  sku: string;
  ourPrice: number;
  unitCost: number;
  netMargin: number;
  observations: CompetitorObservation[];
}

export interface PriceTrackingInput {
  products: TrackedProduct[];
  /** Écart au-delà duquel on alerte. 0,08 = 8 %. */
  deviationThreshold: number;
  /** Ancienneté maximale acceptable d'un relevé, en jours. */
  maxObservationAgeDays: number;
}

export function runPriceTracking(i: PriceTrackingInput): EngineResult {
  const now = Date.now();
  const analysed = i.products.map((p) => {
    const fresh = p.observations.filter(
      (o) => (now - new Date(o.observedAt).getTime()) / 86400000 <= i.maxObservationAgeDays);
    const prices = fresh.map((o) => o.price + (o.shippingPrice ?? 0));
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted.length
      ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
         : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : null;
    const min = sorted[0] ?? null;
    const max = sorted[sorted.length - 1] ?? null;
    const deviation = median !== null ? safeDiv(p.ourPrice - median, median) : null;
    const dispersion = prices.length >= 2 ? round(safeDiv(stdDev(prices), median ?? 1), 4) : null;
    const rank = median !== null ? sorted.filter((x) => x < p.ourPrice).length + 1 : null;
    const staleOnly = p.observations.length > 0 && fresh.length === 0;

    return { product: p, fresh, median, min, max, deviation, dispersion, rank,
             totalCompetitors: sorted.length, staleOnly };
  });

  const withData = analysed.filter((a) => a.median !== null);
  const withoutData = analysed.filter((a) => a.median === null);
  const tooExpensive = withData.filter((a) => (a.deviation ?? 0) > i.deviationThreshold);
  const tooCheap = withData.filter((a) => (a.deviation ?? 0) < -i.deviationThreshold);
  const avgDeviation = withData.length
    ? round(safeDiv(withData.reduce((s, a) => s + (a.deviation ?? 0), 0), withData.length), 4)
    : null;

  const metrics: Metric[] = [
    { key: 'tracked', label: 'Références suivies', value: i.products.length, unit: 'u' },
    { key: 'with_data', label: 'Avec relevés récents', value: withData.length, unit: 'u',
      status: withoutData.length === 0 ? 'healthy' : withData.length >= i.products.length * 0.6 ? 'warning' : 'danger' },
    { key: 'avg_deviation', label: 'Écart moyen à la médiane marché',
      value: avgDeviation !== null ? round(avgDeviation * 100, 1) : 0, unit: '%',
      status: avgDeviation === null ? undefined
            : Math.abs(avgDeviation) <= i.deviationThreshold ? 'healthy' : 'warning' },
    { key: 'too_expensive', label: 'Références au-dessus du marché', value: tooExpensive.length, unit: 'u',
      status: tooExpensive.length === 0 ? 'healthy' : 'warning' },
    { key: 'too_cheap', label: 'Références sous le marché', value: tooCheap.length, unit: 'u',
      status: tooCheap.length === 0 ? 'healthy' : 'warning' },
  ];

  const findings: Finding[] = [];
  if (withoutData.length)
    findings.push({ severity: withoutData.length === i.products.length ? 'critical' : 'warning',
      title: `${withoutData.length} référence(s) sans relevé de prix exploitable`,
      detail: withoutData.some((a) => a.staleOnly)
        ? `Dont ${withoutData.filter((a) => a.staleOnly).length} dont les relevés dépassent ${i.maxObservationAgeDays} jours d’ancienneté. Un prix concurrent périmé est plus dangereux qu’une absence de donnée.`
        : 'Aucune comparaison marché possible pour elles. Ajouter des concurrents et saisir leurs prix, ou importer un relevé CSV.' });

  for (const a of tooExpensive.slice(0, 5))
    findings.push({ severity: (a.deviation ?? 0) > 0.2 ? 'critical' : 'warning',
      title: `${a.product.name} : ${pct(a.deviation ?? 0)} au-dessus de la médiane marché`,
      detail: `Votre prix ${eur(a.product.ourPrice)} contre une médiane de ${eur(a.median as number)} sur ${a.totalCompetitors} relevé(s) (fourchette ${eur(a.min as number)} – ${eur(a.max as number)}). Position : ${a.rank}ᵉ sur ${a.totalCompetitors + 1}.` });

  for (const a of tooCheap.slice(0, 5))
    findings.push({ severity: 'info',
      title: `${a.product.name} : ${pct(Math.abs(a.deviation ?? 0))} sous la médiane marché`,
      detail: `Votre prix ${eur(a.product.ourPrice)} contre ${eur(a.median as number)} de médiane. Marge actuelle ${pct(a.product.netMargin)} : il y a probablement de la marge laissée sur la table.` });

  const volatile = withData.filter((a) => (a.dispersion ?? 0) > 0.25);
  if (volatile.length)
    findings.push({ severity: 'info', title: `${volatile.length} segment(s) à prix très dispersés`,
      detail: `${volatile.slice(0, 3).map((a) => a.product.name).join(', ')}. Une forte dispersion signifie que le marché n’a pas de prix de référence : votre positionnement a plus de latitude.` });

  const manualOnly = analysed.filter((a) => a.fresh.length > 0 && a.fresh.every((o) => o.source === 'manual'));
  if (manualOnly.length === withData.length && withData.length > 0)
    findings.push({ severity: 'info', title: 'Tous les relevés sont saisis manuellement',
      detail: 'C’est fiable mais lent. Une source de données marché connectée permettrait une veille quotidienne automatique.' });

  const recommendations: Recommendation[] = [];
  if (tooCheap.length) {
    const changes = tooCheap
      .filter((a) => a.median !== null)
      .map((a) => {
        // On ne remonte qu'à mi-chemin de la médiane : prudence sur l'élasticité
        const target = round(a.product.ourPrice + ((a.median as number) - a.product.ourPrice) * 0.5, 2);
        return { product_id: a.product.productId, variant_id: null, sku: a.product.sku,
                 name: a.product.name, current_price: a.product.ourPrice, new_price: target,
                 market_median: a.median, reason: `${pct(Math.abs(a.deviation ?? 0))} sous la médiane marché` };
      });
    recommendations.push({ priority: 1,
      title: `Rapprocher ${changes.length} prix de la médiane marché`,
      detail: `Remontée à mi-chemin seulement, par prudence sur l’élasticité. Gain de marge estimé : ${eur(round(changes.reduce((s, c) => s + (c.new_price - c.current_price), 0), 2))} par unité vendue, cumulé sur ces références. À valider avant application.`,
      requiresApproval: true, actionType: 'bulk_price_change',
      payload: { changes, basis: 'median_market_price' } });
  }
  if (tooExpensive.length)
    recommendations.push({ priority: 2, title: `Justifier ou corriger ${tooExpensive.length} prix au-dessus du marché`,
      detail: 'Un prix supérieur se tient s’il est adossé à une différence visible : matière, provenance, finition, service. Sinon il se traduit par un taux de conversion plus faible. Vérifier d’abord la fiche produit avant de baisser le prix.' });
  if (withoutData.length)
    recommendations.push({ priority: 2, title: `Compléter la veille sur ${withoutData.length} référence(s)`,
      detail: 'Saisie manuelle depuis le module de veille, ou import CSV (colonnes : concurrent, titre, url, prix, port, date). Deux à trois concurrents par référence suffisent pour une médiane utile.' });

  const tables: EngineTable[] = [{
    title: 'Positionnement prix',
    columns: [
      { key: 'produit', label: 'Produit' },
      { key: 'notre', label: 'Notre prix', align: 'right' },
      { key: 'mediane', label: 'Médiane marché', align: 'right' },
      { key: 'fourchette', label: 'Fourchette', align: 'right' },
      { key: 'ecart', label: 'Écart', align: 'right' },
      { key: 'rang', label: 'Rang', align: 'right' },
      { key: 'releves', label: 'Relevés' },
    ],
    rows: analysed.map((a) => ({
      produit: a.product.name,
      notre: eur(a.product.ourPrice),
      mediane: a.median !== null ? eur(a.median) : '—',
      fourchette: a.min !== null ? `${eur(a.min)} – ${eur(a.max as number)}` : '—',
      ecart: a.deviation !== null ? `${a.deviation >= 0 ? '+' : ''}${pct(a.deviation)}` : '—',
      rang: a.rank !== null ? `${a.rank}/${a.totalCompetitors + 1}` : '—',
      releves: a.fresh.length > 0
        ? `${a.fresh.length} (${[...new Set(a.fresh.map((o) => o.source))].join(', ')})`
        : a.staleOnly ? `périmés (> ${i.maxObservationAgeDays} j)` : 'aucun',
    })),
    note: `Prix comparés port inclus lorsque le port est renseigné. Relevés retenus : moins de ${i.maxObservationAgeDays} jours.`,
  }];

  const dataGaps: string[] = [];
  if (withoutData.length)
    dataGaps.push(`${withoutData.length} référence(s) sans relevé récent : aucune comparaison marché n’est produite pour elles. Les relevés sont saisis ou importés depuis le module de veille concurrentielle.`);
  dataGaps.push('Ce module n’effectue aucune collecte automatique. Pour une veille quotidienne sans saisie, connecter une source de données marché (clé API à renseigner dans les secrets des Edge Functions).');

  return {
    engineKey: 'price-tracking',
    title: 'Veille des prix concurrents',
    summary: withData.length
      ? `${withData.length}/${i.products.length} référence(s) comparées · écart moyen ${avgDeviation !== null ? `${avgDeviation >= 0 ? '+' : ''}${pct(avgDeviation)}` : '—'} · ${tooExpensive.length} au-dessus, ${tooCheap.length} sous le marché.`
      : 'Aucun relevé de prix concurrent exploitable : la veille doit être alimentée avant de produire une analyse.',
    status: withData.length === 0 ? 'danger'
          : tooExpensive.length || tooCheap.length ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { analysed: analysed.map((a) => ({ sku: a.product.sku, ourPrice: a.product.ourPrice,
             median: a.median, min: a.min, max: a.max, deviation: a.deviation,
             dispersion: a.dispersion, rank: a.rank, observationCount: a.fresh.length })),
           avgDeviation },
    dataGaps,
  };
}
