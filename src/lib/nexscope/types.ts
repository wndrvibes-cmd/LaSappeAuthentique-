/**
 * Types du moteur Nexscope.
 *
 * Un « module » est une compétence du dépôt nexscope-ai/eCommerce-Skills
 * rendue exécutable dans l'application. Trois modes :
 *
 *  • engine    — un algorithme déterministe tourne dans l'application
 *                (portage TypeScript des scripts Python du dépôt).
 *                Aucune clé API, résultat reproductible.
 *  • reasoning — les instructions réelles du SKILL.md sont envoyées au
 *                modèle, accompagnées des données réelles de la boutique.
 *                Nécessite ANTHROPIC_API_KEY côté Edge Function.
 *  • hybrid    — l'engine calcule, le modèle interprète et priorise.
 */

export type ExecutionMode = 'engine' | 'reasoning' | 'hybrid';

export interface NexscopeSkillMeta {
  slug: string;
  name: string;
  category: string;
  platform: string | null;
  emoji: string | null;
  description: string;
  source_path: string;
  execution_mode: ExecutionMode;
  engine_key: string | null;
  has_scripts: boolean;
  requires_external_data: boolean;
  external_data_note: string | null;
  is_core: boolean;
  position: number;
}

/** Niveau de santé commun à tous les engines (repris du dépôt Nexscope). */
export type HealthStatus = 'healthy' | 'warning' | 'danger' | 'loss';

export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: '%' | '€' | 'j' | 'u' | 'x' | '/100' | '';
  status?: HealthStatus;
  benchmark?: number;
  hint?: string;
}

export interface Finding {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  /** Impact chiffré quand il est calculable. */
  impact?: string;
}

export interface Recommendation {
  priority: 1 | 2 | 3;
  title: string;
  detail: string;
  /** Action sensible : nécessite une approbation explicite. */
  requiresApproval?: boolean;
  actionType?:
    | 'price_change'
    | 'bulk_price_change'
    | 'ad_budget_change'
    | 'purchase_order'
    | 'inventory_adjustment'
    | 'discount_creation'
    | 'bulk_email';
  payload?: Record<string, unknown>;
}

/** Résultat normalisé de tout engine déterministe. */
export interface EngineResult {
  engineKey: string;
  title: string;
  /** Verdict court, lisible en une ligne. */
  summary: string;
  status: HealthStatus;
  metrics: Metric[];
  findings: Finding[];
  recommendations: Recommendation[];
  /** Tableaux de détail (décomposition de coûts, grille de prix…). */
  tables: EngineTable[];
  /** Données brutes réutilisables (export CSV, graphiques). */
  raw: Record<string, unknown>;
  /** Ce qui manque pour aller plus loin, en toute transparence. */
  dataGaps: string[];
}

export interface EngineTable {
  title: string;
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, string | number | null>[];
  note?: string;
}

export interface EngineDefinition<I = Record<string, unknown>> {
  key: string;
  label: string;
  description: string;
  /** Source exacte dans le dépôt Nexscope dont l'algorithme est issu. */
  nexscopeSource: string;
  run: (input: I) => EngineResult;
}
