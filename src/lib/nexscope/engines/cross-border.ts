/**
 * MOTEUR — Expansion internationale
 *
 * Porté depuis :
 *   cross-border-ecommerce/SKILL.md (notation de marchés, TVA / IOSS / GST,
 *     logistique et localisation), shopify-international/SKILL.md,
 *   shopify-tax-compliance/SKILL.md, tiktok-shop-cross-border/SKILL.md
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * ⚠️ Les taux et seuils ci-dessous sont des valeurs de référence destinées
 * au cadrage d'une décision d'expansion. Ils évoluent et ne constituent pas
 * un conseil fiscal : faire valider par un professionnel avant de vendre.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, pct, round, safeDiv } from '../shared';

export interface MarketReference {
  code: string;
  name: string;
  currency: string;
  /** Taux de TVA standard, à titre de référence de cadrage. */
  vatRate: number;
  /** Régime applicable depuis la France. */
  regime: 'UE — guichet unique OSS' | 'UE — vente domestique' | 'Hors UE — export' | 'Hors UE — régime spécifique';
  /** Seuil d'exonération de droits de douane à l'import (en euros, indicatif). */
  dutyFreeThreshold: number | null;
  /** Indice de pouvoir d'achat relatif (France = 100), ordre de grandeur. */
  purchasingPower: number;
  /** Difficulté logistique et réglementaire : 1 = simple, 5 = complexe. */
  complexity: 1 | 2 | 3 | 4 | 5;
  /** Langue principale à prévoir pour la localisation. */
  language: string;
  notes: string;
}

/** Référentiel de cadrage — à vérifier avant toute mise en vente. */
export const MARKET_REFERENCE: MarketReference[] = [
  { code: 'FR', name: 'France', currency: 'EUR', vatRate: 0.20, regime: 'UE — vente domestique',
    dutyFreeThreshold: null, purchasingPower: 100, complexity: 1, language: 'français',
    notes: 'Marché domestique.' },
  { code: 'BE', name: 'Belgique', currency: 'EUR', vatRate: 0.21, regime: 'UE — guichet unique OSS',
    dutyFreeThreshold: null, purchasingPower: 104, complexity: 1, language: 'français / néerlandais',
    notes: 'Francophone en Wallonie et à Bruxelles : extension la plus simple depuis la France.' },
  { code: 'LU', name: 'Luxembourg', currency: 'EUR', vatRate: 0.17, regime: 'UE — guichet unique OSS',
    dutyFreeThreshold: null, purchasingPower: 148, complexity: 1, language: 'français',
    notes: 'Pouvoir d’achat élevé, marché petit mais très accessible.' },
  { code: 'DE', name: 'Allemagne', currency: 'EUR', vatRate: 0.19, regime: 'UE — guichet unique OSS',
    dutyFreeThreshold: null, purchasingPower: 112, complexity: 2, language: 'allemand',
    notes: 'Premier marché e-commerce de l’UE. Droit de retour exigeant, obligations d’information renforcées.' },
  { code: 'IT', name: 'Italie', currency: 'EUR', vatRate: 0.22, regime: 'UE — guichet unique OSS',
    dutyFreeThreshold: null, purchasingPower: 96, complexity: 2, language: 'italien',
    notes: 'Forte culture du vêtement tailleur, concurrence locale établie.' },
  { code: 'ES', name: 'Espagne', currency: 'EUR', vatRate: 0.21, regime: 'UE — guichet unique OSS',
    dutyFreeThreshold: null, purchasingPower: 89, complexity: 2, language: 'espagnol',
    notes: 'Sensibilité prix plus marquée, paiement à la livraison encore demandé.' },
  { code: 'NL', name: 'Pays-Bas', currency: 'EUR', vatRate: 0.21, regime: 'UE — guichet unique OSS',
    dutyFreeThreshold: null, purchasingPower: 115, complexity: 2, language: 'néerlandais',
    notes: 'Taux d’équipement e-commerce élevé, préférence pour le paiement iDEAL.' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', vatRate: 0.23, regime: 'UE — guichet unique OSS',
    dutyFreeThreshold: null, purchasingPower: 83, complexity: 2, language: 'portugais',
    notes: 'Proche des ateliers de confection ibériques.' },
  { code: 'CH', name: 'Suisse', currency: 'CHF', vatRate: 0.081, regime: 'Hors UE — export',
    dutyFreeThreshold: 65, purchasingPower: 158, complexity: 3, language: 'français / allemand',
    notes: 'Pouvoir d’achat le plus élevé d’Europe. Déclaration douanière obligatoire, TVA suisse faible.' },
  { code: 'GB', name: 'Royaume-Uni', currency: 'GBP', vatRate: 0.20, regime: 'Hors UE — export',
    dutyFreeThreshold: 0, purchasingPower: 108, complexity: 4, language: 'anglais',
    notes: 'Depuis le Brexit : enregistrement TVA requis dès la première vente B2C, droits de douane selon origine.' },
  { code: 'US', name: 'États-Unis', currency: 'USD', vatRate: 0, regime: 'Hors UE — régime spécifique',
    dutyFreeThreshold: 800, purchasingPower: 139, complexity: 4, language: 'anglais',
    notes: 'Pas de TVA mais une taxe de vente par État (sales tax) avec seuils de rattachement variables.' },
  { code: 'CA', name: 'Canada', currency: 'CAD', vatRate: 0.05, regime: 'Hors UE — régime spécifique',
    dutyFreeThreshold: 15, purchasingPower: 112, complexity: 4, language: 'français / anglais',
    notes: 'TPS fédérale plus taxes provinciales. Le Québec est francophone.' },
  { code: 'JP', name: 'Japon', currency: 'JPY', vatRate: 0.10, regime: 'Hors UE — régime spécifique',
    dutyFreeThreshold: 70, purchasingPower: 98, complexity: 5, language: 'japonais',
    notes: 'Exigence de qualité et de présentation très élevée. Localisation complète indispensable.' },
  { code: 'AE', name: 'Émirats arabes unis', currency: 'AED', vatRate: 0.05, regime: 'Hors UE — régime spécifique',
    dutyFreeThreshold: 70, purchasingPower: 128, complexity: 4, language: 'anglais / arabe',
    notes: 'Clientèle sensible au sur-mesure et aux pièces de cérémonie.' },
  { code: 'SN', name: 'Sénégal', currency: 'XOF', vatRate: 0.18, regime: 'Hors UE — export',
    dutyFreeThreshold: null, purchasingPower: 28, complexity: 4, language: 'français',
    notes: 'Francophone, forte culture vestimentaire. Logistique et paiement à sécuriser (mobile money).' },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', vatRate: 0.18, regime: 'Hors UE — export',
    dutyFreeThreshold: null, purchasingPower: 26, complexity: 4, language: 'français',
    notes: 'Francophone, marché urbain dynamique. Prévoir le paiement mobile.' },
  { code: 'CD', name: 'République démocratique du Congo', currency: 'CDF', vatRate: 0.16, regime: 'Hors UE — export',
    dutyFreeThreshold: null, purchasingPower: 14, complexity: 5, language: 'français',
    notes: 'Berceau culturel de la Sape. Logistique difficile, paiement et douane à sécuriser en priorité.' },
];

export interface CrossBorderInput {
  averageOrderValue: number;
  averageUnitCost: number;
  grossMargin: number;
  /** Surcoût d'expédition hors France, par commande. */
  internationalShippingCost: number;
  /** Marchés à étudier (codes pays). Vide = tout le référentiel. */
  marketCodes: string[];
  /** La boutique est-elle déjà enregistrée au guichet unique OSS ? */
  ossRegistered: boolean;
  /** Chiffre d'affaires annuel réalisé hors de France, en euros. */
  currentIntraEuRevenue: number;
}

/** Seuil européen unique de vente à distance : 10 000 € de CA intra-UE. */
const EU_DISTANCE_SELLING_THRESHOLD = 10000;

export function runCrossBorder(i: CrossBorderInput): EngineResult {
  const pool = i.marketCodes.length
    ? MARKET_REFERENCE.filter((m) => i.marketCodes.includes(m.code))
    : MARKET_REFERENCE.filter((m) => m.code !== 'FR');

  const scored = pool.map((m) => {
    // Notation : pouvoir d'achat (40) · simplicité (30) · langue (20) · fiscalité (10)
    const powerScore = Math.min(100, (m.purchasingPower / 158) * 100) * 0.4;
    const simplicityScore = ((6 - m.complexity) / 5) * 100 * 0.3;
    const languageScore = (m.language.includes('français') ? 100 : 55) * 0.2;
    const taxScore = (m.regime.startsWith('UE') ? 100 : 50) * 0.1;
    const total = Math.round(powerScore + simplicityScore + languageScore + taxScore);

    // Prix TTC local nécessaire pour conserver la marge, surcoût d'expédition inclus
    const netTarget = i.averageOrderValue / (1 + 0.2);      // CA HT France (TVA 20 %)
    const netWithShipping = netTarget + i.internationalShippingCost;
    const localPrice = round(netWithShipping * (1 + m.vatRate), 2);
    const marginAfter = safeDiv(
      netWithShipping - (netTarget * (1 - i.grossMargin)) - i.internationalShippingCost,
      netWithShipping);

    const dutyRisk = m.dutyFreeThreshold !== null && i.averageOrderValue > m.dutyFreeThreshold;

    return { market: m, total, localPrice, marginAfter: round(marginAfter, 4), dutyRisk };
  }).sort((a, b) => b.total - a.total);

  const best = scored.slice(0, 3);
  const overThreshold = i.currentIntraEuRevenue >= EU_DISTANCE_SELLING_THRESHOLD;

  const metrics: Metric[] = [
    { key: 'markets', label: 'Marchés évalués', value: scored.length, unit: 'u' },
    { key: 'top_score', label: 'Meilleur score marché', value: best[0]?.total ?? 0, unit: '/100',
      status: (best[0]?.total ?? 0) >= 70 ? 'healthy' : 'warning' },
    { key: 'eu_revenue', label: 'CA intra-UE actuel', value: round(i.currentIntraEuRevenue, 2), unit: '€' },
    { key: 'threshold_gap', label: 'Marge avant seuil OSS de 10 000 €',
      value: round(Math.max(EU_DISTANCE_SELLING_THRESHOLD - i.currentIntraEuRevenue, 0), 2), unit: '€',
      status: overThreshold ? 'danger' : i.currentIntraEuRevenue > 7000 ? 'warning' : 'healthy' },
    { key: 'shipping_drag', label: 'Poids du surcoût d’expédition',
      value: round(safeDiv(i.internationalShippingCost, i.averageOrderValue) * 100, 1), unit: '%',
      status: safeDiv(i.internationalShippingCost, i.averageOrderValue) <= 0.08 ? 'healthy' : 'warning' },
  ];

  const findings: Finding[] = [];
  if (overThreshold && !i.ossRegistered)
    findings.push({ severity: 'critical', title: 'Seuil de 10 000 € de ventes intra-UE dépassé sans enregistrement OSS',
      detail: `Votre chiffre d’affaires intra-UE atteint ${eur(i.currentIntraEuRevenue)}. Au-delà de 10 000 €, la TVA du pays de destination s’applique et l’enregistrement au guichet unique (OSS) devient nécessaire. À régulariser sans attendre avec votre expert-comptable.` });
  else if (!overThreshold && i.currentIntraEuRevenue > 7000)
    findings.push({ severity: 'warning', title: 'Seuil OSS bientôt atteint',
      detail: `${eur(i.currentIntraEuRevenue)} de ventes intra-UE sur ${eur(EU_DISTANCE_SELLING_THRESHOLD)}. Préparer l’enregistrement OSS avant de le franchir évite une régularisation rétroactive.` });

  const dutyMarkets = scored.filter((s) => s.dutyRisk);
  if (dutyMarkets.length)
    findings.push({ severity: 'warning', title: `${dutyMarkets.length} marché(s) où le client paiera des droits à la livraison`,
      detail: `${dutyMarkets.slice(0, 4).map((s) => `${s.market.name} (seuil ${eur(s.market.dutyFreeThreshold ?? 0)})`).join(', ')}. Des frais surprises à la livraison génèrent des refus de colis et des litiges : afficher le montant estimé au paiement (régime DDP) ou l’annoncer clairement.` });

  const marginKillers = scored.filter((s) => s.marginAfter < i.grossMargin - 0.1);
  if (marginKillers.length)
    findings.push({ severity: 'warning', title: `Le surcoût d’expédition érode la marge sur ${marginKillers.length} marché(s)`,
      detail: `${eur(i.internationalShippingCost)} par commande, soit ${pct(safeDiv(i.internationalShippingCost, i.averageOrderValue))} du panier moyen. Un franco de port plus haut à l’international protège la marge.` });

  const recommendations: Recommendation[] = [];
  if (best.length)
    recommendations.push({ priority: 1, title: `Commencer par ${best[0].market.name} (score ${best[0].total}/100)`,
      detail: `${best[0].market.notes} Régime : ${best[0].market.regime}. Prix TTC local conseillé pour préserver la marge : ${eur(best[0].localPrice)} (TVA ${pct(best[0].market.vatRate, 1)}). Langue à prévoir : ${best[0].market.language}.` });
  if (best[1])
    recommendations.push({ priority: 2, title: `Puis ${best[1].market.name} (score ${best[1].total}/100)`,
      detail: `${best[1].market.notes} Prix TTC local conseillé : ${eur(best[1].localPrice)}.` });
  if (!i.ossRegistered)
    recommendations.push({ priority: overThreshold ? 1 : 3, title: 'Préparer l’enregistrement au guichet unique OSS',
      detail: 'Un seul enregistrement permet de déclarer la TVA de tous les pays de l’UE. C’est le prérequis administratif de toute expansion européenne.' });
  recommendations.push({ priority: 2, title: 'Localiser au-delà de la simple traduction',
      detail: 'Tailles converties (FR / UK / US / IT), devise affichée, moyens de paiement locaux, délais annoncés par pays et politique de retour traduite. Le dépôt Nexscope place la localisation incomplète parmi les premières causes d’échec à l’international.' });

  const tables: EngineTable[] = [{
    title: 'Marchés évalués',
    columns: [
      { key: 'marche', label: 'Marché' }, { key: 'score', label: 'Score', align: 'right' },
      { key: 'regime', label: 'Régime de TVA' }, { key: 'tva', label: 'TVA', align: 'right' },
      { key: 'prix', label: 'Prix TTC conseillé', align: 'right' },
      { key: 'langue', label: 'Langue' }, { key: 'douane', label: 'Droits à l’import' },
    ],
    rows: scored.map((s) => ({
      marche: s.market.name,
      score: `${s.total}/100`,
      regime: s.market.regime,
      tva: pct(s.market.vatRate, 1),
      prix: eur(s.localPrice),
      langue: s.market.language,
      douane: s.market.dutyFreeThreshold === null ? 'aucun (UE)'
            : s.dutyRisk ? `oui, au-delà de ${eur(s.market.dutyFreeThreshold)}`
            : `non sous ${eur(s.market.dutyFreeThreshold)}`,
    })),
    note: 'Notation : pouvoir d’achat 40 % · simplicité réglementaire 30 % · proximité linguistique 20 % · régime fiscal 10 %. Taux et seuils donnés à titre de cadrage, à faire confirmer par un professionnel.',
  }];

  return {
    engineKey: 'cross-border',
    title: 'Expansion internationale',
    summary: best.length
      ? `${scored.length} marché(s) évalué(s) · priorité : ${best.map((b) => b.market.name).join(', ')}${overThreshold ? ' · seuil OSS dépassé, régularisation TVA requise' : ''}.`
      : 'Aucun marché sélectionné.',
    status: overThreshold && !i.ossRegistered ? 'danger' : dutyMarkets.length ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { scored, threshold: EU_DISTANCE_SELLING_THRESHOLD, overThreshold },
    dataGaps: [
      'Les taux de TVA, seuils douaniers et indices de pouvoir d’achat sont des valeurs de cadrage intégrées à l’application. Ils évoluent : les faire vérifier avant toute mise en vente, et ne pas les utiliser comme base déclarative.',
      ...(i.currentIntraEuRevenue === 0 ? ['Aucun chiffre d’affaires intra-UE enregistré : le suivi du seuil OSS se mettra à jour avec les commandes réelles.'] : []),
    ],
  };
}
