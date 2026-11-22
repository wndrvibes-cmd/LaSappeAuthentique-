/**
 * MOTEUR — Optimisation du tunnel de conversion
 *
 * Porté depuis :
 *   conversion-rate-optimization/SKILL.md, ecommerce-checkout-optimization/SKILL.md,
 *   shopify-cart-abandonment/SKILL.md, shopify-conversion-optimization/SKILL.md,
 *   ecommerce-ab-testing/SKILL.md (dimensionnement de test)
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Calculs : taux de passage par étape, étape la plus coûteuse en valeur
 * absolue, gain potentiel chiffré, et taille d'échantillon nécessaire pour
 * valider un test A/B à 95 % de confiance et 80 % de puissance.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, pct, round, safeDiv } from '../shared';

export interface FunnelStage { key: string; label: string; count: number }

export interface FunnelCroInput {
  /** Étapes ordonnées, de la plus large à la plus étroite. */
  stages: FunnelStage[];
  averageOrderValue: number;
  grossMargin: number;
  windowDays: number;
  /** Frictions constatées sur la boutique (audit manuel). */
  checkoutRequiresAccount: boolean;
  shippingCostShownLate: boolean;
  paymentMethodCount: number;
  hasGuestCheckout: boolean;
  productPageImageAvg: number;
  hasSizeGuide: boolean;
  hasReviews: boolean;
  returnPolicyVisible: boolean;
}

/** Référentiels de conversion e-commerce mode / habillement. */
const STAGE_BENCHMARKS: Record<string, number> = {
  session_to_product: 0.45,
  product_to_cart: 0.08,
  cart_to_checkout: 0.60,
  checkout_to_order: 0.65,
};

/**
 * Taille d'échantillon par variante pour détecter un effet relatif donné.
 * Approximation normale à α = 0,05 bilatéral et puissance 80 % (z = 1,96 + 0,84).
 */
export function sampleSizePerVariant(baseRate: number, relativeLift: number): number | null {
  if (baseRate <= 0 || baseRate >= 1 || relativeLift <= 0) return null;
  const p1 = baseRate;
  const p2 = baseRate * (1 + relativeLift);
  if (p2 >= 1) return null;
  const pBar = (p1 + p2) / 2;
  const numerator = 2 * pBar * (1 - pBar) * (1.96 + 0.8416) ** 2;
  return Math.ceil(numerator / (p2 - p1) ** 2);
}

export function runFunnelCro(i: FunnelCroInput): EngineResult {
  const stages = i.stages;
  const steps = stages.slice(0, -1).map((s, idx) => {
    const next = stages[idx + 1];
    const rate = safeDiv(next.count, s.count);
    const key = `${s.key}_to_${next.key}`;
    const benchmark = STAGE_BENCHMARKS[key] ?? null;
    const lost = s.count - next.count;
    return { from: s, to: next, rate, benchmark, lost, key };
  });

  const overall = stages.length >= 2 ? safeDiv(stages[stages.length - 1].count, stages[0].count) : 0;
  const orders = stages[stages.length - 1]?.count ?? 0;
  const contributionPerOrder = i.averageOrderValue * i.grossMargin;

  // Étape la plus coûteuse : écart au référentiel × valeur des commandes perdues
  const costed = steps
    .filter((s) => s.benchmark !== null)
    .map((s) => {
      const gapRate = (s.benchmark as number) - s.rate;
      // Commandes récupérables si l'étape atteignait le référentiel, en conservant
      // les taux de passage des étapes suivantes.
      const downstream = steps
        .slice(steps.indexOf(s) + 1)
        .reduce((acc, next) => acc * next.rate, 1);
      const recoverable = gapRate > 0 ? s.from.count * gapRate * downstream : 0;
      return { ...s, gapRate, recoverableOrders: recoverable,
               recoverableMargin: round(recoverable * contributionPerOrder, 2) };
    })
    .sort((a, b) => b.recoverableMargin - a.recoverableMargin);

  const worst = costed[0];

  const metrics: Metric[] = [
    { key: 'overall', label: 'Conversion globale', value: round(overall * 100, 2), unit: '%',
      status: overall >= 0.02 ? 'healthy' : overall >= 0.01 ? 'warning' : 'danger', benchmark: 2 },
    { key: 'orders', label: `Commandes (${i.windowDays} j)`, value: orders, unit: 'u' },
    { key: 'aov', label: 'Panier moyen', value: round(i.averageOrderValue, 2), unit: '€' },
    { key: 'contribution', label: 'Marge par commande', value: round(contributionPerOrder, 2), unit: '€' },
    ...steps.map((s) => ({
      key: s.key,
      label: `${s.from.label} → ${s.to.label}`,
      value: round(s.rate * 100, 1),
      unit: '%' as const,
      status: s.benchmark === null ? undefined
            : s.rate >= s.benchmark ? ('healthy' as const)
            : s.rate >= s.benchmark * 0.7 ? ('warning' as const) : ('danger' as const),
      benchmark: s.benchmark !== null ? round(s.benchmark * 100, 1) : undefined,
    })),
  ];

  const findings: Finding[] = [];
  if (stages[0]?.count === 0)
    findings.push({ severity: 'info', title: 'Aucune donnée de trafic',
      detail: 'Le tunnel se remplira dès qu’une mesure d’audience sera branchée. Les frictions structurelles détectées ci-dessous restent valables sans données.' });

  if (worst && worst.recoverableMargin > 0)
    findings.push({ severity: worst.gapRate > (worst.benchmark as number) * 0.4 ? 'critical' : 'warning',
      title: `Étape la plus coûteuse : ${worst.from.label} → ${worst.to.label}`,
      detail: `${pct(worst.rate)} de passage contre ${pct(worst.benchmark as number)} de référence sur le secteur. ${Math.round(worst.lost)} visiteur(s) perdus sur la période.`,
      impact: `${eur(worst.recoverableMargin)} de marge récupérable sur ${i.windowDays} jours` });

  // ── Frictions structurelles (audit, indépendant du trafic) ──
  const frictions: { severity: 'critical' | 'warning' | 'info'; title: string; detail: string }[] = [];
  if (i.checkoutRequiresAccount && !i.hasGuestCheckout)
    frictions.push({ severity: 'critical', title: 'Création de compte obligatoire au paiement',
      detail: 'C’est la première cause d’abandon au paiement citée par le dépôt Nexscope. Proposer la commande en tant qu’invité, avec création de compte facultative après paiement.' });
  if (i.shippingCostShownLate)
    frictions.push({ severity: 'critical', title: 'Frais de port révélés tardivement',
      detail: 'Un montant qui apparaît à la dernière étape détruit la confiance. Afficher le coût estimé dès le panier, et le franco de port dans l’en-tête.' });
  if (i.paymentMethodCount < 3)
    frictions.push({ severity: 'warning', title: `Seulement ${i.paymentMethodCount} moyen(s) de paiement`,
      detail: 'Carte, portefeuille mobile (Apple Pay / Google Pay) et paiement fractionné couvrent l’essentiel des attentes. Chaque moyen manquant exclut un segment.' });
  if (i.productPageImageAvg < 5)
    frictions.push({ severity: 'warning', title: `${round(i.productPageImageAvg, 1)} image(s) en moyenne par fiche`,
      detail: 'En habillement, 5 à 8 visuels (porté, détail matière, dos, accessoirisé) sont nécessaires pour décider sans essayer.' });
  if (!i.hasSizeGuide)
    frictions.push({ severity: 'critical', title: 'Aucun guide des tailles',
      detail: 'En prêt-à-porter, l’absence de guide des tailles freine l’achat et gonfle les retours. C’est la correction la moins chère du tunnel.' });
  if (!i.hasReviews)
    frictions.push({ severity: 'warning', title: 'Aucun avis affiché',
      detail: 'La preuve sociale agit surtout sur les visiteurs qui hésitent, c’est-à-dire ceux qui sont déjà sur la fiche produit.' });
  if (!i.returnPolicyVisible)
    frictions.push({ severity: 'warning', title: 'Politique de retour peu visible',
      detail: 'Une politique de retour claire et accessible depuis la fiche produit lève le dernier frein avant le panier.' });

  findings.push(...frictions);

  const recommendations: Recommendation[] = [];
  const criticalFrictions = frictions.filter((f) => f.severity === 'critical');
  if (criticalFrictions.length)
    recommendations.push({ priority: 1, title: `Corriger ${criticalFrictions.length} friction(s) bloquante(s) avant tout test`,
      detail: `${criticalFrictions.map((f) => f.title.toLowerCase()).join(' ; ')}. Ces corrections sont connues et ne nécessitent pas de test A/B : les appliquer directement.` });
  if (worst && worst.recoverableMargin > 0)
    recommendations.push({ priority: criticalFrictions.length ? 2 : 1,
      title: `Concentrer les efforts sur l’étape ${worst.from.label} → ${worst.to.label}`,
      detail: `Ramener cette étape au niveau du secteur vaut ${eur(worst.recoverableMargin)} de marge sur ${i.windowDays} jours, soit environ ${eur(round(worst.recoverableMargin * (365 / i.windowDays), 2))} par an.` });

  const tables: EngineTable[] = [
    {
      title: 'Tunnel de conversion',
      columns: [
        { key: 'etape', label: 'Étape' }, { key: 'volume', label: 'Volume', align: 'right' },
        { key: 'passage', label: 'Taux de passage', align: 'right' },
        { key: 'reference', label: 'Référence secteur', align: 'right' },
        { key: 'perdus', label: 'Perdus', align: 'right' },
      ],
      rows: [
        { etape: stages[0]?.label ?? '—', volume: stages[0]?.count ?? 0, passage: '—', reference: '—', perdus: '—' },
        ...steps.map((s) => ({
          etape: s.to.label,
          volume: s.to.count,
          passage: pct(s.rate),
          reference: s.benchmark !== null ? pct(s.benchmark) : '—',
          perdus: s.lost,
        })),
      ],
      note: `Conversion globale : ${pct(overall, 2)}. Référentiels indicatifs du secteur mode / habillement.`,
    },
  ];

  if (costed.length)
    tables.push({
      title: 'Gain potentiel par étape',
      columns: [
        { key: 'etape', label: 'Étape' },
        { key: 'ecart', label: 'Écart au référentiel', align: 'right' },
        { key: 'commandes', label: 'Commandes récupérables', align: 'right' },
        { key: 'marge', label: 'Marge récupérable', align: 'right' },
      ],
      rows: costed.map((s) => ({
        etape: `${s.from.label} → ${s.to.label}`,
        ecart: s.gapRate > 0 ? `− ${pct(s.gapRate)}` : 'au-dessus du référentiel',
        commandes: s.recoverableOrders > 0 ? round(s.recoverableOrders, 1) : '—',
        marge: s.recoverableMargin > 0 ? eur(s.recoverableMargin) : '—',
      })),
      note: `Calculé sur ${i.windowDays} jours, avec une marge de ${eur(round(contributionPerOrder, 2))} par commande.`,
    });

  // ── Dimensionnement d'un test A/B sur l'étape la plus coûteuse ──
  if (worst && worst.rate > 0) {
    const sizes = [0.05, 0.1, 0.2].map((lift) => ({
      lift, n: sampleSizePerVariant(worst.rate, lift),
    }));
    const dailyTraffic = safeDiv(worst.from.count, i.windowDays);
    tables.push({
      title: `Dimensionnement d’un test A/B sur « ${worst.from.label} → ${worst.to.label} »`,
      columns: [
        { key: 'effet', label: 'Effet à détecter' },
        { key: 'echantillon', label: 'Visiteurs par variante', align: 'right' },
        { key: 'duree', label: 'Durée estimée', align: 'right' },
      ],
      rows: sizes.map((s) => ({
        effet: `+${pct(s.lift, 0)} relatif`,
        echantillon: s.n !== null ? s.n.toLocaleString('fr-FR') : '—',
        duree: s.n !== null && dailyTraffic > 0
          ? `${Math.ceil((s.n * 2) / dailyTraffic)} jour(s)`
          : 'trafic insuffisant pour conclure',
      })),
      note: `Taux de base ${pct(worst.rate)}, confiance 95 %, puissance 80 %. Trafic observé : ${round(dailyTraffic, 1)} visiteur(s) par jour sur cette étape. Si la durée dépasse six semaines, corriger directement plutôt que tester.`,
    });
  }

  const dataGaps: string[] = [];
  if (stages.some((s) => s.count === 0))
    dataGaps.push('Certaines étapes du tunnel sont à zéro : brancher une mesure d’audience (sessions, vues de fiche produit) pour chiffrer les pertes par étape. Les commandes et paniers proviennent déjà de la base.');

  return {
    engineKey: 'funnel-cro',
    title: 'Tunnel de conversion',
    summary: `Conversion globale ${pct(overall, 2)}${worst ? ` · étape la plus coûteuse : ${worst.from.label} → ${worst.to.label} (${eur(worst.recoverableMargin)} récupérables)` : ''} · ${criticalFrictions.length} friction(s) bloquante(s).`,
    status: criticalFrictions.length ? 'danger' : overall < 0.01 ? 'danger' : overall < 0.02 ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { overall, steps: steps.map((s) => ({ key: s.key, rate: round(s.rate, 4), benchmark: s.benchmark, lost: s.lost })),
           costed: costed.map((s) => ({ key: s.key, recoverableMargin: s.recoverableMargin })),
           frictionCount: frictions.length },
    dataGaps,
  };
}
