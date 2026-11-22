/**
 * MOTEUR — Diagnostic de croissance par l'économie unitaire
 *
 * Porté depuis :
 *   ecommerce-growth-strategy/SKILL.md  (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Le SKILL.md diagnostique la santé de l'entreprise à partir de CAC, LTV,
 * AOV et marge de contribution, puis identifie le levier de croissance le
 * plus rentable parmi cinq : trafic, conversion, panier moyen, rétention,
 * expansion. Cette implémentation reproduit ce raisonnement sur les données
 * réelles de la boutique et chiffre chaque levier.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, pct, round, safeDiv } from '../shared';

export interface UnitEconomicsInput {
  windowDays: number;
  revenue: number;
  cogs: number;
  orders: number;
  customers: number;
  repeatCustomers: number;
  /** Sessions sur la période, si une mesure d'audience est disponible. */
  sessions?: number | null;
  /** Dépense d'acquisition sur la période, si elle est connue. */
  marketingSpend?: number | null;
  monthlyFixedCosts: number;
  targetNetMargin: number;
  shippingCost: number;
  discountTotal: number;
}

const LEVER_LABELS = {
  traffic: 'Trafic',
  conversion: 'Taux de conversion',
  aov: 'Panier moyen',
  retention: 'Rétention',
  expansion: 'Expansion',
} as const;

export function runUnitEconomics(i: UnitEconomicsInput): EngineResult {
  const months = i.windowDays / 30.44;
  const grossProfit = i.revenue - i.cogs;
  const grossMargin = safeDiv(grossProfit, i.revenue);
  const aov = safeDiv(i.revenue, i.orders);
  const contributionPerOrder = safeDiv(grossProfit, i.orders);
  const ordersPerCustomer = safeDiv(i.orders, i.customers);
  const repeatRate = safeDiv(i.repeatCustomers, i.customers);
  const conversionRate = i.sessions && i.sessions > 0 ? safeDiv(i.orders, i.sessions) : null;

  const cac = i.marketingSpend && i.customers > 0 ? safeDiv(i.marketingSpend, i.customers) : null;
  // LTV = contribution par commande × commandes par client (horizon observé)
  const ltv = contributionPerOrder * ordersPerCustomer;
  const ltvCacRatio = cac && cac > 0 ? safeDiv(ltv, cac) : null;
  const paybackOrders = cac && contributionPerOrder > 0 ? cac / contributionPerOrder : null;

  const fixedCostsOverWindow = i.monthlyFixedCosts * months;
  const operatingProfit = grossProfit - (i.marketingSpend ?? 0) - fixedCostsOverWindow;
  const netMargin = safeDiv(operatingProfit, i.revenue);

  const metrics: Metric[] = [
    { key: 'revenue', label: `Chiffre d’affaires (${i.windowDays} j)`, value: round(i.revenue, 2), unit: '€' },
    { key: 'gross_margin', label: 'Marge brute', value: round(grossMargin * 100, 1), unit: '%',
      status: grossMargin >= 0.6 ? 'healthy' : grossMargin >= 0.45 ? 'warning' : 'danger', benchmark: 60 },
    { key: 'aov', label: 'Panier moyen', value: round(aov, 2), unit: '€' },
    { key: 'contribution', label: 'Contribution par commande', value: round(contributionPerOrder, 2), unit: '€' },
    { key: 'orders_per_customer', label: 'Commandes par client', value: round(ordersPerCustomer, 2), unit: 'x',
      status: ordersPerCustomer >= 1.5 ? 'healthy' : ordersPerCustomer >= 1.2 ? 'warning' : 'danger', benchmark: 1.5 },
    { key: 'repeat_rate', label: 'Taux de réachat', value: round(repeatRate * 100, 1), unit: '%',
      status: repeatRate >= 0.25 ? 'healthy' : repeatRate >= 0.15 ? 'warning' : 'danger', benchmark: 25 },
    { key: 'net_margin', label: 'Marge opérationnelle', value: round(netMargin * 100, 1), unit: '%',
      status: netMargin >= i.targetNetMargin ? 'healthy' : netMargin > 0 ? 'warning' : 'loss',
      benchmark: round(i.targetNetMargin * 100, 0) },
  ];
  if (conversionRate !== null)
    metrics.push({ key: 'conversion', label: 'Taux de conversion', value: round(conversionRate * 100, 2), unit: '%',
      status: conversionRate >= 0.02 ? 'healthy' : conversionRate >= 0.01 ? 'warning' : 'danger', benchmark: 2 });
  if (cac !== null)
    metrics.push({ key: 'cac', label: 'Coût d’acquisition client', value: round(cac, 2), unit: '€' });
  if (ltvCacRatio !== null)
    metrics.push({ key: 'ltv_cac', label: 'Ratio LTV / CAC', value: round(ltvCacRatio, 2), unit: 'x',
      status: ltvCacRatio >= 3 ? 'healthy' : ltvCacRatio >= 2 ? 'warning' : 'danger', benchmark: 3 });

  // ── Chiffrage des cinq leviers : effet d'une amélioration de 10 % ──
  const levers: { key: keyof typeof LEVER_LABELS; feasible: boolean; gain: number; detail: string }[] = [
    { key: 'traffic', feasible: true,
      gain: round(grossProfit * 0.1, 2),
      detail: '+10 % de visiteurs qualifiés, à conversion constante.' },
    { key: 'conversion', feasible: true,
      gain: round(grossProfit * 0.1, 2),
      detail: conversionRate !== null
        ? `Passer de ${pct(conversionRate, 2)} à ${pct(conversionRate * 1.1, 2)} de conversion.`
        : 'Amélioration de 10 % du taux de conversion (mesure d’audience à brancher pour un chiffrage précis).' },
    { key: 'aov', feasible: true,
      gain: round(i.orders * aov * 0.1 * grossMargin, 2),
      detail: `Porter le panier moyen de ${eur(aov)} à ${eur(round(aov * 1.1, 2))} (produits complémentaires, lots, franco de port mieux placé).` },
    { key: 'retention', feasible: true,
      gain: round(i.customers * 0.1 * contributionPerOrder, 2),
      detail: `Faire revenir 10 % des ${i.customers} clients de la période pour une commande supplémentaire.` },
    { key: 'expansion', feasible: i.revenue > 0,
      gain: round(grossProfit * 0.15, 2),
      detail: 'Nouveau canal ou nouvelle catégorie — effet plus fort mais délai et investissement supérieurs.' },
  ];
  levers.sort((a, b) => b.gain - a.gain);
  const topLever = levers[0];

  const findings: Finding[] = [];
  if (i.orders === 0) {
    findings.push({ severity: 'info', title: 'Aucune commande sur la période',
      detail: 'Le diagnostic d’économie unitaire se remplira dès les premières ventes. En attendant, les modules de marge et de SEO travaillent déjà sur vos fiches produits.' });
  }
  if (netMargin < 0 && i.orders > 0)
    findings.push({ severity: 'critical', title: 'Résultat opérationnel négatif',
      detail: `${eur(round(operatingProfit, 2))} sur la période. Marge brute ${pct(grossMargin)}, charges fixes ${eur(round(fixedCostsOverWindow, 2))}${i.marketingSpend ? `, acquisition ${eur(i.marketingSpend)}` : ''}.`,
      impact: `Il manque ${eur(round(Math.abs(operatingProfit), 2))} pour atteindre l’équilibre` });
  if (ltvCacRatio !== null && ltvCacRatio < 3)
    findings.push({ severity: ltvCacRatio < 2 ? 'critical' : 'warning',
      title: `Ratio LTV / CAC de ${round(ltvCacRatio, 2)}`,
      detail: `Le référentiel Nexscope situe le seuil de viabilité à 3. En dessous, la croissance payante consomme plus de trésorerie qu’elle n’en produit.${paybackOrders ? ` Il faut ${round(paybackOrders, 1)} commande(s) pour rembourser l’acquisition d’un client.` : ''}` });
  if (repeatRate < 0.15 && i.customers >= 10)
    findings.push({ severity: 'warning', title: `Taux de réachat de ${pct(repeatRate)}`,
      detail: 'Sous 15 %, chaque euro de croissance doit être racheté en publicité. La rétention est le levier le moins cher du modèle.' });
  if (grossMargin < 0.5 && i.revenue > 0)
    findings.push({ severity: 'warning', title: `Marge brute de ${pct(grossMargin)}`,
      detail: 'Un modèle DTC a besoin de 60 % de marge brute pour financer l’acquisition, la logistique et les retours.' });
  const discountShare = safeDiv(i.discountTotal, i.revenue);
  if (discountShare > 0.1)
    findings.push({ severity: 'warning', title: `Les remises pèsent ${pct(discountShare)} du chiffre d’affaires`,
      detail: `${eur(i.discountTotal)} de remises accordées. Au-delà de 10 %, la promotion devient structurelle et abîme le prix de référence.` });

  const recommendations: Recommendation[] = [
    { priority: 1, title: `Levier prioritaire : ${LEVER_LABELS[topLever.key]} (+${eur(topLever.gain)} de marge)`,
      detail: `${topLever.detail} C’est l’action au meilleur rapport effort / résultat sur la base des données réelles des ${i.windowDays} derniers jours.` },
    { priority: 2, title: `Deuxième levier : ${LEVER_LABELS[levers[1].key]} (+${eur(levers[1].gain)})`,
      detail: levers[1].detail },
  ];
  if (!i.marketingSpend)
    recommendations.push({ priority: 3, title: 'Renseigner la dépense d’acquisition',
      detail: 'Sans dépense marketing saisie, le CAC et le ratio LTV / CAC ne peuvent pas être calculés — ce sont les deux indicateurs qui pilotent la décision d’investir ou non en publicité.' });
  if (!i.sessions)
    recommendations.push({ priority: 3, title: 'Brancher une mesure d’audience',
      detail: 'Le taux de conversion est le seul des cinq leviers qui reste non chiffré sans données de sessions.' });

  const tables: EngineTable[] = [
    {
      title: 'Compte de résultat simplifié de la période',
      columns: [{ key: 'poste', label: 'Poste' }, { key: 'montant', label: 'Montant', align: 'right' },
                { key: 'part', label: '% du CA', align: 'right' }],
      rows: [
        { poste: 'Chiffre d’affaires', montant: eur(round(i.revenue, 2)), part: '100,0 %' },
        { poste: 'Coût des marchandises vendues', montant: `− ${eur(round(i.cogs, 2))}`, part: pct(safeDiv(i.cogs, i.revenue)) },
        { poste: 'Marge brute', montant: eur(round(grossProfit, 2)), part: pct(grossMargin) },
        { poste: 'Dont remises accordées', montant: `− ${eur(round(i.discountTotal, 2))}`, part: pct(discountShare) },
        { poste: 'Dont transport', montant: `− ${eur(round(i.shippingCost, 2))}`, part: pct(safeDiv(i.shippingCost, i.revenue)) },
        { poste: 'Acquisition', montant: i.marketingSpend ? `− ${eur(i.marketingSpend)}` : 'non renseignée',
          part: i.marketingSpend ? pct(safeDiv(i.marketingSpend, i.revenue)) : '—' },
        { poste: `Charges fixes (${round(months, 1)} mois)`, montant: `− ${eur(round(fixedCostsOverWindow, 2))}`,
          part: pct(safeDiv(fixedCostsOverWindow, i.revenue)) },
        { poste: 'Résultat opérationnel', montant: eur(round(operatingProfit, 2)), part: pct(netMargin) },
      ],
    },
    {
      title: 'Les cinq leviers de croissance, chiffrés',
      columns: [{ key: 'levier', label: 'Levier' }, { key: 'gain', label: 'Gain de marge estimé', align: 'right' },
                { key: 'action', label: 'Hypothèse retenue' }],
      rows: levers.map((l) => ({ levier: LEVER_LABELS[l.key], gain: `+ ${eur(l.gain)}`, action: l.detail })),
      note: 'Chiffrage à amélioration de 10 % de chaque levier, toutes choses égales par ailleurs. Grille des cinq leviers reprise de ecommerce-growth-strategy/SKILL.md.',
    },
  ];

  const dataGaps: string[] = [];
  if (!i.marketingSpend) dataGaps.push('Dépense d’acquisition non renseignée : CAC, ratio LTV / CAC et délai de remboursement non calculés.');
  if (!i.sessions) dataGaps.push('Sessions non disponibles : taux de conversion non calculé. À brancher via une mesure d’audience respectueuse de la vie privée.');
  if (i.windowDays < 90) dataGaps.push(`Fenêtre d’observation de ${i.windowDays} jours : la LTV réelle demande au moins 6 mois d’historique pour être fiable.`);

  return {
    engineKey: 'unit-economics',
    title: `Diagnostic de croissance — ${i.windowDays} derniers jours`,
    summary: i.orders === 0
      ? 'Pas encore de commandes : le diagnostic se remplira avec les premières ventes.'
      : `CA ${eur(round(i.revenue, 2))} · marge brute ${pct(grossMargin)} · panier moyen ${eur(aov)} · levier prioritaire : ${LEVER_LABELS[topLever.key]}.`,
    status: netMargin < 0 ? 'loss' : netMargin < i.targetNetMargin ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { grossProfit: round(grossProfit, 2), grossMargin, aov, ltv: round(ltv, 2), cac, ltvCacRatio,
           operatingProfit: round(operatingProfit, 2), levers, input: i },
    dataGaps,
  };
}
