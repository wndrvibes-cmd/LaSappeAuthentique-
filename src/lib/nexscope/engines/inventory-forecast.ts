/**
 * MOTEUR — Pilotage des stocks et réapprovisionnement
 *
 * Porté depuis :
 *   inventory-tracking-software/SKILL.md
 *   restock-alert/SKILL.md
 *   shopify-inventory-management/SKILL.md
 *   warehouse-optimization/SKILL.md (+ evals/evals.json)
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Calculs : vélocité réelle, couverture, stock de sécurité au taux de
 * service choisi, point de commande, quantité économique de commande,
 * classification ABC (loi de Pareto) et valorisation du stock dormant.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { SERVICE_LEVEL_Z, eur, pct, round, safeDiv } from '../shared';

export interface InventoryLine {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  variantTitle: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  unitCost: number;
  unitPrice: number;
  /** Unités vendues sur la fenêtre d'observation. */
  unitsSoldWindow: number;
  windowDays: number;
  leadTimeDays: number;
}

export interface InventoryForecastInput {
  lines: InventoryLine[];
  serviceLevel: '0.90' | '0.95' | '0.975' | '0.99';
  /** Variabilité de la demande (écart-type relatif). 0,3 = 30 %. */
  demandVariability: number;
  orderingCostPerOrder: number;
  annualHoldingCostRate: number;
}

export function runInventoryForecast(i: InventoryForecastInput): EngineResult {
  const z = SERVICE_LEVEL_Z[i.serviceLevel];

  const rows = i.lines.map((l) => {
    const velocity = safeDiv(l.unitsSoldWindow, l.windowDays);          // unités / jour
    const daysOfCover = velocity > 0 ? round(safeDiv(l.available, velocity), 1) : null;
    const safetyStock = velocity > 0
      ? Math.ceil(z * velocity * i.demandVariability * Math.sqrt(l.leadTimeDays))
      : 0;
    const reorderPoint = velocity > 0
      ? Math.ceil(velocity * l.leadTimeDays + safetyStock)
      : l.reorderPoint;
    const annualDemand = velocity * 365;
    const holdingCostPerUnit = l.unitCost * i.annualHoldingCostRate;
    const eoq = annualDemand > 0 && holdingCostPerUnit > 0
      ? Math.ceil(Math.sqrt((2 * annualDemand * i.orderingCostPerOrder) / holdingCostPerUnit))
      : null;
    const needsReorder = l.available <= reorderPoint;
    const suggestedQty = needsReorder
      ? Math.max(eoq ?? 0, reorderPoint - l.available, 1)
      : 0;
    const stockValue = round(l.onHand * l.unitCost, 2);
    const revenueWindow = round(l.unitsSoldWindow * l.unitPrice, 2);

    return { line: l, velocity, daysOfCover, safetyStock, reorderPoint, eoq,
             needsReorder, suggestedQty, stockValue, revenueWindow,
             isDead: l.unitsSoldWindow === 0 && l.onHand > 0,
             isStockout: l.available <= 0 };
  });

  // ── Classification ABC sur le chiffre d'affaires (loi de Pareto) ──
  const sortedByRevenue = [...rows].sort((a, b) => b.revenueWindow - a.revenueWindow);
  const totalRevenue = sortedByRevenue.reduce((s, r) => s + r.revenueWindow, 0);
  // Classification inclusive : la référence qui fait franchir le seuil de 80 %
  // appartient encore à la classe A. On évalue donc le cumul AVANT de l'ajouter.
  let cumulative = 0;
  const abc = new Map<string, 'A' | 'B' | 'C'>();
  for (const r of sortedByRevenue) {
    const shareBefore = safeDiv(cumulative, totalRevenue);
    abc.set(r.line.variantId, shareBefore < 0.8 ? 'A' : shareBefore < 0.95 ? 'B' : 'C');
    cumulative += r.revenueWindow;
  }

  const stockouts = rows.filter((r) => r.isStockout);
  const toReorder = rows.filter((r) => r.needsReorder && !r.isStockout);
  const dead = rows.filter((r) => r.isDead);
  const totalStockValue = round(rows.reduce((s, r) => s + r.stockValue, 0), 2);
  const deadStockValue = round(dead.reduce((s, r) => s + r.stockValue, 0), 2);
  const classAStockouts = stockouts.filter((r) => abc.get(r.line.variantId) === 'A');

  const metrics: Metric[] = [
    { key: 'sku_count', label: 'Références suivies', value: rows.length, unit: 'u' },
    { key: 'stock_value', label: 'Valeur du stock au coût', value: totalStockValue, unit: '€' },
    { key: 'stockouts', label: 'Ruptures', value: stockouts.length, unit: 'u',
      status: stockouts.length === 0 ? 'healthy' : classAStockouts.length ? 'danger' : 'warning' },
    { key: 'to_reorder', label: 'À réapprovisionner', value: toReorder.length, unit: 'u',
      status: toReorder.length === 0 ? 'healthy' : 'warning' },
    { key: 'dead_stock', label: 'Références sans vente', value: dead.length, unit: 'u',
      status: dead.length === 0 ? 'healthy' : dead.length > rows.length * 0.3 ? 'danger' : 'warning' },
    { key: 'dead_value', label: 'Trésorerie immobilisée en stock dormant', value: deadStockValue, unit: '€',
      status: deadStockValue < totalStockValue * 0.15 ? 'healthy' : deadStockValue < totalStockValue * 0.3 ? 'warning' : 'danger' },
  ];

  const findings: Finding[] = [];
  if (classAStockouts.length)
    findings.push({ severity: 'critical', title: `${classAStockouts.length} rupture(s) sur des références de classe A`,
      detail: `Ce sont les références qui font 80 % du chiffre d’affaires : ${classAStockouts.slice(0, 3).map((r) => `${r.line.productName} (${r.line.variantTitle})`).join(', ')}. Chaque jour de rupture est une vente perdue qui ne se rattrape pas.`,
      impact: `Manque à gagner estimé : ${eur(round(classAStockouts.reduce((s, r) => s + r.velocity * r.line.unitPrice, 0), 2))} par jour` });
  else if (stockouts.length)
    findings.push({ severity: 'warning', title: `${stockouts.length} référence(s) en rupture`,
      detail: `Références concernées : ${stockouts.slice(0, 5).map((r) => r.line.sku).join(', ')}.` });

  if (toReorder.length)
    findings.push({ severity: 'warning', title: `${toReorder.length} référence(s) sous le point de commande`,
      detail: `Au-delà du délai de réapprovisionnement, ces références basculeront en rupture. Taux de service retenu : ${pct(Number(i.serviceLevel), 0)}.` });

  if (deadStockValue > totalStockValue * 0.25 && totalStockValue > 0)
    findings.push({ severity: 'warning', title: `${pct(safeDiv(deadStockValue, totalStockValue))} du stock ne tourne pas`,
      detail: `${eur(deadStockValue)} immobilisés sur ${dead.length} référence(s) sans aucune vente sur ${i.lines[0]?.windowDays ?? 30} jours.` });

  const understocked = rows.filter((r) => r.velocity > 0 && r.line.reorderPoint < r.reorderPoint * 0.6);
  if (understocked.length)
    findings.push({ severity: 'info', title: `${understocked.length} seuil(s) de réapprovisionnement sous-évalué(s)`,
      detail: 'Le seuil saisi est nettement inférieur au point de commande calculé à partir de la vélocité réelle et du délai fournisseur.' });

  const recommendations: Recommendation[] = [];
  if (toReorder.length || stockouts.length) {
    const all = [...stockouts, ...toReorder].filter((r) => r.suggestedQty > 0);
    const poValue = round(all.reduce((s, r) => s + r.suggestedQty * r.line.unitCost, 0), 2);
    recommendations.push({
      priority: 1,
      title: `Préparer un réapprovisionnement de ${all.length} référence(s) — ${eur(poValue)}`,
      detail: `Quantités calculées par quantité économique de commande, en couvrant le délai de réapprovisionnement et le stock de sécurité à ${pct(Number(i.serviceLevel), 0)} de taux de service. À valider avant transmission au fournisseur.`,
      requiresApproval: true,
      actionType: 'purchase_order',
      payload: {
        lines: all.map((r) => ({ variant_id: r.line.variantId, sku: r.line.sku,
          product_name: r.line.productName, variant_title: r.line.variantTitle,
          quantity: r.suggestedQty, unit_cost: r.line.unitCost,
          current_available: r.line.available, reorder_point: r.reorderPoint })),
        estimated_total: poValue,
      },
    });
  }
  if (understocked.length)
    recommendations.push({ priority: 2, title: 'Recaler les seuils de réapprovisionnement sur la vélocité réelle',
      detail: `${understocked.length} référence(s) concernée(s). Les points de commande recalculés figurent dans le tableau ci-dessous.` });
  if (dead.length)
    recommendations.push({ priority: 2, title: `Écouler ${dead.length} référence(s) dormante(s)`,
      detail: `${eur(deadStockValue)} de trésorerie à libérer. Une remise ciblée sur ces seules variantes évite d’abîmer le prix de référence du reste du catalogue.`,
      requiresApproval: true, actionType: 'discount_creation',
      payload: { variant_ids: dead.map((r) => r.line.variantId), stock_value: deadStockValue } });

  const tables: EngineTable[] = [
    {
      title: 'Références à réapprovisionner',
      columns: [
        { key: 'sku', label: 'Référence' }, { key: 'produit', label: 'Produit' },
        { key: 'abc', label: 'Classe', align: 'right' },
        { key: 'dispo', label: 'Disponible', align: 'right' },
        { key: 'velocite', label: 'Ventes / jour', align: 'right' },
        { key: 'couverture', label: 'Couverture', align: 'right' },
        { key: 'point', label: 'Point de commande', align: 'right' },
        { key: 'quantite', label: 'Quantité conseillée', align: 'right' },
      ],
      rows: [...stockouts, ...toReorder].slice(0, 50).map((r) => ({
        sku: r.line.sku,
        produit: `${r.line.productName} — ${r.line.variantTitle}`,
        abc: abc.get(r.line.variantId) ?? 'C',
        dispo: r.line.available,
        velocite: round(r.velocity, 2),
        couverture: r.daysOfCover !== null ? `${r.daysOfCover} j` : '—',
        point: r.reorderPoint,
        quantite: r.suggestedQty || '—',
      })),
      note: `Stock de sécurité = z(${i.serviceLevel}) × vélocité × variabilité(${pct(i.demandVariability, 0)}) × √délai. Quantité économique = √(2 × demande annuelle × ${eur(i.orderingCostPerOrder)} / coût de détention).`,
    },
  ];

  if (dead.length)
    tables.push({
      title: 'Stock dormant',
      columns: [
        { key: 'sku', label: 'Référence' }, { key: 'produit', label: 'Produit' },
        { key: 'stock', label: 'En stock', align: 'right' },
        { key: 'valeur', label: 'Valeur au coût', align: 'right' },
      ],
      rows: dead.slice(0, 50).map((r) => ({
        sku: r.line.sku,
        produit: `${r.line.productName} — ${r.line.variantTitle}`,
        stock: r.line.onHand,
        valeur: eur(r.stockValue),
      })),
      note: 'Aucune vente sur la fenêtre d’observation.',
    });

  const noSales = rows.filter((r) => r.velocity === 0).length;
  const dataGaps: string[] = [];
  if (noSales === rows.length && rows.length > 0)
    dataGaps.push('Aucune vente enregistrée sur la fenêtre : les points de commande reposent sur les seuils saisis manuellement. Ils seront recalculés automatiquement dès les premières ventes.');
  if (rows.some((r) => r.line.unitCost === 0))
    dataGaps.push('Certaines références n’ont pas de coût d’achat renseigné : leur valeur de stock et leur quantité économique de commande ne sont pas calculées.');

  return {
    engineKey: 'inventory-forecast',
    title: 'Pilotage des stocks',
    summary: `${rows.length} référence(s) · ${eur(totalStockValue)} de stock · ${stockouts.length} rupture(s) · ${toReorder.length} à réapprovisionner · ${eur(deadStockValue)} dormant.`,
    status: classAStockouts.length ? 'danger' : stockouts.length || toReorder.length ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { rows: rows.map((r) => ({ sku: r.line.sku, velocity: round(r.velocity, 3),
             daysOfCover: r.daysOfCover, safetyStock: r.safetyStock, reorderPoint: r.reorderPoint,
             eoq: r.eoq, abc: abc.get(r.line.variantId), stockValue: r.stockValue })),
           totalStockValue, deadStockValue },
    dataGaps,
  };
}
