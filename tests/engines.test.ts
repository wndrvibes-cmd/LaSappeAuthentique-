/**
 * Tests des moteurs de calcul Nexscope.
 *
 * Objectif : vérifier que les algorithmes portés depuis les scripts Python
 * du dépôt nexscope-ai/eCommerce-Skills produisent des résultats corrects
 * et cohérents — pas qu'ils « renvoient quelque chose ».
 */
import { describe, expect, it } from 'vitest';
import { computeBreakdown, computeBreakEven, computePricingGrid, runProfitMargin,
         type ProfitMarginInput } from '@/lib/nexscope/engines/profit-margin';
import { runSupplyChain, BENCHMARKS } from '@/lib/nexscope/engines/supply-chain';
import { runListingSeo } from '@/lib/nexscope/engines/listing-seo';
import { runDynamicPricing } from '@/lib/nexscope/engines/dynamic-pricing';
import { runInventoryForecast } from '@/lib/nexscope/engines/inventory-forecast';
import { runUnitEconomics } from '@/lib/nexscope/engines/unit-economics';
import { runReviewAnalysis } from '@/lib/nexscope/engines/review-analysis';
import { runOpportunityScore } from '@/lib/nexscope/engines/opportunity-score';
import { sampleSizePerVariant, runFunnelCro } from '@/lib/nexscope/engines/funnel-cro';
import { runPriceTracking } from '@/lib/nexscope/engines/price-tracking';
import { runCrossBorder } from '@/lib/nexscope/engines/cross-border';
import { runSalesAnalytics } from '@/lib/nexscope/engines/sales-analytics';
import { runDifferentiation } from '@/lib/nexscope/engines/differentiation';
import { ENGINES } from '@/lib/nexscope/engines';
import { NEXSCOPE_SKILLS, registryStats, skillsUsingEngine } from '@/lib/nexscope/registry';

/* ════════════════════════ Marge et rentabilité ════════════════════════ */

const chemise: ProfitMarginInput = {
  sku: 'CHEPOP-M-IVO', name: 'Chemise popeline Ivoire',
  sellingPrice: 129, vatRate: 0.2, pricesIncludeVat: true,
  productCost: 31.5, inboundShipping: 3.2, handlingFee: 2.1, outboundShipping: 0,
  paymentFeeRate: 0.029, paymentFeeFixed: 0.25, adSpendRatio: 0.12,
  returnRate: 0.14, returnFee: 8, otherFees: 0,
  monthlyFixedCosts: 3000,
};

describe('moteur profit-margin', () => {
  it('exclut la TVA du chiffre d’affaires retenu', () => {
    const b = computeBreakdown(chemise);
    expect(b.netRevenue).toBeCloseTo(107.5, 2);        // 129 / 1,20
  });

  it('applique la commission de paiement sur le montant encaissé TTC', () => {
    const b = computeBreakdown(chemise);
    expect(b.paymentFee).toBeCloseTo(129 * 0.029 + 0.25, 2);
  });

  it('reprend la formule de coût des retours du script d’origine', () => {
    const b = computeBreakdown(chemise);
    // taux × (frais de traitement + 50 % du coût produit)
    expect(b.returnCost).toBeCloseTo(0.14 * (8 + 31.5 * 0.5), 2);
  });

  it('calcule une marge nette cohérente avec la décomposition', () => {
    const b = computeBreakdown(chemise);
    expect(b.netProfit).toBeCloseTo(b.netRevenue - b.totalCost, 2);
    expect(b.netMargin).toBeCloseTo(b.netProfit / b.netRevenue, 4);
    expect(b.netMargin).toBeGreaterThan(0.3);          // cette pièce est rentable
  });

  it('place la marge brute au-dessus de la marge nette', () => {
    const b = computeBreakdown(chemise);
    expect(b.grossProfit).toBeGreaterThan(b.netProfit);
  });

  it('détecte une vente à perte', () => {
    const r = runProfitMargin({ ...chemise, sellingPrice: 45 });
    expect(r.status).toBe('loss');
    expect(r.findings.some((f) => f.title.includes('perte'))).toBe(true);
  });

  it('calcule un prix plancher sous lequel la vente est à perte', () => {
    const b = computeBreakdown(chemise);
    const be = computeBreakEven(chemise, b);
    const atFloor = computeBreakdown({ ...chemise, sellingPrice: be.minPrice });
    // Au prix plancher, le bénéfice net est nul à l'arrondi près
    expect(Math.abs(atFloor.netProfit)).toBeLessThan(1);
    const below = computeBreakdown({ ...chemise, sellingPrice: be.minPrice - 10 });
    expect(below.netProfit).toBeLessThan(0);
  });

  it('produit une grille de prix qui atteint réellement la marge cible', () => {
    const grid = computePricingGrid(chemise, [0.25]);
    const [row] = grid;
    const check = computeBreakdown({ ...chemise, sellingPrice: row.price });
    expect(check.netMargin).toBeCloseTo(0.25, 2);
  });

  it('classe le statut selon les seuils du dépôt (20 % / 5 %)', () => {
    expect(runProfitMargin({ ...chemise, sellingPrice: 129 }).status).toBe('healthy');
    const faible = runProfitMargin({ ...chemise, productCost: 85, sellingPrice: 129 });
    expect(['warning', 'danger', 'loss']).toContain(faible.status);
  });

  it('signale les données manquantes au lieu de les inventer', () => {
    const r = runProfitMargin({ ...chemise, productCost: 0, monthlyFixedCosts: undefined });
    expect(r.dataGaps.length).toBeGreaterThan(0);
    expect(r.dataGaps.join(' ')).toContain('Coût d’achat');
  });
});

/* ══════════════════════ Chaîne d'approvisionnement ════════════════════ */

describe('moteur supply-chain', () => {
  const base = {
    channel: 'shopify' as const, productCost: 31.5, sellingPrice: 129,
    inboundShippingPerUnit: 3.2, fulfillmentFee: 2.1, storageFeePerUnit: 0.4,
    adSpendRatio: 0.12, supplierPaymentDays: 30, productionDays: 18,
    shippingDays: 6, inventoryDays: 40, dailySales: 1.5,
  };

  it('conserve les référentiels du script d’origine', () => {
    expect(BENCHMARKS.shopify.gross_margin.healthy).toBe(0.6);
    expect(BENCHMARKS.shopify.cash_cycle.healthy).toBe(45);
    expect(BENCHMARKS.amazon.cash_cycle.healthy).toBe(90);
    expect(BENCHMARKS.tiktok.inventory_days.healthy).toBe(30);
  });

  it('calcule le cycle de trésorerie en déduisant le délai fournisseur', () => {
    const r = runSupplyChain(base);
    const cash = r.metrics.find((m) => m.key === 'cash_cycle');
    // 18 + 6 + 40 + 3 (encaissement Shopify) − 30
    expect(cash?.value).toBe(37);
  });

  it('allonge le cycle quand le fournisseur est payé à la commande', () => {
    const avec = runSupplyChain(base).metrics.find((m) => m.key === 'cash_cycle')?.value as number;
    const sans = runSupplyChain({ ...base, supplierPaymentDays: 0 })
      .metrics.find((m) => m.key === 'cash_cycle')?.value as number;
    expect(sans - avec).toBe(30);
  });

  it('calcule une quantité économique de commande conforme à la formule EOQ', () => {
    const r = runSupplyChain({ ...base, orderingCostPerOrder: 60, annualHoldingCostRate: 0.25 });
    const annualDemand = 1.5 * 365;
    const expected = Math.ceil(Math.sqrt((2 * annualDemand * 60) / (31.5 * 0.25)));
    expect((r.raw as { eoq: number }).eoq).toBe(expected);
  });

  it('n’invente pas d’EOQ en l’absence de ventes', () => {
    const r = runSupplyChain({ ...base, dailySales: undefined });
    expect((r.raw as { eoq: number | null }).eoq).toBeNull();
    expect(r.dataGaps.join(' ')).toContain('vente journalière');
  });
});

/* ═══════════════════════════ SEO de fiche ═════════════════════════════ */

describe('moteur listing-seo', () => {
  const bonneFiche = {
    productName: 'Chemise popeline Ivoire',
    seoTitle: 'Chemise popeline ivoire, col italien — La Sappe Authentique',
    seoDescription: 'Popeline de coton peigné 120 fils, col italien tenu par baleines amovibles, poignets mousquetaire. Coupe ajustée, du S au XXL, livraison offerte dès 120 €.',
    description: Array(60).fill('popeline coton col italien chemise élégante coupe ajustée entretien lavage').join(' '),
    tags: ['chemise popeline', 'col italien', 'coton peigné', 'chemise homme', 'chemise blanche', 'popeline', 'chemise habillée', 'poignets mousquetaire'],
    imageCount: 6, imagesWithAlt: 6,
    attributes: { composition: true, careGuide: true, category: true, weight: true },
    targetKeywords: ['chemise popeline', 'col italien', 'coton peigné'],
    variantCount: 15, hasReviews: true,
  };

  it('note correctement une fiche complète', () => {
    const r = runListingSeo(bonneFiche);
    const total = r.metrics.find((m) => m.key === 'total')?.value as number;
    expect(total).toBeGreaterThanOrEqual(80);
    expect(r.status).toBe('healthy');
  });

  it('respecte la pondération 30/25/20/15/10 du script d’origine', () => {
    const r = runListingSeo(bonneFiche);
    const g = (k: string) => r.metrics.find((m) => m.key === k)?.value as number;
    const recomputed = Math.round(
      g('title') * 0.3 + g('keywords') * 0.25 + g('description') * 0.2 +
      g('attributes') * 0.15 + g('images') * 0.1);
    expect(g('total')).toBe(recomputed);
  });

  it('sanctionne une fiche vide', () => {
    const r = runListingSeo({ ...bonneFiche, seoTitle: '', seoDescription: null,
      description: '', tags: [], imageCount: 0, imagesWithAlt: 0,
      attributes: { composition: false, careGuide: false, category: false, weight: false },
      hasReviews: false });
    expect(r.metrics.find((m) => m.key === 'total')?.value).toBeLessThan(20);
    expect(r.status).toBe('danger');
  });

  it('sanctionne un titre tout en majuscules', () => {
    const normal = runListingSeo(bonneFiche);
    const caps = runListingSeo({ ...bonneFiche, seoTitle: bonneFiche.seoTitle.toUpperCase() });
    expect(caps.metrics.find((m) => m.key === 'title')?.value)
      .toBeLessThan(normal.metrics.find((m) => m.key === 'title')?.value as number);
  });

  it('pénalise l’absence de texte alternatif', () => {
    const r = runListingSeo({ ...bonneFiche, imagesWithAlt: 0 });
    expect(r.metrics.find((m) => m.key === 'images')?.value).toBeLessThan(70);
  });
});

/* ════════════════════ Repricing : les garde-fous ══════════════════════ */

describe('moteur dynamic-pricing — garde-fous', () => {
  const candidat = {
    productId: 'p1', variantId: null, sku: 'SKU1', name: 'Pull mérinos',
    currentPrice: 179, unitCost: 60, netMargin: 0.14,
    competitorPrices: [209, 219, 229], unitsSold30d: 12,
    stockAvailable: 20, daysOfCover: 50,
  };
  const input = {
    candidates: [candidat], targetNetMargin: 0.25, maxChangePct: 0.08,
    minMarkupOverCost: 1.25, positioning: 'match' as const,
  };

  it('ne dépasse jamais la variation maximale autorisée', () => {
    const r = runDynamicPricing(input);
    const props = (r.raw as { proposals: { proposedPrice: number; changePct: number }[] }).proposals;
    for (const p of props) expect(Math.abs(p.changePct)).toBeLessThanOrEqual(0.08 + 1e-9);
  });

  it('ne propose jamais un prix sous le plancher de coût', () => {
    const r = runDynamicPricing({
      ...input,
      candidates: [{ ...candidat, currentPrice: 300, unitCost: 100, netMargin: 0.4,
                     competitorPrices: [180, 190], daysOfCover: 400, unitsSold30d: 0 }],
    });
    const props = (r.raw as { proposals: { proposedPrice: number }[] }).proposals;
    expect(props.length).toBeGreaterThan(0);
    // Coût complet implicite : 300 × (1 − 0,40) = 180 ⇒ plancher 225
    for (const p of props) expect(p.proposedPrice).toBeGreaterThanOrEqual(225 - 0.01);
  });

  it('signale explicitement une référence déjà vendue sous son plancher', () => {
    const r = runDynamicPricing({
      ...input,
      candidates: [{ ...candidat, currentPrice: 80, unitCost: 70, netMargin: 0.02,
                     competitorPrices: [40, 45], daysOfCover: 400, unitsSold30d: 0 }],
    });
    const props = (r.raw as { proposals: { proposedPrice: number; floorUnreachable: boolean }[] }).proposals;
    expect(props.length).toBe(1);
    // La hausse reste bornée à +8 %, et le conflit est annoncé plutôt que masqué
    expect(props[0].proposedPrice).toBeLessThanOrEqual(80 * 1.08 + 0.01);
    expect(props[0].floorUnreachable).toBe(true);
    expect(r.findings.some((f) => f.title.includes('sous leur prix plancher'))).toBe(true);
  });

  it('exige systématiquement une approbation pour tout changement de prix', () => {
    const r = runDynamicPricing(input);
    const priceRecs = r.recommendations.filter(
      (rec) => rec.actionType === 'price_change' || rec.actionType === 'bulk_price_change');
    expect(priceRecs.length).toBeGreaterThan(0);
    for (const rec of priceRecs) expect(rec.requiresApproval).toBe(true);
  });

  it('propose une hausse quand la marge est sous l’objectif et le marché plus haut', () => {
    const r = runDynamicPricing(input);
    const props = (r.raw as { proposals: { changePct: number }[] }).proposals;
    expect(props.length).toBe(1);
    expect(props[0].changePct).toBeGreaterThan(0);
  });

  it('ne propose rien quand tout est conforme', () => {
    const r = runDynamicPricing({
      ...input,
      candidates: [{ ...candidat, netMargin: 0.3, competitorPrices: [179], daysOfCover: 60 }],
    });
    expect((r.raw as { proposals: unknown[] }).proposals.length).toBe(0);
    expect(r.status).toBe('healthy');
  });
});

/* ═══════════════════════════ Stocks ═══════════════════════════════════ */

describe('moteur inventory-forecast', () => {
  const ligne = {
    variantId: 'v1', productId: 'p1', sku: 'SKU1',
    productName: 'Chemise', variantTitle: 'M / Ivoire',
    onHand: 10, reserved: 0, available: 10, reorderPoint: 4,
    unitCost: 31.5, unitPrice: 129, unitsSoldWindow: 30, windowDays: 30,
    leadTimeDays: 24,
  };
  const input = {
    lines: [ligne], serviceLevel: '0.95' as const, demandVariability: 0.3,
    orderingCostPerOrder: 60, annualHoldingCostRate: 0.25,
  };

  it('calcule la vélocité et la couverture réelles', () => {
    const r = runInventoryForecast(input);
    const row = (r.raw as { rows: { velocity: number; daysOfCover: number }[] }).rows[0];
    expect(row.velocity).toBeCloseTo(1, 3);            // 30 unités / 30 jours
    expect(row.daysOfCover).toBeCloseTo(10, 1);        // 10 disponibles / 1 par jour
  });

  it('calcule le stock de sécurité avec le coefficient z du taux de service', () => {
    const r = runInventoryForecast(input);
    const row = (r.raw as { rows: { safetyStock: number }[] }).rows[0];
    expect(row.safetyStock).toBe(Math.ceil(1.645 * 1 * 0.3 * Math.sqrt(24)));
  });

  it('augmente le stock de sécurité avec le taux de service', () => {
    const s95 = (runInventoryForecast(input).raw as { rows: { safetyStock: number }[] }).rows[0].safetyStock;
    const s99 = (runInventoryForecast({ ...input, serviceLevel: '0.99' })
      .raw as { rows: { safetyStock: number }[] }).rows[0].safetyStock;
    expect(s99).toBeGreaterThan(s95);
  });

  it('déclenche un réapprovisionnement sous le point de commande', () => {
    const r = runInventoryForecast(input);
    // disponible 10 < point de commande (24 + sécurité)
    expect(r.recommendations.some((rec) => rec.actionType === 'purchase_order')).toBe(true);
    expect(r.recommendations.find((rec) => rec.actionType === 'purchase_order')?.requiresApproval).toBe(true);
  });

  it('identifie le stock dormant et sa valeur', () => {
    const r = runInventoryForecast({
      ...input,
      lines: [{ ...ligne, unitsSoldWindow: 0, onHand: 20, available: 20 }],
    });
    expect(r.metrics.find((m) => m.key === 'dead_stock')?.value).toBe(1);
    expect(r.metrics.find((m) => m.key === 'dead_value')?.value).toBeCloseTo(20 * 31.5, 2);
  });

  it('classe les références selon la loi de Pareto', () => {
    const r = runInventoryForecast({
      ...input,
      lines: [
        { ...ligne, variantId: 'a', sku: 'A', unitsSoldWindow: 100 },
        { ...ligne, variantId: 'b', sku: 'B', unitsSoldWindow: 20 },
        { ...ligne, variantId: 'c', sku: 'C', unitsSoldWindow: 1 },
      ],
    });
    const rows = (r.raw as { rows: { sku: string; abc: string }[] }).rows;
    expect(rows.find((x) => x.sku === 'A')?.abc).toBe('A');
    expect(rows.find((x) => x.sku === 'C')?.abc).toBe('C');
  });
});

/* ════════════════════ Économie unitaire et croissance ════════════════ */

describe('moteur unit-economics', () => {
  const input = {
    windowDays: 90, revenue: 48000, cogs: 16800, orders: 240, customers: 190,
    repeatCustomers: 42, sessions: 14000, marketingSpend: 7600,
    monthlyFixedCosts: 2500, targetNetMargin: 0.25,
    shippingCost: 1400, discountTotal: 2200,
  };

  it('calcule panier moyen, marge brute et taux de réachat', () => {
    const r = runUnitEconomics(input);
    expect(r.metrics.find((m) => m.key === 'aov')?.value).toBeCloseTo(200, 1);
    expect(r.metrics.find((m) => m.key === 'gross_margin')?.value).toBeCloseTo(65, 1);
    expect(r.metrics.find((m) => m.key === 'repeat_rate')?.value).toBeCloseTo(22.1, 1);
  });

  it('calcule le CAC et le ratio LTV / CAC', () => {
    const r = runUnitEconomics(input);
    expect(r.metrics.find((m) => m.key === 'cac')?.value).toBeCloseTo(40, 1);
    const ratio = r.metrics.find((m) => m.key === 'ltv_cac')?.value as number;
    expect(ratio).toBeGreaterThan(0);
  });

  it('désigne un levier prioritaire chiffré', () => {
    const r = runUnitEconomics(input);
    expect(r.recommendations[0].title).toMatch(/Levier prioritaire/);
    expect(r.recommendations[0].title).toMatch(/\d/);
  });

  it('ne calcule ni CAC ni conversion sans les données, et le dit', () => {
    const r = runUnitEconomics({ ...input, marketingSpend: null, sessions: null });
    expect(r.metrics.find((m) => m.key === 'cac')).toBeUndefined();
    expect(r.dataGaps.length).toBeGreaterThanOrEqual(2);
  });

  it('reste exploitable sur une boutique sans aucune vente', () => {
    const r = runUnitEconomics({ ...input, revenue: 0, cogs: 0, orders: 0,
      customers: 0, repeatCustomers: 0, marketingSpend: null, sessions: null });
    expect(r.summary).toContain('Pas encore de commandes');
    expect(Number.isFinite(r.metrics.find((m) => m.key === 'aov')?.value as number)).toBe(true);
  });
});

/* ═════════════════════════════ Avis ═══════════════════════════════════ */

describe('moteur review-analysis', () => {
  const mk = (id: string, rating: number, body: string, verified = true) => ({
    id, rating, title: null, body, authorName: 'Client', isVerified: verified,
    createdAt: '2026-10-0' + ((Number(id) % 9) + 1) + 'T10:00:00Z',
  });

  it('extrait les points de friction par thème', () => {
    const r = runReviewAnalysis({
      productName: 'Chemise',
      reviews: [
        mk('1', 2, 'Taille trop petit, j’ai dû prendre une taille au-dessus'),
        mk('2', 2, 'Ne taille pas comme indiqué, trop serré aux épaules'),
        mk('3', 5, 'Très bonne qualité, tombe bien, belle matière'),
      ],
    });
    const pains = (r.raw as { pains: { theme: string; count: number }[] }).pains;
    expect(pains[0].theme).toBe('Taille et coupe');
    expect(pains[0].count).toBe(2);
  });

  it('recommande en priorité le guide des tailles quand la taille revient', () => {
    const r = runReviewAnalysis({
      productName: 'Chemise',
      reviews: [mk('1', 2, 'trop petit'), mk('2', 2, 'ne taille pas')],
    });
    expect(r.recommendations[0].title).toMatch(/guide des tailles/i);
  });

  it('détecte des avis au contenu suspectement similaire', () => {
    const texte = 'Produit absolument parfait je recommande vivement cette boutique exceptionnelle';
    const r = runReviewAnalysis({
      productName: 'Chemise',
      reviews: [mk('1', 5, texte), mk('2', 5, texte + ' vraiment')],
    });
    expect((r.raw as { authenticityFlags: string[] }).authenticityFlags.join(' ')).toContain('similaire');
  });

  it('gère proprement l’absence d’avis', () => {
    const r = runReviewAnalysis({ productName: 'Chemise', reviews: [] });
    expect(r.metrics[0].value).toBe(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.dataGaps.length).toBeGreaterThan(0);
  });
});

/* ══════════════════════ Opportunité produit ══════════════════════════ */

describe('moteur opportunity-score', () => {
  const idee = {
    title: 'Ceinture cuir tressé', categoryHint: 'accessoires',
    monthlySearchVolume: 2400, trend: 0.15, isSeasonal: false,
    competitorCount: 12, competitorPrices: [79, 89, 95], dominantBrand: false,
    estimatedUnitCost: 18, targetSellingPrice: 89, estimatedShippingCost: 2.4,
    expectedReturnRate: 0.08, vatRate: 0.2,
    leadTimeDays: 28, minOrderQuantity: 30, unitWeightGrams: 220,
    isFragile: false, isRegulated: false,
  };

  it('note une bonne opportunité favorablement', () => {
    const r = runOpportunityScore(idee);
    expect(r.metrics.find((m) => m.key === 'total')?.value).toBeGreaterThanOrEqual(60);
    expect((r.raw as { verdict: string }).verdict).toMatch(/tester/i);
  });

  it('écarte une idée non rentable quel que soit son potentiel marché', () => {
    const r = runOpportunityScore({ ...idee, estimatedUnitCost: 80, targetSellingPrice: 89 });
    expect(r.status).toBe('loss');
    expect((r.raw as { verdict: string }).verdict).toMatch(/écarter/i);
  });

  it('note la demande de façon neutre plutôt que de l’inventer', () => {
    const r = runOpportunityScore({ ...idee, monthlySearchVolume: null, trend: null });
    expect(r.metrics.find((m) => m.key === 'demand')?.value).toBe(50);
    expect(r.dataGaps.join(' ')).toContain('Volume de recherche');
  });

  it('calcule la marge nette réelle au prix visé', () => {
    const r = runOpportunityScore(idee);
    const netPrice = 89 / 1.2;
    const cost = 18 + 2.4 + 0.08 * 18 * 0.5;
    expect(r.metrics.find((m) => m.key === 'net_margin')?.value)
      .toBeCloseTo(((netPrice - cost) / netPrice) * 100, 1);
  });

  it('pénalise un investissement initial lourd', () => {
    const petit = runOpportunityScore(idee).metrics.find((m) => m.key === 'logistics')?.value as number;
    const gros = runOpportunityScore({ ...idee, minOrderQuantity: 600 })
      .metrics.find((m) => m.key === 'logistics')?.value as number;
    expect(gros).toBeLessThan(petit);
  });
});

/* ════════════════════════ Tunnel de conversion ═══════════════════════ */

describe('moteur funnel-cro', () => {
  const input = {
    stages: [
      { key: 'session', label: 'Sessions', count: 10000 },
      { key: 'product', label: 'Fiches produit vues', count: 4200 },
      { key: 'cart', label: 'Ajouts au panier', count: 300 },
      { key: 'checkout', label: 'Paiements entamés', count: 150 },
      { key: 'order', label: 'Commandes', count: 90 },
    ],
    averageOrderValue: 180, grossMargin: 0.62, windowDays: 30,
    checkoutRequiresAccount: true, shippingCostShownLate: true,
    paymentMethodCount: 1, hasGuestCheckout: false,
    productPageImageAvg: 2, hasSizeGuide: false, hasReviews: false,
    returnPolicyVisible: false,
  };

  it('calcule la conversion globale', () => {
    const r = runFunnelCro(input);
    expect(r.metrics.find((m) => m.key === 'overall')?.value).toBeCloseTo(0.9, 2);
  });

  it('identifie l’étape la plus coûteuse en marge', () => {
    const r = runFunnelCro(input);
    expect(r.findings.some((f) => f.title.includes('Étape la plus coûteuse'))).toBe(true);
  });

  it('détecte les frictions structurelles sans données de trafic', () => {
    const r = runFunnelCro({ ...input, stages: input.stages.map((s) => ({ ...s, count: 0 })) });
    const critiques = r.findings.filter((f) => f.severity === 'critical');
    expect(critiques.length).toBeGreaterThanOrEqual(3);
    expect(critiques.some((f) => f.title.match(/guide des tailles/i))).toBe(true);
  });

  it('dimensionne correctement un test A/B', () => {
    // Pour un taux de base de 5 % et un effet relatif de 10 %, l’ordre de
    // grandeur attendu est de quelques dizaines de milliers de visiteurs.
    const n = sampleSizePerVariant(0.05, 0.1);
    expect(n).not.toBeNull();
    expect(n as number).toBeGreaterThan(20000);
    expect(n as number).toBeLessThan(40000);
  });

  it('exige un échantillon plus grand pour détecter un effet plus petit', () => {
    const petit = sampleSizePerVariant(0.05, 0.05) as number;
    const grand = sampleSizePerVariant(0.05, 0.2) as number;
    expect(petit).toBeGreaterThan(grand);
  });
});

/* ══════════════════════════ Veille prix ══════════════════════════════ */

describe('moteur price-tracking', () => {
  const now = new Date().toISOString();
  const produit = {
    productId: 'p1', name: 'Pull mérinos', sku: 'SKU1',
    ourPrice: 179, unitCost: 60, netMargin: 0.3,
    observations: [
      { competitorName: 'A', competitorProductTitle: 'Pull', price: 209, shippingPrice: 0,
        inStock: true, observedAt: now, source: 'manual' as const },
      { competitorName: 'B', competitorProductTitle: 'Pull', price: 219, shippingPrice: 0,
        inStock: true, observedAt: now, source: 'manual' as const },
      { competitorName: 'C', competitorProductTitle: 'Pull', price: 229, shippingPrice: 0,
        inStock: true, observedAt: now, source: 'manual' as const },
    ],
  };

  it('calcule la médiane et le rang de prix', () => {
    const r = runPriceTracking({ products: [produit], deviationThreshold: 0.08, maxObservationAgeDays: 30 });
    const a = (r.raw as { analysed: { median: number; rank: number }[] }).analysed[0];
    expect(a.median).toBe(219);
    expect(a.rank).toBe(1);                            // nous sommes les moins chers
  });

  it('ignore les relevés périmés et le signale', () => {
    const vieux = new Date(Date.now() - 90 * 86400000).toISOString();
    const r = runPriceTracking({
      products: [{ ...produit, observations: produit.observations.map((o) => ({ ...o, observedAt: vieux })) }],
      deviationThreshold: 0.08, maxObservationAgeDays: 30,
    });
    expect((r.raw as { analysed: { median: number | null }[] }).analysed[0].median).toBeNull();
    expect(r.findings.some((f) => f.title.includes('sans relevé'))).toBe(true);
  });

  it('ne remonte un prix qu’à mi-chemin de la médiane, et sous approbation', () => {
    const r = runPriceTracking({ products: [produit], deviationThreshold: 0.08, maxObservationAgeDays: 30 });
    const rec = r.recommendations.find((x) => x.actionType === 'bulk_price_change');
    expect(rec?.requiresApproval).toBe(true);
    const changes = (rec?.payload as { changes: { new_price: number }[] }).changes;
    expect(changes[0].new_price).toBeCloseTo(179 + (219 - 179) * 0.5, 1);
  });

  it('indique clairement qu’il ne collecte rien lui-même', () => {
    const r = runPriceTracking({ products: [produit], deviationThreshold: 0.08, maxObservationAgeDays: 30 });
    expect(r.dataGaps.join(' ')).toContain('aucune collecte automatique');
  });
});

/* ═══════════════════════ Autres moteurs ══════════════════════════════ */

describe('moteur cross-border', () => {
  const input = {
    averageOrderValue: 180, averageUnitCost: 55, grossMargin: 0.62,
    internationalShippingCost: 9, marketCodes: [], ossRegistered: false,
    currentIntraEuRevenue: 12000,
  };

  it('alerte sur le dépassement du seuil OSS de 10 000 €', () => {
    const r = runCrossBorder(input);
    expect(r.status).toBe('danger');
    expect(r.findings.some((f) => f.title.includes('10 000'))).toBe(true);
  });

  it('privilégie les marchés francophones et simples', () => {
    const r = runCrossBorder({ ...input, currentIntraEuRevenue: 0 });
    const top = (r.raw as { scored: { market: { code: string } }[] }).scored[0];
    expect(['BE', 'LU', 'CH']).toContain(top.market.code);
  });

  it('signale les marchés où le client paiera des droits de douane', () => {
    const r = runCrossBorder({ ...input, marketCodes: ['US', 'CH'], currentIntraEuRevenue: 0 });
    expect(r.findings.some((f) => f.title.includes('droits'))).toBe(true);
  });

  it('rappelle que les taux fiscaux doivent être vérifiés', () => {
    const r = runCrossBorder(input);
    expect(r.dataGaps.join(' ')).toMatch(/vérifier/i);
  });
});

describe('moteur sales-analytics', () => {
  const day = (d: string, revenue: number) => ({ day: d, revenue, orders: 2,
    grossProfit: revenue * 0.6, units: 3 });

  it('calcule la croissance période sur période', () => {
    const r = runSalesAnalytics({
      windowDays: 7,
      current: [day('2026-11-01', 1000), day('2026-11-02', 1000)],
      previous: [day('2026-10-25', 800), day('2026-10-26', 800)],
      products: [],
    });
    expect(r.metrics.find((m) => m.key === 'growth')?.value).toBeCloseTo(25, 1);
  });

  it('détecte une concentration excessive du chiffre d’affaires', () => {
    const prod = (id: string, revenue: number) => ({
      productId: id, name: id.toUpperCase(), slug: id, unitsCurrent: 10,
      revenueCurrent: revenue, grossProfitCurrent: revenue * 0.6,
      unitsPrevious: 10, revenuePrevious: revenue, stockAvailable: 50,
      grossMargin: 0.6,
    });
    const r = runSalesAnalytics({
      windowDays: 30, current: [day('2026-11-01', 10000)], previous: [],
      // Trois références font 90 % du chiffre d’affaires sur six au catalogue
      products: [prod('a', 5000), prod('b', 2500), prod('c', 1500),
                 prod('d', 400), prod('e', 350), prod('f', 250)],
    });
    expect(r.findings.some((f) => f.title.includes('concentré'))).toBe(true);
  });

  it('ne crie pas à la concentration sur un catalogue de deux produits', () => {
    const prod = (id: string, revenue: number) => ({
      productId: id, name: id.toUpperCase(), slug: id, unitsCurrent: 10,
      revenueCurrent: revenue, grossProfitCurrent: revenue * 0.6,
      unitsPrevious: 10, revenuePrevious: revenue, stockAvailable: 50,
      grossMargin: 0.6,
    });
    const r = runSalesAnalytics({
      windowDays: 30, current: [day('2026-11-01', 10000)], previous: [],
      products: [prod('a', 9000), prod('b', 1000)],
    });
    expect(r.findings.some((f) => f.title.includes('concentré'))).toBe(false);
  });

  it('alerte sur un produit en accélération avec un stock insuffisant', () => {
    const r = runSalesAnalytics({
      windowDays: 30, current: [day('2026-11-01', 5000)], previous: [day('2026-10-01', 2000)],
      products: [
        { productId: 'a', name: 'Pull', slug: 'pull', unitsCurrent: 40, revenueCurrent: 5000,
          grossProfitCurrent: 3000, unitsPrevious: 10, revenuePrevious: 1200,
          stockAvailable: 3, grossMargin: 0.6 },
      ],
    });
    expect(r.findings.some((f) => f.title.includes('stock insuffisant'))).toBe(true);
  });
});

describe('moteur differentiation', () => {
  it('détecte la position fragile : plus cher sans être meilleur', () => {
    const r = runDifferentiation({
      productName: 'Veste', ourPrice: 500,
      competitorPrices: [{ name: 'A', price: 380 }, { name: 'B', price: 400 }],
      attributes: [
        { key: 'matiere', label: 'Matière', ours: 5, importance: 5,
          competitors: [{ name: 'A', value: 8 }, { name: 'B', value: 8 }] },
        { key: 'finitions', label: 'Finitions', ours: 4, importance: 4,
          competitors: [{ name: 'A', value: 7 }, { name: 'B', value: 7 }] },
      ],
      painThemes: [], praiseThemes: [],
    });
    expect((r.raw as { positioning: string }).positioning).toMatch(/fragile/i);
    expect(r.status).toBe('danger');
  });

  it('identifie un terrain libre sur un critère important', () => {
    const r = runDifferentiation({
      productName: 'Veste', ourPrice: 400,
      competitorPrices: [{ name: 'A', price: 400 }],
      attributes: [
        { key: 'sur-mesure', label: 'Retouches incluses', ours: 9, importance: 5,
          competitors: [{ name: 'A', value: 2 }] },
      ],
      painThemes: [], praiseThemes: [],
    });
    expect((r.raw as { whiteSpaces: string[] }).whiteSpaces).toContain('Retouches incluses');
  });
});

/* ═══════════════════════ Registre Nexscope ═══════════════════════════ */

describe('registre Nexscope', () => {
  it('contient les 162 modules issus de l’audit du dépôt', () => {
    expect(NEXSCOPE_SKILLS.length).toBe(162);
    expect(registryStats().total).toBe(162);
  });

  it('associe chaque module à moteur à un moteur réellement implémenté', () => {
    const withEngine = NEXSCOPE_SKILLS.filter((s) => s.engine_key);
    expect(withEngine.length).toBeGreaterThan(40);
    for (const s of withEngine) {
      expect(ENGINES[s.engine_key as string],
        `moteur manquant « ${s.engine_key} » pour le module ${s.slug}`).toBeDefined();
    }
  });

  it('expose un moteur pour chacune des 13 familles de calcul', () => {
    expect(Object.keys(ENGINES).length).toBe(13);
    for (const key of Object.keys(ENGINES)) {
      expect(skillsUsingEngine(key).length,
        `aucun module ne référence le moteur ${key}`).toBeGreaterThan(0);
    }
  });

  it('déclare le mode d’exécution de chaque module', () => {
    for (const s of NEXSCOPE_SKILLS) {
      expect(['engine', 'reasoning', 'hybrid']).toContain(s.execution_mode);
      if (s.execution_mode === 'hybrid' || s.execution_mode === 'engine')
        expect(s.engine_key, `${s.slug} déclare un mode calculé sans moteur`).not.toBeNull();
    }
  });

  it('documente ce qu’il faut connecter pour les modules à données externes', () => {
    for (const s of NEXSCOPE_SKILLS.filter((x) => x.requires_external_data))
      expect(s.external_data_note, `${s.slug} sans note de dépendance`).toBeTruthy();
  });

  it('conserve le chemin source réel de chaque module dans le dépôt', () => {
    for (const s of NEXSCOPE_SKILLS) {
      expect(s.source_path).toBeTruthy();
      expect(s.source_path).not.toContain('..');
    }
  });
});
