/**
 * MOTEUR — Notation d'une opportunité produit
 *
 * Porté depuis :
 *   dropshipping-product-research/SKILL.md, market-gap-analysis/SKILL.md,
 *   ebay-product-research/SKILL.md, tiktok-shop-product-research/SKILL.md,
 *   tiktok-shop-trending-products/SKILL.md, product-launch-strategy/SKILL.md
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Le dépôt évalue une opportunité sur quatre axes : demande, concurrence,
 * marge et faisabilité logistique. Cette implémentation chiffre les axes à
 * partir des données que vous saisissez et vérifie la cohérence économique
 * (marge réellement atteignable au prix visé).
 *
 * ⚠️ La demande et la concurrence ne peuvent pas être devinées : elles sont
 * saisies par vous, ou importées d'une source de données marché connectée.
 * Le moteur ne fabrique aucun chiffre de marché.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { clamp, eur, pct, round, safeDiv } from '../shared';

export interface OpportunityInput {
  title: string;
  categoryHint: string;

  // ── Axe demande (saisi ou importé) ──
  /** Volume de recherche mensuel estimé, si connu. */
  monthlySearchVolume: number | null;
  /** Tendance sur 12 mois : -1 (effondrement) à +1 (explosion). */
  trend: number | null;
  /** Saisonnalité marquée ? */
  isSeasonal: boolean;

  // ── Axe concurrence ──
  /** Nombre de vendeurs identifiés proposant un équivalent. */
  competitorCount: number | null;
  /** Prix relevés chez les concurrents. */
  competitorPrices: number[];
  /** Une marque domine-t-elle nettement le segment ? */
  dominantBrand: boolean;

  // ── Axe économique ──
  estimatedUnitCost: number;
  targetSellingPrice: number;
  estimatedShippingCost: number;
  expectedReturnRate: number;
  vatRate: number;

  // ── Axe logistique ──
  leadTimeDays: number;
  minOrderQuantity: number;
  unitWeightGrams: number;
  /** Produit fragile, volumineux ou réglementé ? */
  isFragile: boolean;
  isRegulated: boolean;
}

export function runOpportunityScore(i: OpportunityInput): EngineResult {
  const gaps: string[] = [];

  // ───── Demande (sur 100) ─────
  let demandScore: number;
  if (i.monthlySearchVolume === null) {
    demandScore = 50;   // note neutre : on ne fabrique pas de donnée
    gaps.push('Volume de recherche non renseigné : l’axe demande est noté de façon neutre (50/100). Saisir une estimation ou connecter une source de données mots-clés pour une note fondée.');
  } else {
    // Palier logarithmique : 100 recherches = 20, 1 000 = 50, 10 000 = 80, 50 000+ = 100
    demandScore = clamp(Math.round(20 + 30 * Math.log10(Math.max(i.monthlySearchVolume, 10) / 100)), 0, 100);
  }
  if (i.trend !== null) demandScore = clamp(Math.round(demandScore * (1 + i.trend * 0.3)), 0, 100);
  else gaps.push('Tendance non renseignée : la note de demande n’est pas ajustée par la dynamique du marché.');
  if (i.isSeasonal) demandScore = Math.round(demandScore * 0.9);

  // ───── Concurrence (sur 100 — une note haute signifie « peu de concurrence ») ─────
  let competitionScore: number;
  if (i.competitorCount === null) {
    competitionScore = 50;
    gaps.push('Nombre de concurrents non renseigné : l’axe concurrence est noté de façon neutre (50/100).');
  } else if (i.competitorCount === 0) {
    competitionScore = 60;   // pas de concurrence = souvent pas de marché
  } else if (i.competitorCount <= 5) competitionScore = 90;
  else if (i.competitorCount <= 15) competitionScore = 72;
  else if (i.competitorCount <= 40) competitionScore = 50;
  else if (i.competitorCount <= 100) competitionScore = 30;
  else competitionScore = 15;
  if (i.dominantBrand) competitionScore = Math.round(competitionScore * 0.65);

  // ───── Marge (sur 100) — calcul réel, pas une estimation ─────
  const netPrice = i.targetSellingPrice / (1 + i.vatRate);
  const totalUnitCost =
    i.estimatedUnitCost + i.estimatedShippingCost +
    i.expectedReturnRate * (i.estimatedUnitCost * 0.5);
  const netMargin = safeDiv(netPrice - totalUnitCost, netPrice);
  const markup = i.estimatedUnitCost > 0 ? safeDiv(netPrice, i.estimatedUnitCost) : 0;
  // 25 % de marge nette = 70 ; 40 % = 100 ; 10 % = 30 ; négatif = 0
  const marginScore = clamp(Math.round(netMargin * 250), 0, 100);

  // ───── Logistique (sur 100) ─────
  let logisticsScore = 100;
  if (i.leadTimeDays > 60) logisticsScore -= 35;
  else if (i.leadTimeDays > 35) logisticsScore -= 20;
  else if (i.leadTimeDays > 21) logisticsScore -= 8;
  const initialInvestment = i.minOrderQuantity * i.estimatedUnitCost;
  if (initialInvestment > 10000) logisticsScore -= 30;
  else if (initialInvestment > 5000) logisticsScore -= 18;
  else if (initialInvestment > 2000) logisticsScore -= 8;
  if (i.unitWeightGrams > 2000) logisticsScore -= 15;
  else if (i.unitWeightGrams > 1000) logisticsScore -= 7;
  if (i.isFragile) logisticsScore -= 12;
  if (i.isRegulated) logisticsScore -= 20;
  logisticsScore = clamp(logisticsScore, 0, 100);

  // ───── Note globale : demande 30 % · concurrence 25 % · marge 30 % · logistique 15 % ─────
  const total = Math.round(
    demandScore * 0.30 + competitionScore * 0.25 + marginScore * 0.30 + logisticsScore * 0.15);

  const verdict =
    netMargin <= 0 ? 'À écarter — non rentable au prix visé'
    : total >= 75 ? 'À tester en priorité'
    : total >= 60 ? 'À tester avec une première série limitée'
    : total >= 45 ? 'À approfondir avant décision'
    : 'À écarter';

  const marketMedian = i.competitorPrices.length
    ? [...i.competitorPrices].sort((a, b) => a - b)[Math.floor(i.competitorPrices.length / 2)]
    : null;

  const metrics: Metric[] = [
    { key: 'total', label: 'Note globale', value: total, unit: '/100',
      status: total >= 75 ? 'healthy' : total >= 60 ? 'warning' : 'danger', benchmark: 75 },
    { key: 'demand', label: 'Demande (30 %)', value: demandScore, unit: '/100',
      status: demandScore >= 70 ? 'healthy' : demandScore >= 50 ? 'warning' : 'danger' },
    { key: 'competition', label: 'Espace concurrentiel (25 %)', value: competitionScore, unit: '/100',
      status: competitionScore >= 70 ? 'healthy' : competitionScore >= 50 ? 'warning' : 'danger' },
    { key: 'margin', label: 'Potentiel de marge (30 %)', value: marginScore, unit: '/100',
      status: marginScore >= 70 ? 'healthy' : marginScore >= 40 ? 'warning' : 'danger' },
    { key: 'logistics', label: 'Faisabilité logistique (15 %)', value: logisticsScore, unit: '/100',
      status: logisticsScore >= 70 ? 'healthy' : logisticsScore >= 50 ? 'warning' : 'danger' },
    { key: 'net_margin', label: 'Marge nette au prix visé', value: round(netMargin * 100, 1), unit: '%',
      status: netMargin >= 0.25 ? 'healthy' : netMargin >= 0.1 ? 'warning' : 'loss' },
    { key: 'investment', label: 'Investissement initial', value: round(initialInvestment, 2), unit: '€' },
  ];

  const findings: Finding[] = [];
  if (netMargin <= 0)
    findings.push({ severity: 'critical', title: 'Non rentable au prix visé',
      detail: `Coût complet de ${eur(round(totalUnitCost, 2))} pour un prix HT de ${eur(round(netPrice, 2))}. Il faudrait vendre au moins ${eur(round(totalUnitCost / 0.75 * (1 + i.vatRate), 2))} TTC pour dégager 25 % de marge nette.` });
  else if (netMargin < 0.25)
    findings.push({ severity: 'warning', title: `Marge nette de ${pct(netMargin)} seulement`,
      detail: `Multiplicateur de ${round(markup, 2)}× sur le coût d’achat. En prêt-à-porter DTC, un multiplicateur de 3 à 4 est nécessaire pour financer acquisition, retours et charges fixes.` });

  if (marketMedian !== null && i.targetSellingPrice > marketMedian * 1.3)
    findings.push({ severity: 'warning', title: 'Prix visé nettement au-dessus du marché relevé',
      detail: `${eur(i.targetSellingPrice)} contre une médiane concurrente de ${eur(marketMedian)}, soit +${pct(safeDiv(i.targetSellingPrice - marketMedian, marketMedian))}. Un tel écart exige une différenciation visible et démontrable.` });
  else if (marketMedian !== null && i.targetSellingPrice < marketMedian * 0.75)
    findings.push({ severity: 'info', title: 'Prix visé bien en dessous du marché',
      detail: `${eur(i.targetSellingPrice)} contre ${eur(marketMedian)} de médiane. Vérifier que ce n’est pas une marge laissée sur la table.` });

  if (i.dominantBrand)
    findings.push({ severity: 'warning', title: 'Segment dominé par une marque établie',
      detail: 'Entrer face à un acteur dominant demande un angle de différenciation clair, pas seulement un prix inférieur.' });
  if (initialInvestment > 5000)
    findings.push({ severity: 'warning', title: `Investissement initial de ${eur(round(initialInvestment, 2))}`,
      detail: `${i.minOrderQuantity} unités au minimum à ${eur(i.estimatedUnitCost)}. Négocier une première série réduite, même à coût unitaire plus élevé, limite le risque de validation.` });
  if (i.leadTimeDays > 45)
    findings.push({ severity: 'warning', title: `Délai de ${i.leadTimeDays} jours`,
      detail: 'Un délai long interdit de réagir à la demande : prévoir le réassort avant même le lancement.' });
  if (i.isRegulated)
    findings.push({ severity: 'critical', title: 'Produit soumis à réglementation',
      detail: 'Étiquetage de composition, origine, normes textiles : à vérifier avant commande, pas après.' });

  const recommendations: Recommendation[] = [];
  if (netMargin > 0 && total >= 60) {
    const testQty = Math.max(Math.min(i.minOrderQuantity, 50), 1);
    recommendations.push({ priority: 1, title: `Tester avec une première série de ${testQty} unités`,
      detail: `Engagement de ${eur(round(testQty * i.estimatedUnitCost, 2))}. Objectif : écouler 60 % de la série en 60 jours avant de réassortir. En dessous, le produit ne trouve pas son public.`,
      requiresApproval: true, actionType: 'purchase_order',
      payload: { title: i.title, quantity: testQty, unit_cost: i.estimatedUnitCost,
                 total: round(testQty * i.estimatedUnitCost, 2) } });
  }
  if (netMargin < 0.25 && netMargin > 0) {
    const priceFor25 = round((totalUnitCost / 0.75) * (1 + i.vatRate), 2);
    recommendations.push({ priority: 1, title: `Viser ${eur(priceFor25)} TTC plutôt que ${eur(i.targetSellingPrice)}`,
      detail: `Prix nécessaire pour atteindre 25 % de marge nette.${marketMedian !== null ? ` À comparer à la médiane marché de ${eur(marketMedian)}.` : ''}` });
  }
  if (i.monthlySearchVolume === null)
    recommendations.push({ priority: 2, title: 'Documenter la demande avant d’engager du stock',
      detail: 'Même sans outil payant : volume de recherche interne à la boutique, demandes clients reçues, listes d’attente, ou test publicitaire à petit budget sur une page de pré-inscription.' });
  if (i.competitorCount === null)
    recommendations.push({ priority: 2, title: 'Relever les concurrents et leurs prix',
      detail: 'Le module de veille concurrentielle permet de saisir ou d’importer ces relevés, qui alimenteront ensuite automatiquement cette notation.' });

  const tables: EngineTable[] = [
    {
      title: 'Notation détaillée',
      columns: [{ key: 'axe', label: 'Axe' }, { key: 'poids', label: 'Poids', align: 'right' },
                { key: 'note', label: 'Note', align: 'right' }, { key: 'base', label: 'Base du calcul' }],
      rows: [
        { axe: 'Demande', poids: '30 %', note: `${demandScore}/100`,
          base: i.monthlySearchVolume !== null
            ? `${i.monthlySearchVolume} recherches / mois${i.trend !== null ? `, tendance ${i.trend >= 0 ? '+' : ''}${pct(i.trend)}` : ''}${i.isSeasonal ? ', saisonnier' : ''}`
            : 'non renseigné — note neutre' },
        { axe: 'Espace concurrentiel', poids: '25 %', note: `${competitionScore}/100`,
          base: i.competitorCount !== null
            ? `${i.competitorCount} concurrent(s)${i.dominantBrand ? ', marque dominante présente' : ''}`
            : 'non renseigné — note neutre' },
        { axe: 'Potentiel de marge', poids: '30 %', note: `${marginScore}/100`,
          base: `marge nette ${pct(netMargin)}, multiplicateur ${round(markup, 2)}×` },
        { axe: 'Faisabilité logistique', poids: '15 %', note: `${logisticsScore}/100`,
          base: `${i.leadTimeDays} j de délai, ${i.minOrderQuantity} unités minimum, ${i.unitWeightGrams} g${i.isFragile ? ', fragile' : ''}${i.isRegulated ? ', réglementé' : ''}` },
      ],
    },
    {
      title: 'Économie unitaire au prix visé',
      columns: [{ key: 'poste', label: 'Poste' }, { key: 'montant', label: 'Montant', align: 'right' }],
      rows: [
        { poste: `Prix de vente TTC`, montant: eur(i.targetSellingPrice) },
        { poste: `Prix HT (TVA ${pct(i.vatRate, 0)})`, montant: eur(round(netPrice, 2)) },
        { poste: 'Coût d’achat', montant: `− ${eur(i.estimatedUnitCost)}` },
        { poste: 'Logistique', montant: `− ${eur(i.estimatedShippingCost)}` },
        { poste: `Provision retours (${pct(i.expectedReturnRate, 0)})`,
          montant: `− ${eur(round(i.expectedReturnRate * i.estimatedUnitCost * 0.5, 2))}` },
        { poste: 'Marge nette unitaire', montant: `${eur(round(netPrice - totalUnitCost, 2))} (${pct(netMargin)})` },
      ],
      note: 'Hors publicité et charges fixes : la marge réelle sera inférieure une fois l’acquisition payée.',
    },
  ];

  return {
    engineKey: 'opportunity-score',
    title: `Opportunité — ${i.title}`,
    summary: `${total}/100 — ${verdict}. Marge nette ${pct(netMargin)} au prix de ${eur(i.targetSellingPrice)}.`,
    status: netMargin <= 0 ? 'loss' : total >= 75 ? 'healthy' : total >= 60 ? 'warning' : 'danger',
    metrics, findings, recommendations, tables,
    raw: { total, verdict, demandScore, competitionScore, marginScore, logisticsScore,
           netMargin: round(netMargin, 4), markup: round(markup, 2),
           initialInvestment: round(initialInvestment, 2), marketMedian },
    dataGaps: gaps,
  };
}
