/** Formatage pour l'interface française. */

export const formatPrice = (value: number | null | undefined, currency = 'EUR'): string =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 2 })
        .format(value);

export const formatPriceCompact = (value: number | null | undefined, currency = 'EUR'): string =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency, maximumFractionDigits: 0,
        notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
      }).format(value);

export const formatPercent = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: digits,
        maximumFractionDigits: digits }).format(value);

export const formatNumber = (value: number | null | undefined, digits = 0): string =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);

export const formatDate = (value: string | Date | null | undefined): string =>
  !value ? '—'
    : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        .format(new Date(value));

export const formatDateTime = (value: string | Date | null | undefined): string =>
  !value ? '—'
    : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export const formatRelative = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `il y a ${days} j`;
  return formatDate(value);
};

/** Libellés français des statuts de commande. */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente de paiement',
  paid: 'Payée',
  processing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', authorized: 'Autorisé', paid: 'Payé',
  failed: 'Échoué', refunded: 'Remboursé', partially_refunded: 'Partiellement remboursé',
};

export const FULFILLMENT_STATUS_LABEL: Record<string, string> = {
  unfulfilled: 'Non traitée', partial: 'Partielle', fulfilled: 'Expédiée', returned: 'Retournée',
};

export const PRODUCT_STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', active: 'En ligne', archived: 'Archivé',
};

export const APPROVAL_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente de décision', approved: 'Approuvée', rejected: 'Refusée',
  expired: 'Expirée', applied: 'Appliquée',
};

export const ACTION_TYPE_LABEL: Record<string, string> = {
  price_change: 'Changement de prix',
  bulk_price_change: 'Changement de prix groupé',
  ad_budget_change: 'Modification de budget publicitaire',
  purchase_order: 'Commande fournisseur',
  inventory_adjustment: 'Ajustement de stock',
  discount_creation: 'Création d’un code de réduction',
  bulk_email: 'Envoi d’emails en masse',
};

export const ALERT_KIND_LABEL: Record<string, string> = {
  low_stock: 'Stock bas', out_of_stock: 'Rupture de stock',
  competitor_price_drop: 'Baisse de prix concurrent',
  competitor_price_rise: 'Hausse de prix concurrent',
  margin_below_target: 'Marge sous l’objectif',
  sales_drop: 'Recul des ventes', sales_spike: 'Pic de ventes',
  review_negative: 'Avis négatif', brand_mention: 'Mention de marque',
  automation_failed: 'Automatisation en échec',
};

export const AUTOMATION_KIND_LABEL: Record<string, string> = {
  skill_analysis: 'Analyse programmée',
  price_alert: 'Alerte de prix',
  stock_alert: 'Alerte de stock',
  competitor_watch: 'Surveillance concurrentielle',
  sales_report: 'Rapport de ventes',
  price_recommendation: 'Recommandation de prix',
  performance_tracking: 'Suivi des performances',
};

/** Description lisible d'une expression cron. */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, , dow] = parts;
  const time = `${hour.padStart(2, '0')} h ${min.padStart(2, '0')}`;
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  if (dom === '*' && dow === '*') return `chaque jour à ${time}`;
  if (dow !== '*' && !dow.includes('-')) return `chaque ${days[Number(dow) % 7]} à ${time}`;
  if (dow === '1-5') return `du lundi au vendredi à ${time}`;
  if (dom !== '*') return `le ${dom} de chaque mois à ${time}`;
  return cron;
}
