/**
 * MOTEUR — Diagnostic de chaîne d'approvisionnement
 *
 * Portage TypeScript de :
 *   supply-chain-optimization/supply-chain-optimization-shopify/scripts/calculator.py
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Les tables de référence `BENCHMARKS` sont reprises à l'identique, y compris
 * les seuils propres à chaque canal. Le canal « shopify » (DTC) est le défaut
 * de cette boutique : marge brute cible 60 %, cycle de trésorerie < 45 jours.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, evaluateStatus, pct, round, safeDiv, worstStatus } from '../shared';

export type SupplyChannel = 'shopify' | 'amazon' | 'walmart' | 'tiktok';

/** `BENCHMARKS` — repris tel quel du script Nexscope. */
export const BENCHMARKS: Record<SupplyChannel, {
  gross_margin: { healthy: number; warning: number };
  shipping_ratio: { healthy: number; warning: number };
  inventory_days: { healthy: number; warning: number };
  cash_cycle: { healthy: number; warning: number };
  net_margin: { healthy: number; warning: number };
}> = {
  shopify:  { gross_margin: { healthy: 0.60, warning: 0.50 }, shipping_ratio: { healthy: 0.08, warning: 0.12 },
              inventory_days: { healthy: 45, warning: 60 }, cash_cycle: { healthy: 45, warning: 70 },
              net_margin: { healthy: 0.20, warning: 0.12 } },
  amazon:   { gross_margin: { healthy: 0.40, warning: 0.30 }, shipping_ratio: { healthy: 0.05, warning: 0.10 },
              inventory_days: { healthy: 45, warning: 60 }, cash_cycle: { healthy: 90, warning: 120 },
              net_margin: { healthy: 0.20, warning: 0.10 } },
  walmart:  { gross_margin: { healthy: 0.35, warning: 0.25 }, shipping_ratio: { healthy: 0.06, warning: 0.10 },
              inventory_days: { healthy: 45, warning: 60 }, cash_cycle: { healthy: 100, warning: 130 },
              net_margin: { healthy: 0.18, warning: 0.10 } },
  tiktok:   { gross_margin: { healthy: 0.45, warning: 0.35 }, shipping_ratio: { healthy: 0.05, warning: 0.08 },
              inventory_days: { healthy: 30, warning: 45 }, cash_cycle: { healthy: 60, warning: 90 },
              net_margin: { healthy: 0.15, warning: 0.08 } },
};

/** Délai d'encaissement par canal (jours), utilisé dans le cycle de trésorerie. */
const PAYOUT_DAYS: Record<SupplyChannel, number> = { shopify: 3, amazon: 14, walmart: 14, tiktok: 7 };

export interface SupplyChainInput {
  channel: SupplyChannel;
  productCost: number;
  sellingPrice: number;
  inboundShippingPerUnit: number;
  fulfillmentFee: number;        // préparation + expédition
  storageFeePerUnit: number;     // stockage mensuel moyen par unité
  adSpendRatio: number;
  supplierPaymentDays: number;   // délai de paiement obtenu du fournisseur
  productionDays: number;
  shippingDays: number;
  inventoryDays: number;         // couverture de stock actuelle
  /** Optionnels, pour le dimensionnement des réapprovisionnements. */
  dailySales?: number;
  currentInventory?: number;
  orderingCostPerOrder?: number;
  annualHoldingCostRate?: number;
}

export function runSupplyChain(i: SupplyChainInput): EngineResult {
  const bm = BENCHMARKS[i.channel] ?? BENCHMARKS.shopify;

  // ── Indicateurs — `calculate_metrics()` du script d'origine ──
  const grossProfit = i.sellingPrice - i.productCost - i.inboundShippingPerUnit - i.fulfillmentFee;
  const grossMargin = safeDiv(grossProfit, i.sellingPrice);
  const shippingRatio = safeDiv(i.inboundShippingPerUnit, i.sellingPrice);

  const adCost = i.sellingPrice * i.adSpendRatio;
  const otherCost = i.sellingPrice * 0.05;          // estimation 5 %, comme dans le script
  const netProfit = grossProfit - i.storageFeePerUnit - adCost - otherCost;
  const netMargin = safeDiv(netProfit, i.sellingPrice);

  const cashCycle =
    i.productionDays + i.shippingDays + i.inventoryDays +
    PAYOUT_DAYS[i.channel] - i.supplierPaymentDays;

  const metrics: Metric[] = [
    { key: 'gross_margin', label: 'Marge brute', value: round(grossMargin * 100, 1), unit: '%',
      status: evaluateStatus(grossMargin, bm.gross_margin, true), benchmark: bm.gross_margin.healthy * 100,
      hint: '(prix − coût produit − logistique entrante − préparation) / prix' },
    { key: 'shipping_ratio', label: 'Poids de la logistique entrante', value: round(shippingRatio * 100, 1), unit: '%',
      status: evaluateStatus(shippingRatio, bm.shipping_ratio, false), benchmark: bm.shipping_ratio.healthy * 100 },
    { key: 'net_margin', label: 'Marge nette', value: round(netMargin * 100, 1), unit: '%',
      status: evaluateStatus(netMargin, bm.net_margin, true), benchmark: bm.net_margin.healthy * 100 },
    { key: 'inventory_days', label: 'Couverture de stock', value: i.inventoryDays, unit: 'j',
      status: evaluateStatus(i.inventoryDays, bm.inventory_days, false), benchmark: bm.inventory_days.healthy },
    { key: 'cash_cycle', label: 'Cycle de trésorerie', value: cashCycle, unit: 'j',
      status: evaluateStatus(cashCycle, bm.cash_cycle, false), benchmark: bm.cash_cycle.healthy,
      hint: 'Production + transport + stock + encaissement − délai fournisseur' },
    { key: 'total_lead_time', label: 'Délai total de réapprovisionnement',
      value: i.productionDays + i.shippingDays, unit: 'j' },
  ];

  // ── Quantité économique de commande et stock de sécurité ──
  const dailySales = i.dailySales ?? 0;
  const annualDemand = dailySales * 365;
  const orderingCost = i.orderingCostPerOrder ?? 60;
  const holdingRate = i.annualHoldingCostRate ?? 0.25;
  const holdingCostPerUnit = i.productCost * holdingRate;
  const eoq =
    annualDemand > 0 && holdingCostPerUnit > 0
      ? Math.ceil(Math.sqrt((2 * annualDemand * orderingCost) / holdingCostPerUnit))
      : null;
  const leadTime = i.productionDays + i.shippingDays;
  // Stock de sécurité à 95 % de taux de service, variabilité de demande de 30 %
  const safetyStock = dailySales > 0 ? Math.ceil(1.645 * dailySales * 0.3 * Math.sqrt(leadTime)) : null;
  const reorderPoint = dailySales > 0 ? Math.ceil(dailySales * leadTime + (safetyStock ?? 0)) : null;

  // ── Diagnostic des goulots — `diagnose_bottlenecks()` ──
  const findings: Finding[] = [];
  if (grossMargin < bm.gross_margin.warning) {
    findings.push({ severity: 'critical', title: 'Marge brute insuffisante pour un modèle DTC',
      detail: `${pct(grossMargin)} contre ${pct(bm.gross_margin.healthy, 0)} de référence. À ce niveau, l’acquisition payante n’est pas finançable.`,
      impact: `Il manque ${eur(round((bm.gross_margin.healthy - grossMargin) * i.sellingPrice, 2))} par unité` });
  }
  if (shippingRatio > bm.shipping_ratio.warning) {
    findings.push({ severity: 'warning', title: 'Logistique entrante trop lourde',
      detail: `${pct(shippingRatio)} du prix de vente, contre ${pct(bm.shipping_ratio.healthy, 0)} de référence. Regrouper les commandes ou passer au maritime quand le délai le permet.` });
  }
  if (cashCycle > bm.cash_cycle.warning) {
    findings.push({ severity: 'critical', title: `Cycle de trésorerie de ${cashCycle} jours`,
      detail: `Référence ${bm.cash_cycle.healthy} jours. Chaque euro investi en stock reste immobilisé ${cashCycle} jours avant de revenir.`,
      impact: dailySales > 0
        ? `Besoin en fonds de roulement ≈ ${eur(round(dailySales * i.productCost * cashCycle, 2))}`
        : undefined });
  }
  if (i.inventoryDays > bm.inventory_days.warning) {
    findings.push({ severity: 'warning', title: 'Stock dormant',
      detail: `${i.inventoryDays} jours de couverture contre ${bm.inventory_days.healthy} de référence. Le surstock immobilise de la trésorerie et vieillit les collections.` });
  }
  if (i.supplierPaymentDays === 0) {
    findings.push({ severity: 'warning', title: 'Aucun délai de paiement fournisseur',
      detail: 'Payer à la commande allonge le cycle de trésorerie d’autant. Un délai de 30 jours obtenu réduit mécaniquement le besoin en fonds de roulement de 30 jours de stock.' });
  }

  const recommendations: Recommendation[] = [];
  if (i.supplierPaymentDays < 30) {
    recommendations.push({ priority: 1, title: 'Négocier 30 jours de délai de paiement',
      detail: `Gain direct de ${30 - i.supplierPaymentDays} jours sur le cycle de trésorerie, sans toucher au prix ni au produit. C’est le levier le moins coûteux de ce diagnostic.` });
  }
  if (eoq !== null && reorderPoint !== null) {
    recommendations.push({ priority: 2, title: `Commander par lots de ${eoq} unités, point de commande à ${reorderPoint}`,
      detail: `Quantité économique calculée sur une demande annuelle de ${Math.round(annualDemand)} unités, un coût de passation de ${eur(orderingCost)} et un coût de détention de ${pct(holdingRate, 0)} par an. Stock de sécurité : ${safetyStock} unités (service 95 %).`,
      requiresApproval: true, actionType: 'purchase_order',
      payload: { eoq, reorder_point: reorderPoint, safety_stock: safetyStock, lead_time_days: leadTime } });
  }
  if (i.inventoryDays > bm.inventory_days.warning) {
    recommendations.push({ priority: 2, title: 'Déstocker les tailles et coloris dormants',
      detail: 'Une remise ciblée sur les variantes à rotation nulle libère de la trésorerie plus vite qu’une remise générale, et sans abîmer le prix de référence des best-sellers.',
      requiresApproval: true, actionType: 'discount_creation' });
  }

  const tables: EngineTable[] = [
    {
      title: 'Structure de coût par unité',
      columns: [
        { key: 'poste', label: 'Poste' },
        { key: 'montant', label: 'Montant', align: 'right' },
        { key: 'part', label: '% du prix', align: 'right' },
      ],
      rows: [
        { poste: 'Prix de vente', montant: eur(i.sellingPrice), part: '100,0 %' },
        { poste: 'Coût produit', montant: `− ${eur(i.productCost)}`, part: pct(safeDiv(i.productCost, i.sellingPrice)) },
        { poste: 'Logistique entrante', montant: `− ${eur(i.inboundShippingPerUnit)}`, part: pct(shippingRatio) },
        { poste: 'Préparation / expédition', montant: `− ${eur(i.fulfillmentFee)}`, part: pct(safeDiv(i.fulfillmentFee, i.sellingPrice)) },
        { poste: 'Stockage', montant: `− ${eur(i.storageFeePerUnit)}`, part: pct(safeDiv(i.storageFeePerUnit, i.sellingPrice)) },
        { poste: 'Publicité', montant: `− ${eur(round(adCost, 2))}`, part: pct(i.adSpendRatio) },
        { poste: 'Autres frais (estimation 5 %)', montant: `− ${eur(round(otherCost, 2))}`, part: '5,0 %' },
        { poste: 'Bénéfice net', montant: eur(round(netProfit, 2)), part: pct(netMargin) },
      ],
    },
    {
      title: 'Cycle de trésorerie',
      columns: [
        { key: 'etape', label: 'Étape' },
        { key: 'jours', label: 'Jours', align: 'right' },
      ],
      rows: [
        { etape: 'Production', jours: i.productionDays },
        { etape: 'Transport', jours: i.shippingDays },
        { etape: 'Stock en entrepôt', jours: i.inventoryDays },
        { etape: 'Encaissement', jours: PAYOUT_DAYS[i.channel] },
        { etape: 'Délai de paiement fournisseur (à déduire)', jours: -i.supplierPaymentDays },
        { etape: 'Cycle total', jours: cashCycle },
      ],
      note: `Référence ${i.channel} : ${bm.cash_cycle.healthy} jours.`,
    },
  ];

  if (eoq !== null) {
    tables.push({
      title: 'Dimensionnement des réapprovisionnements',
      columns: [{ key: 'indicateur', label: 'Indicateur' }, { key: 'valeur', label: 'Valeur', align: 'right' }],
      rows: [
        { indicateur: 'Ventes journalières retenues', valeur: round(dailySales, 2) },
        { indicateur: 'Demande annuelle extrapolée', valeur: Math.round(annualDemand) },
        { indicateur: 'Quantité économique de commande (EOQ)', valeur: eoq },
        { indicateur: 'Stock de sécurité (service 95 %)', valeur: safetyStock ?? '—' },
        { indicateur: 'Point de commande', valeur: reorderPoint ?? '—' },
        { indicateur: 'Nombre de commandes par an', valeur: eoq > 0 ? round(annualDemand / eoq, 1) : '—' },
      ],
      note: 'EOQ = √(2 × demande annuelle × coût de passation / coût de détention unitaire).',
    });
  }

  const dataGaps: string[] = [];
  if (!i.dailySales) dataGaps.push('Aucune vente journalière disponible : EOQ, stock de sécurité et point de commande ne sont pas calculés. Ils apparaîtront dès les premières ventes enregistrées.');
  if (!i.storageFeePerUnit) dataGaps.push('Coût de stockage non renseigné : la marge nette est légèrement surévaluée.');

  return {
    engineKey: 'supply-chain',
    title: `Chaîne d’approvisionnement — canal ${i.channel}`,
    summary: `Marge brute ${pct(grossMargin)} · marge nette ${pct(netMargin)} · cycle de trésorerie ${cashCycle} j (référence ${bm.cash_cycle.healthy} j).`,
    status: worstStatus(metrics),
    metrics, findings, recommendations, tables,
    raw: { grossProfit: round(grossProfit, 2), netProfit: round(netProfit, 2), cashCycle,
           eoq, safetyStock, reorderPoint, benchmarks: bm, input: i },
    dataGaps,
  };
}
