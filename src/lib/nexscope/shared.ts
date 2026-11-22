/** Utilitaires communs aux engines Nexscope. */
import type { HealthStatus, Metric } from './types';

export const round = (n: number, d = 2): number => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

export const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), max);

export const pct = (n: number, d = 1): string => `${round(n * 100, d)} %`;

export const eur = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

/**
 * Évaluation de statut par seuils — reprise de `evaluate_status()`
 * (supply-chain-optimization/scripts/calculator.py).
 */
export function evaluateStatus(
  value: number,
  thresholds: { healthy: number; warning: number },
  higherIsBetter = true,
): HealthStatus {
  if (higherIsBetter) {
    if (value >= thresholds.healthy) return 'healthy';
    if (value >= thresholds.warning) return 'warning';
    return 'danger';
  }
  if (value <= thresholds.healthy) return 'healthy';
  if (value <= thresholds.warning) return 'warning';
  return 'danger';
}

/**
 * Seuils de marge nette — repris de `PROFIT_THRESHOLDS`
 * (profit-margin-calculator/scripts/calculator.py).
 */
export const PROFIT_THRESHOLDS = { healthy: 0.2, warning: 0.05, danger: 0 } as const;

export function profitStatus(netMargin: number): HealthStatus {
  if (netMargin < 0) return 'loss';
  if (netMargin < PROFIT_THRESHOLDS.warning) return 'danger';
  if (netMargin < PROFIT_THRESHOLDS.healthy) return 'warning';
  return 'healthy';
}

/** Le pire statut d'une liste d'indicateurs — pilote le verdict global. */
export function worstStatus(metrics: Metric[]): HealthStatus {
  const order: HealthStatus[] = ['loss', 'danger', 'warning', 'healthy'];
  for (const s of order) if (metrics.some((m) => m.status === s)) return s;
  return 'healthy';
}

export const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: 'Sain',
  warning: 'À surveiller',
  danger: 'Critique',
  loss: 'À perte',
};

/** Écart-type d'échantillon (sécurité de stock, détection d'anomalies). */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Coefficients z pour les taux de service usuels (stock de sécurité). */
export const SERVICE_LEVEL_Z: Record<string, number> = {
  '0.90': 1.282,
  '0.95': 1.645,
  '0.975': 1.96,
  '0.99': 2.326,
};
