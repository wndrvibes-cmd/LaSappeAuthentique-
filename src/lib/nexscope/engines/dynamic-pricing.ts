/**
 * MOTEUR — Repricing encadré
 *
 * Porté depuis :
 *   dynamic-pricing-ecommerce/SKILL.md + agents/openai.yaml
 *   competitive-pricing-strategy/SKILL.md
 *   price-optimization-tool/SKILL.md
 *   minimum-advertised-price/SKILL.md
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Le dépôt insiste sur un point que cette implémentation respecte
 * strictement : « safe bounds, approvals, and rollback ». Aucune
 * recommandation produite ici n'est appliquée automatiquement. Chaque
 * proposition est bornée, justifiée, et passe par la file d'approbation.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, pct, round, safeDiv } from '../shared';

export interface PricingCandidate {
  productId: string;
  variantId?: string | null;
  sku: string;
  name: string;
  currentPrice: number;
  unitCost: number;          // coût complet hors publicité
  netMargin: number;         // marge nette actuelle (0,22 = 22 %)
  /** Prix concurrents relevés pour un produit équivalent. */
  competitorPrices: number[];
  /** Unités vendues sur la fenêtre d'observation. */
  unitsSold30d: number;
  stockAvailable: number;
  daysOfCover: number | null;
}

export interface DynamicPricingInput {
  candidates: PricingCandidate[];
  targetNetMargin: number;     // objectif de la boutique, ex. 0,25
  /** Borne de sécurité : variation maximale autorisée en une passe. */
  maxChangePct: number;        // ex. 0,08 → ±8 %
  /** Prix plancher absolu : refuse toute proposition sous ce multiple du coût. */
  minMarkupOverCost: number;   // ex. 1,25
  /** Politique de positionnement face au marché. */
  positioning: 'under' | 'match' | 'premium';
  premiumPct?: number;         // écart visé si 'premium', ex. 0,10
}

interface Proposal {
  candidate: PricingCandidate;
  proposedPrice: number;
  changePct: number;
  reason: string;
  /** Le prix plancher ne peut pas etre atteint en une seule passe bornee. */
  floorUnreachable: boolean;
  newMargin: number;
  marginGain: number;
  blocked: string | null;
  revenueImpact30d: number;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function runDynamicPricing(i: DynamicPricingInput): EngineResult {
  const proposals: Proposal[] = [];

  for (const c of i.candidates) {
    const marketMedian = median(c.competitorPrices);

    // Cout complet implicite, deduit de la marge nette reelle issue de la base
    // (vue variant_margins) : prix x (1 - marge) = ensemble des couts, commission
    // de paiement, publicite et provision retours comprises. Plus fiable que le
    // seul cout d'achat, qui ignore ces postes.
    const impliedCost = c.netMargin < 1
      ? c.currentPrice * (1 - c.netMargin)
      : Math.max(c.unitCost, 0);
    const costFloorBase = Math.max(impliedCost, c.unitCost);
    let target = c.currentPrice;
    const reasons: string[] = [];

    // 1. Objectif de marge — prix permettant d'atteindre la marge cible
    if (c.netMargin < i.targetNetMargin && costFloorBase > 0) {
      const priceForTarget = costFloorBase / (1 - i.targetNetMargin);
      if (priceForTarget > target) {
        target = priceForTarget;
        reasons.push(`marge actuelle ${pct(c.netMargin)} sous l’objectif de ${pct(i.targetNetMargin, 0)}`);
      }
    }

    // 2. Positionnement face au marché relevé
    if (marketMedian !== null) {
      const anchor =
        i.positioning === 'under' ? marketMedian * 0.95
        : i.positioning === 'premium' ? marketMedian * (1 + (i.premiumPct ?? 0.1))
        : marketMedian;
      // On se rapproche de l'ancre sans jamais sacrifier la marge cible.
      if (i.positioning === 'premium' && anchor > target) {
        target = anchor;
        reasons.push(`positionnement premium à +${pct(i.premiumPct ?? 0.1, 0)} de la médiane marché (${eur(marketMedian)})`);
      } else if (i.positioning !== 'premium' && anchor < target && c.netMargin >= i.targetNetMargin) {
        target = Math.max(anchor, costFloorBase / (1 - i.targetNetMargin));
        reasons.push(`alignement sur la médiane marché (${eur(marketMedian)})`);
      }
    }

    // 3. Signal de rotation : écoulement rapide + stock faible ⇒ marge de hausse
    if (c.daysOfCover !== null && c.daysOfCover < 21 && c.unitsSold30d >= 5) {
      target = Math.max(target, c.currentPrice * 1.05);
      reasons.push(`rotation rapide (${c.daysOfCover} j de couverture)`);
    }
    // Stock dormant ⇒ signal de baisse, jamais sous le plancher
    if (c.daysOfCover !== null && c.daysOfCover > 180 && c.unitsSold30d === 0) {
      target = Math.min(target, c.currentPrice * 0.92);
      reasons.push('aucune vente sur 30 jours avec plus de 180 j de stock');
    }

    // ── Application des garde-fous ──
    const maxUp = c.currentPrice * (1 + i.maxChangePct);
    const maxDown = c.currentPrice * (1 - i.maxChangePct);
    let bounded = Math.min(Math.max(target, maxDown), maxUp);

    const absoluteFloor = costFloorBase * i.minMarkupOverCost;
    let blocked: string | null = null;
    if (bounded < absoluteFloor) {
      bounded = absoluteFloor;
      blocked = `Proposition relevée au prix plancher de ${eur(round(absoluteFloor, 2))} (${i.minMarkupOverCost}× le coût complet).`;
    }

    // Arrondi psychologique au .90, usage courant en prêt-à-porter.
    // L'arrondi est appliqué PUIS re-borné : il ne doit jamais faire sortir la
    // proposition de la variation maximale autorisée ni passer sous le prix
    // plancher, sans quoi le garde-fou ne serait qu'indicatif.
    let rounded = round(Math.floor(bounded) + 0.9, 2);
    if (rounded > maxUp) rounded = round(Math.floor(bounded) - 0.1, 2);
    if (rounded < absoluteFloor || rounded < maxDown)
      rounded = round(Math.max(absoluteFloor, maxDown), 2);

    // Conflit de garde-fous : quand le prix actuel est DEJA sous le prix
    // plancher, ce plancher ne peut pas etre atteint en une seule passe sans
    // violer la variation maximale. On remonte alors au maximum autorise et on
    // le dit explicitement, plutot que de proposer en silence un prix dont on
    // sait qu'il reste insuffisant.
    let floorUnreachable = false;
    if (rounded > maxUp) {
      rounded = round(maxUp, 2);
      if (rounded < absoluteFloor) {
        floorUnreachable = true;
        blocked = `Prix actuel deja sous le plancher de ${eur(round(absoluteFloor, 2))} `
          + `(${i.minMarkupOverCost}x le cout complet). La variation est bornee a `
          + `${pct(i.maxChangePct, 0)} par passe : une seconde passe sera necessaire, `
          + `ou une renegociation du cout d'achat.`;
      }
    }

    const changePct = safeDiv(rounded - c.currentPrice, c.currentPrice);
    if (Math.abs(changePct) < 0.01) continue;   // variation négligeable : on n'encombre pas la file

    const newMargin = safeDiv(rounded - c.unitCost, rounded);
    proposals.push({
      candidate: c,
      proposedPrice: rounded,
      changePct: round(changePct, 4),
      reason: reasons.length ? reasons.join(' ; ') : 'ajustement d’arrondi',
      newMargin: round(newMargin, 4),
      marginGain: round(newMargin - c.netMargin, 4),
      blocked,
      floorUnreachable,
      revenueImpact30d: round((rounded - c.currentPrice) * c.unitsSold30d, 2),
    });
  }

  proposals.sort((a, b) => Math.abs(b.revenueImpact30d) - Math.abs(a.revenueImpact30d));

  const increases = proposals.filter((p) => p.changePct > 0);
  const decreases = proposals.filter((p) => p.changePct < 0);
  const totalImpact = round(proposals.reduce((s, p) => s + p.revenueImpact30d, 0), 2);
  const belowTarget = i.candidates.filter((c) => c.netMargin < i.targetNetMargin);

  const metrics: Metric[] = [
    { key: 'analysed', label: 'Références analysées', value: i.candidates.length, unit: 'u' },
    { key: 'proposals', label: 'Ajustements proposés', value: proposals.length, unit: 'u' },
    { key: 'increases', label: 'Hausses', value: increases.length, unit: 'u' },
    { key: 'decreases', label: 'Baisses', value: decreases.length, unit: 'u' },
    { key: 'below_target', label: 'Références sous l’objectif de marge', value: belowTarget.length, unit: 'u',
      status: belowTarget.length === 0 ? 'healthy' : belowTarget.length <= i.candidates.length * 0.2 ? 'warning' : 'danger' },
    { key: 'impact', label: 'Effet estimé sur 30 jours', value: totalImpact, unit: '€',
      hint: 'À volumes constants : hypothèse prudente, sans élasticité prix.' },
  ];

  const findings: Finding[] = [];
  if (belowTarget.length)
    findings.push({ severity: belowTarget.length > i.candidates.length * 0.3 ? 'critical' : 'warning',
      title: `${belowTarget.length} référence(s) sous l’objectif de marge`,
      detail: `Objectif ${pct(i.targetNetMargin, 0)}. Les plus éloignées : ${belowTarget.slice(0, 3).map((c) => `${c.name} (${pct(c.netMargin)})`).join(', ')}.` });

  const withoutMarket = i.candidates.filter((c) => c.competitorPrices.length === 0);
  if (withoutMarket.length)
    findings.push({ severity: 'info', title: `${withoutMarket.length} référence(s) sans relevé de prix concurrent`,
      detail: 'Les propositions reposent alors uniquement sur la marge et la rotation. Ajouter des relevés concurrents rend l’arbitrage plus fiable.' });

  const unreachable = proposals.filter((p) => p.floorUnreachable);
  if (unreachable.length)
    findings.push({ severity: 'critical',
      title: `${unreachable.length} reference(s) vendues sous leur prix plancher`,
      detail: `${unreachable.map((p) => `${p.candidate.name} (${eur(p.candidate.currentPrice)})`).join(', ')}. `
        + `La hausse proposee est plafonnee a ${pct(i.maxChangePct, 0)} : relancer le module apres application, `
        + `ou agir sur le cout d'achat.` });

  const blockedCount = proposals.filter((p) => p.blocked && !p.floorUnreachable).length;
  if (blockedCount)
    findings.push({ severity: 'info', title: `${blockedCount} proposition(s) relevée(s) au prix plancher`,
      detail: `Le garde-fou « ${i.minMarkupOverCost}× le coût unitaire » a empêché une baisse trop agressive.` });

  const recommendations: Recommendation[] = [];
  if (proposals.length) {
    recommendations.push({
      priority: 1,
      title: `Soumettre ${proposals.length} ajustement(s) de prix à approbation`,
      detail: `Variation bornée à ±${pct(i.maxChangePct, 0)} par passe. Effet estimé : ${totalImpact >= 0 ? '+' : ''}${eur(totalImpact)} sur 30 jours à volumes constants. Chaque ligne reste modifiable avant validation, et l’ancien prix est conservé pour pouvoir revenir en arrière.`,
      requiresApproval: true,
      actionType: proposals.length > 1 ? 'bulk_price_change' : 'price_change',
      payload: {
        changes: proposals.map((p) => ({
          product_id: p.candidate.productId,
          variant_id: p.candidate.variantId ?? null,
          sku: p.candidate.sku,
          name: p.candidate.name,
          current_price: p.candidate.currentPrice,
          new_price: p.proposedPrice,
          change_pct: p.changePct,
          reason: p.reason,
        })),
        guardrails: {
          max_change_pct: i.maxChangePct,
          min_markup_over_cost: i.minMarkupOverCost,
          target_net_margin: i.targetNetMargin,
        },
      },
    });
  } else {
    recommendations.push({ priority: 3, title: 'Aucun ajustement nécessaire',
      detail: 'Tous les prix analysés respectent l’objectif de marge et le positionnement défini, aux arrondis près.' });
  }
  if (withoutMarket.length)
    recommendations.push({ priority: 2, title: 'Compléter la veille prix',
      detail: `Ajouter des relevés concurrents pour ${withoutMarket.length} référence(s) depuis le module de veille concurrentielle (saisie manuelle ou import CSV).` });

  const tables: EngineTable[] = [{
    title: 'Ajustements proposés',
    columns: [
      { key: 'sku', label: 'Référence' },
      { key: 'nom', label: 'Produit' },
      { key: 'actuel', label: 'Prix actuel', align: 'right' },
      { key: 'propose', label: 'Prix proposé', align: 'right' },
      { key: 'variation', label: 'Variation', align: 'right' },
      { key: 'marge', label: 'Marge après', align: 'right' },
      { key: 'motif', label: 'Motif' },
    ],
    rows: proposals.map((p) => ({
      sku: p.candidate.sku,
      nom: p.candidate.name,
      actuel: eur(p.candidate.currentPrice),
      propose: eur(p.proposedPrice),
      variation: `${p.changePct > 0 ? '+' : ''}${pct(p.changePct)}`,
      marge: `${pct(p.candidate.netMargin)} → ${pct(p.newMargin)}`,
      motif: p.blocked ? `${p.reason} — ${p.blocked}` : p.reason,
    })),
    note: `Garde-fous appliqués : variation maximale ±${pct(i.maxChangePct, 0)}, prix plancher à ${i.minMarkupOverCost}× le coût unitaire. Aucune modification n’est appliquée sans votre approbation.`,
  }];

  return {
    engineKey: 'dynamic-pricing',
    title: 'Recommandations de prix encadrées',
    summary: proposals.length
      ? `${proposals.length} ajustement(s) proposé(s) — ${increases.length} hausse(s), ${decreases.length} baisse(s) · effet estimé ${totalImpact >= 0 ? '+' : ''}${eur(totalImpact)} / 30 j.`
      : 'Aucun ajustement de prix nécessaire au regard des garde-fous et de l’objectif de marge.',
    status: belowTarget.length > i.candidates.length * 0.3 ? 'danger' : belowTarget.length ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { proposals, totalImpact, guardrails: { maxChangePct: i.maxChangePct, minMarkupOverCost: i.minMarkupOverCost } },
    dataGaps: withoutMarket.length
      ? [`${withoutMarket.length} référence(s) sans prix concurrent relevé : l’arbitrage marché n’est pas appliqué pour elles.`]
      : [],
  };
}
