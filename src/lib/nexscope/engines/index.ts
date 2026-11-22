/**
 * Registre des moteurs de calcul déterministes.
 *
 * Chaque entrée correspond à un (ou plusieurs) SKILL.md du dépôt
 * nexscope-ai/eCommerce-Skills dont l'algorithme a été porté en TypeScript
 * et s'exécute réellement dans l'application — sans clé API, sans appel
 * réseau, avec un résultat reproductible.
 */
import { runProfitMargin } from './profit-margin';
import { runSupplyChain } from './supply-chain';
import { runListingSeo } from './listing-seo';
import { runDynamicPricing } from './dynamic-pricing';
import { runUnitEconomics } from './unit-economics';
import { runInventoryForecast } from './inventory-forecast';
import { runSalesAnalytics } from './sales-analytics';
import { runReviewAnalysis } from './review-analysis';
import { runCrossBorder } from './cross-border';
import { runOpportunityScore } from './opportunity-score';
import { runFunnelCro } from './funnel-cro';
import { runPriceTracking } from './price-tracking';
import { runDifferentiation } from './differentiation';
import type { EngineResult } from '../types';

export interface EngineInfo {
  key: string;
  label: string;
  /** Ce que le moteur calcule, en une phrase. */
  description: string;
  /** Fichier(s) source dans le dépôt Nexscope dont l'algorithme est issu. */
  nexscopeSource: string;
  /** Le moteur a-t-il besoin de données que vous devez fournir ? */
  needsManualInput: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (input: any) => EngineResult;
}

export const ENGINES: Record<string, EngineInfo> = {
  'profit-margin': {
    key: 'profit-margin',
    label: 'Calcul de marge et de rentabilité',
    description: 'Décompose le prix en coûts réels, calcule marge brute et nette, prix plancher et grille de prix conseillés.',
    nexscopeSource: 'profit-margin-calculator/<canal>/scripts/calculator.py',
    needsManualInput: false,
    run: runProfitMargin,
  },
  'supply-chain': {
    key: 'supply-chain',
    label: 'Diagnostic de chaîne d’approvisionnement',
    description: 'Évalue marge, logistique et cycle de trésorerie face aux référentiels du canal, dimensionne les réapprovisionnements.',
    nexscopeSource: 'supply-chain-optimization/<canal>/scripts/calculator.py',
    needsManualInput: false,
    run: runSupplyChain,
  },
  'listing-seo': {
    key: 'listing-seo',
    label: 'Audit SEO de fiche produit',
    description: 'Note titre, mots-clés, description, attributs et images selon la pondération du dépôt, et propose les corrections.',
    nexscopeSource: 'etsy-seo/scripts/analyzer.py',
    needsManualInput: false,
    run: runListingSeo,
  },
  'dynamic-pricing': {
    key: 'dynamic-pricing',
    label: 'Recommandations de prix encadrées',
    description: 'Propose des ajustements bornés à partir de la marge, du marché et de la rotation. Rien n’est appliqué sans approbation.',
    nexscopeSource: 'dynamic-pricing-ecommerce/ · competitive-pricing-strategy/ · price-optimization-tool/',
    needsManualInput: false,
    run: runDynamicPricing,
  },
  'unit-economics': {
    key: 'unit-economics',
    label: 'Diagnostic de croissance',
    description: 'Calcule l’économie unitaire réelle (panier moyen, marge, réachat, CAC, LTV) et chiffre les cinq leviers de croissance.',
    nexscopeSource: 'ecommerce-growth-strategy/SKILL.md',
    needsManualInput: false,
    run: runUnitEconomics,
  },
  'inventory-forecast': {
    key: 'inventory-forecast',
    label: 'Pilotage des stocks',
    description: 'Vélocité, couverture, stock de sécurité, point de commande, quantité économique, classification ABC et stock dormant.',
    nexscopeSource: 'inventory-tracking-software/ · restock-alert/ · warehouse-optimization/',
    needsManualInput: false,
    run: runInventoryForecast,
  },
  'sales-analytics': {
    key: 'sales-analytics',
    label: 'Analyse des ventes',
    description: 'Tendance période sur période, concentration du chiffre d’affaires, produits en accélération et en décrochage, anomalies.',
    nexscopeSource: 'sales-tracking-tool/ · shopify-analytics-guide/',
    needsManualInput: false,
    run: runSalesAnalytics,
  },
  'review-analysis': {
    key: 'review-analysis',
    label: 'Analyse des avis clients',
    description: 'Extrait les points de friction et les arguments confirmés, et vérifie les signaux d’authenticité des avis.',
    nexscopeSource: 'review-checker/<canal>/scripts/analyzer.py · product-review-analysis/',
    needsManualInput: false,
    run: runReviewAnalysis,
  },
  'cross-border': {
    key: 'cross-border',
    label: 'Expansion internationale',
    description: 'Note les marchés (pouvoir d’achat, simplicité, langue, fiscalité), calcule le prix local et suit le seuil OSS de 10 000 €.',
    nexscopeSource: 'cross-border-ecommerce/SKILL.md · shopify-tax-compliance/',
    needsManualInput: false,
    run: runCrossBorder,
  },
  'opportunity-score': {
    key: 'opportunity-score',
    label: 'Notation d’opportunité produit',
    description: 'Note une idée de produit sur demande, concurrence, marge et logistique, et vérifie sa rentabilité réelle au prix visé.',
    nexscopeSource: 'dropshipping-product-research/ · market-gap-analysis/',
    needsManualInput: true,
    run: runOpportunityScore,
  },
  'funnel-cro': {
    key: 'funnel-cro',
    label: 'Tunnel de conversion',
    description: 'Chiffre la perte par étape, détecte les frictions structurelles et dimensionne un test A/B valide.',
    nexscopeSource: 'conversion-rate-optimization/ · ecommerce-checkout-optimization/ · ecommerce-ab-testing/',
    needsManualInput: false,
    run: runFunnelCro,
  },
  'price-tracking': {
    key: 'price-tracking',
    label: 'Veille des prix concurrents',
    description: 'Compare vos prix aux relevés concurrents en base (saisie ou import), calcule médiane, rang et écarts.',
    nexscopeSource: 'competitor-price-tracker/ · competitor-price-analysis/ · share-of-shelf/',
    needsManualInput: true,
    run: runPriceTracking,
  },
  differentiation: {
    key: 'differentiation',
    label: 'Différenciation produit',
    description: 'Matrice de comparaison pondérée par l’importance client, identification des avantages, retards et terrains libres.',
    nexscopeSource: 'product-differentiation/<canal>/scripts/analyzer.py',
    needsManualInput: true,
    run: runDifferentiation,
  },
};

export const ENGINE_KEYS = Object.keys(ENGINES);

export function getEngine(key: string | null | undefined): EngineInfo | null {
  if (!key) return null;
  return ENGINES[key] ?? null;
}

export * from './profit-margin';
export * from './supply-chain';
export * from './listing-seo';
export * from './dynamic-pricing';
export * from './unit-economics';
export * from './inventory-forecast';
export * from './sales-analytics';
export * from './review-analysis';
export * from './cross-border';
export * from './opportunity-score';
export * from './funnel-cro';
export * from './price-tracking';
export * from './differentiation';
