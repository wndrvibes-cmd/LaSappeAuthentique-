/**
 * MOTEUR — Calcul de marge et de rentabilité
 *
 * Portage TypeScript de :
 *   profit-margin-calculator/profit-margin-calculator-shopify/scripts/calculator.py
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Adaptations pour une boutique DTC européenne :
 *  • la « referral fee » marketplace devient la commission du prestataire
 *    de paiement (taux + part fixe), structure identique dans le calcul ;
 *  • les frais FBA deviennent préparation + logistique entrante ;
 *  • la TVA est traitée séparément (prix TTC → HT) car elle n'est pas un coût.
 *
 * Toutes les formules de décomposition, de point mort et de prix conseillé
 * sont conservées à l'identique.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, pct, profitStatus, round, safeDiv } from '../shared';

export interface ProfitMarginInput {
  sku: string;
  name: string;
  /** Prix de vente affiché. */
  sellingPrice: number;
  /** TVA applicable (0,20 = 20 %). Mettre 0 si les prix sont déjà HT. */
  vatRate: number;
  /** Les prix saisis incluent-ils la TVA ? */
  pricesIncludeVat: boolean;

  productCost: number;       // coût d'achat / fabrication
  inboundShipping: number;   // acheminement jusqu'à l'entrepôt, par unité
  handlingFee: number;       // préparation, emballage
  outboundShipping: number;  // expédition client non refacturée
  paymentFeeRate: number;    // ex. 0,029
  paymentFeeFixed: number;   // ex. 0,25
  adSpendRatio: number;      // part du prix consacrée à l'acquisition
  returnRate: number;        // taux de retour
  returnFee: number;         // coût de traitement d'un retour
  otherFees: number;

  /** Optionnels — point mort et répartition des charges fixes. */
  monthlyFixedCosts?: number;
  monthlyUnits?: number;
  targetMargins?: number[];
}

export interface ProfitMarginBreakdown {
  netRevenue: number;
  productCost: number;
  inboundShipping: number;
  handlingFee: number;
  outboundShipping: number;
  paymentFee: number;
  adCost: number;
  returnCost: number;
  otherFees: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  contributionMargin: number;
}

const DEFAULT_TARGETS = [0.15, 0.2, 0.25, 0.3, 0.4];

/** Décomposition des coûts — `calculate_costs()` du script d'origine. */
export function computeBreakdown(i: ProfitMarginInput): ProfitMarginBreakdown {
  // Le chiffre d'affaires retenu est HT : la TVA collectée n'appartient
  // pas à l'entreprise et ne doit donc pas entrer dans la marge.
  const netRevenue = i.pricesIncludeVat
    ? round(i.sellingPrice / (1 + i.vatRate), 2)
    : round(i.sellingPrice, 2);

  // La commission PSP s'applique au montant réellement encaissé (TTC).
  const paymentFee = round(i.sellingPrice * i.paymentFeeRate + i.paymentFeeFixed, 2);
  const adCost = round(netRevenue * i.adSpendRatio, 2);

  // Coût des retours = taux × (traitement + 50 % du coût produit perdu).
  // Formule reprise telle quelle du script Nexscope.
  const returnCost = round(i.returnRate * (i.returnFee + i.productCost * 0.5), 2);

  const totalCost = round(
    i.productCost + i.inboundShipping + i.handlingFee + i.outboundShipping +
    paymentFee + adCost + returnCost + i.otherFees, 2);

  const grossProfit = round(
    netRevenue - i.productCost - i.inboundShipping - i.handlingFee - paymentFee, 2);
  const netProfit = round(netRevenue - totalCost, 2);
  const contributionMargin = round(
    netRevenue - i.productCost - i.inboundShipping - i.handlingFee -
    i.outboundShipping - paymentFee - returnCost, 2);

  return {
    netRevenue,
    productCost: i.productCost,
    inboundShipping: i.inboundShipping,
    handlingFee: i.handlingFee,
    outboundShipping: i.outboundShipping,
    paymentFee,
    adCost,
    returnCost,
    otherFees: i.otherFees,
    totalCost,
    grossProfit,
    grossMargin: round(safeDiv(grossProfit, netRevenue), 4),
    netProfit,
    netMargin: round(safeDiv(netProfit, netRevenue), 4),
    contributionMargin,
  };
}

/**
 * Taux de commission du prestataire de paiement rapporte au chiffre
 * d'affaires HT. La commission est prelevee sur le montant encaisse (TTC)
 * alors que la marge se mesure sur le HT : le taux effectif sur le HT vaut
 * donc `taux x (1 + TVA)`. C'est ce qui permet au prix plancher et a la
 * grille de prix d'atteindre exactement la marge visee.
 */
function effectivePaymentRate(i: ProfitMarginInput): number {
  return i.pricesIncludeVat ? i.paymentFeeRate * (1 + i.vatRate) : i.paymentFeeRate;
}

/** Couts independants du prix de vente. */
function priceIndependentCost(i: ProfitMarginInput): number {
  return (
    i.productCost + i.inboundShipping + i.handlingFee + i.outboundShipping +
    i.paymentFeeFixed + i.otherFees +
    i.returnRate * (i.returnFee + i.productCost * 0.5)
  );
}

/**
 * Point mort — `calculate_break_even()` du script d'origine, resolu
 * algebriquement : commission et publicite etant proportionnelles au prix,
 * le prix plancher est la solution de
 *
 *   P_HT x (1 - tauxEffectif - ratioPub) = coutsFixes
 */
export function computeBreakEven(i: ProfitMarginInput, b: ProfitMarginBreakdown) {
  const fixedCost = priceIndependentCost(i);
  const denom = 1 - effectivePaymentRate(i) - i.adSpendRatio;
  const minPriceHt = denom > 0 ? fixedCost / denom : fixedCost * 2;
  const minPrice = i.pricesIncludeVat ? minPriceHt * (1 + i.vatRate) : minPriceHt;

  const unitsToCoverFixed =
    i.monthlyFixedCosts && i.monthlyFixedCosts > 0 && b.netProfit > 0
      ? Math.ceil(i.monthlyFixedCosts / b.netProfit)
      : null;

  return {
    minPrice: round(minPrice, 2),
    variableCost: round(fixedCost, 2),
    safetyMargin: round(safeDiv(i.sellingPrice - minPrice, i.sellingPrice), 4),
    aboveBreakEven: round(safeDiv(i.sellingPrice - minPrice, minPrice), 4),
    unitsToCoverFixedCosts: unitsToCoverFixed,
  };
}

/**
 * Prix conseilles — `calculate_pricing_suggestions()` du script d'origine :
 *
 *   P_HT = coutsFixes / (1 - margeCible - tauxEffectif - ratioPub)
 */
export function computePricingGrid(i: ProfitMarginInput, targets = DEFAULT_TARGETS) {
  const fixedCost = priceIndependentCost(i);
  const rate = effectivePaymentRate(i);

  return targets
    .map((target) => {
      const denom = 1 - target - rate - i.adSpendRatio;
      if (denom <= 0) return null;
      const priceHt = fixedCost / denom;
      const price = i.pricesIncludeVat ? priceHt * (1 + i.vatRate) : priceHt;
      return {
        targetMargin: target,
        price: round(price, 2),
        profitPerUnit: round(priceHt * target, 2),
        deltaVsCurrent: round(price - i.sellingPrice, 2),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function runProfitMargin(i: ProfitMarginInput): EngineResult {
  const b = computeBreakdown(i);
  const be = computeBreakEven(i, b);
  const grid = computePricingGrid(i, i.targetMargins ?? DEFAULT_TARGETS);
  const status = profitStatus(b.netMargin);

  const metrics: Metric[] = [
    { key: 'net_margin', label: 'Marge nette', value: round(b.netMargin * 100, 1), unit: '%',
      status, benchmark: 20, hint: 'Après tous les coûts variables, hors charges fixes.' },
    { key: 'gross_margin', label: 'Marge brute', value: round(b.grossMargin * 100, 1), unit: '%',
      status: b.grossMargin >= 0.6 ? 'healthy' : b.grossMargin >= 0.45 ? 'warning' : 'danger',
      benchmark: 60, hint: 'Référence DTC du dépôt Nexscope : 60 % pour absorber l’acquisition.' },
    { key: 'net_profit', label: 'Bénéfice par unité', value: b.netProfit, unit: '€', status },
    { key: 'contribution', label: 'Marge de contribution', value: b.contributionMargin, unit: '€',
      hint: 'Ce que chaque vente laisse avant publicité et charges fixes.' },
    { key: 'break_even', label: 'Prix plancher', value: be.minPrice, unit: '€',
      hint: 'En dessous, chaque vente est à perte.' },
    { key: 'safety', label: 'Marge de sécurité sur le prix', value: round(be.safetyMargin * 100, 1),
      unit: '%', status: be.safetyMargin >= 0.25 ? 'healthy' : be.safetyMargin >= 0.1 ? 'warning' : 'danger' },
  ];

  const findings: Finding[] = [];
  if (b.netMargin < 0) {
    findings.push({ severity: 'critical', title: 'Vente à perte',
      detail: `Au prix de ${eur(i.sellingPrice)}, chaque unité vendue coûte ${eur(Math.abs(b.netProfit))}. Le prix plancher est de ${eur(be.minPrice)}.`,
      impact: `Perte de ${eur(Math.abs(b.netProfit))} par unité` });
  } else if (b.netMargin < 0.05) {
    findings.push({ severity: 'critical', title: 'Marge nette sous les 5 %',
      detail: `Marge de ${pct(b.netMargin)} : le moindre aléa (retour, remise, hausse du fret) fait basculer la vente en perte.` });
  } else if (b.netMargin < 0.2) {
    findings.push({ severity: 'warning', title: 'Marge nette sous l’objectif de 20 %',
      detail: `Marge de ${pct(b.netMargin)}. Le seuil « sain » du référentiel Nexscope est 20 %.` });
  }

  // Détection du poste de coût dominant
  const costItems: [string, number][] = [
    ['coût produit', b.productCost], ['logistique entrante', b.inboundShipping],
    ['préparation', b.handlingFee], ['expédition client', b.outboundShipping],
    ['commission paiement', b.paymentFee], ['publicité', b.adCost],
    ['retours', b.returnCost], ['autres frais', b.otherFees],
  ];
  const [topLabel, topValue] = costItems.sort((a, c) => c[1] - a[1])[0];
  const topShare = safeDiv(topValue, b.netRevenue);
  if (topShare > 0.35) {
    findings.push({ severity: 'warning', title: `Le poste « ${topLabel} » pèse ${pct(topShare)} du CA HT`,
      detail: `${eur(topValue)} sur ${eur(b.netRevenue)}. C’est le levier de rentabilité le plus efficace à travailler en premier.` });
  }
  if (b.adCost > 0 && b.contributionMargin > 0 && b.adCost / b.contributionMargin > 0.6) {
    findings.push({ severity: 'warning', title: 'La publicité absorbe la marge de contribution',
      detail: `${eur(b.adCost)} de publicité pour ${eur(b.contributionMargin)} de contribution, soit ${pct(b.adCost / b.contributionMargin)}. Au-delà de 60 %, la croissance payante détruit du cash.` });
  }
  if (i.returnRate >= 0.15) {
    findings.push({ severity: 'warning', title: `Taux de retour élevé (${pct(i.returnRate)})`,
      detail: `Les retours coûtent ${eur(b.returnCost)} par unité vendue. Guide des tailles et photos portées sont les deux leviers les plus rentables.` });
  }

  const recommendations: Recommendation[] = [];
  const targetGrid = grid.find((g) => g.targetMargin === 0.25) ?? grid[0];
  if (targetGrid && b.netMargin < 0.2) {
    recommendations.push({
      priority: 1,
      title: `Porter le prix à ${eur(targetGrid.price)} pour atteindre ${pct(targetGrid.targetMargin, 0)} de marge`,
      detail: `Écart de ${eur(targetGrid.deltaVsCurrent)} par rapport au prix actuel (${eur(i.sellingPrice)}). À valider au regard du positionnement et des prix concurrents avant application.`,
      requiresApproval: true,
      actionType: 'price_change',
      payload: { sku: i.sku, current_price: i.sellingPrice, new_price: targetGrid.price,
                 target_margin: targetGrid.targetMargin },
    });
  }
  if (topShare > 0.35 && topLabel === 'coût produit') {
    recommendations.push({ priority: 2, title: 'Renégocier le coût d’achat ou augmenter la quantité commandée',
      detail: `Une baisse de 10 % du coût produit (${eur(b.productCost)} → ${eur(round(b.productCost * 0.9, 2))}) ferait passer la marge nette de ${pct(b.netMargin)} à ${pct(safeDiv(b.netProfit + b.productCost * 0.1, b.netRevenue))}.` });
  }
  if (b.outboundShipping > 0) {
    recommendations.push({ priority: 3, title: 'Vérifier le seuil de franco de port',
      detail: `L’expédition non refacturée coûte ${eur(b.outboundShipping)} par commande. Un franco placé à 3 fois le panier moyen protège la marge tout en augmentant le panier.` });
  }

  const tables: EngineTable[] = [
    {
      title: 'Décomposition du prix',
      columns: [
        { key: 'poste', label: 'Poste' },
        { key: 'montant', label: 'Montant', align: 'right' },
        { key: 'part', label: '% du CA HT', align: 'right' },
      ],
      rows: [
        { poste: 'Chiffre d’affaires HT', montant: eur(b.netRevenue), part: '100,0 %' },
        ...costItems.map(([label, value]) => ({
          poste: label.charAt(0).toUpperCase() + label.slice(1),
          montant: `− ${eur(value)}`,
          part: pct(safeDiv(value, b.netRevenue)),
        })),
        { poste: 'Coût total', montant: `− ${eur(b.totalCost)}`, part: pct(safeDiv(b.totalCost, b.netRevenue)) },
        { poste: 'Bénéfice net', montant: eur(b.netProfit), part: pct(b.netMargin) },
      ],
      note: i.pricesIncludeVat
        ? `Prix affiché ${eur(i.sellingPrice)} TTC — TVA ${pct(i.vatRate, 0)} exclue du calcul de marge.`
        : 'Prix saisis hors taxes.',
    },
    {
      title: 'Grille de prix conseillés',
      columns: [
        { key: 'cible', label: 'Marge nette cible' },
        { key: 'prix', label: 'Prix conseillé', align: 'right' },
        { key: 'benefice', label: 'Bénéfice / unité', align: 'right' },
        { key: 'ecart', label: 'Écart vs prix actuel', align: 'right' },
      ],
      rows: grid.map((g) => ({
        cible: pct(g.targetMargin, 0),
        prix: eur(g.price),
        benefice: eur(g.profitPerUnit),
        ecart: `${g.deltaVsCurrent >= 0 ? '+' : ''}${eur(g.deltaVsCurrent)}`,
      })),
      note: 'Prix calculés pour absorber la commission de paiement et le ratio publicitaire saisis.',
    },
  ];

  const dataGaps: string[] = [];
  if (!i.productCost) dataGaps.push('Coût d’achat non renseigné : la marge affichée est inexploitable. À saisir sur la fiche produit.');
  if (!i.adSpendRatio) dataGaps.push('Ratio publicitaire à 0 : la marge nette est optimiste si vous investissez en acquisition.');
  if (!i.monthlyFixedCosts) dataGaps.push('Charges fixes mensuelles non renseignées (paramètres boutique) : le point mort en volume n’est pas calculé.');
  if (!i.returnRate) dataGaps.push('Taux de retour à 0 : en prêt-à-porter, 10 à 20 % est la norme. Un taux réaliste change nettement le résultat.');

  const summary =
    b.netMargin < 0
      ? `Vente à perte : ${eur(b.netProfit)} par unité au prix de ${eur(i.sellingPrice)}.`
      : `Marge nette ${pct(b.netMargin)} · ${eur(b.netProfit)} de bénéfice par unité · prix plancher ${eur(be.minPrice)}.`;

  return {
    engineKey: 'profit-margin',
    title: `Rentabilité — ${i.name}`,
    summary,
    status,
    metrics,
    findings,
    recommendations,
    tables,
    raw: { breakdown: b, breakEven: be, pricingGrid: grid, input: i },
    dataGaps,
  };
}
