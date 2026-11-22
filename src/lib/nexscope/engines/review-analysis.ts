/**
 * MOTEUR — Analyse des avis clients
 *
 * Porté depuis :
 *   review-checker/<canal>/scripts/analyzer.py  (détection d'avis suspects :
 *     similarité de contenu, regroupement temporel, distribution des notes,
 *     part d'achats vérifiés, longueur, vocabulaire promotionnel)
 *   product-review-analysis/SKILL.md, customer-feedback-analysis/SKILL.md,
 *   review-monitoring/SKILL.md
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Les catégories de points de douleur et d'arguments sont adaptées au
 * prêt-à-porter (taille, matière, couleur, livraison) depuis les listes
 * PAIN_POINT_KEYWORDS / SELLING_POINT_KEYWORDS du dépôt.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { pct, round, safeDiv } from '../shared';

export interface ReviewRecord {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string;
  isVerified: boolean;
  createdAt: string;
  productName?: string;
}

export interface ReviewAnalysisInput {
  reviews: ReviewRecord[];
  productName: string;
}

/** Lexiques adaptés au prêt-à-porter, dérivés de PAIN_POINT_KEYWORDS. */
const PAIN_KEYWORDS: Record<string, string[]> = {
  'Taille et coupe': ['trop petit', 'trop grand', 'taille au-dessus', 'taille en dessous', 'ne taille pas',
    'serré', 'étroit', 'large', 'ample', 'ne rentre pas', 'mauvaise taille', 'coupe bizarre'],
  'Qualité et finitions': ['mauvaise qualité', 'fragile', 'déchiré', 'décousu', 'bouloche', 'fil qui',
    'cassé', 'défaut', 'abîmé', 'ne tient pas', 'fini bâclé', 'coutures'],
  'Matière et confort': ['gratte', 'rugueux', 'inconfortable', 'rigide', 'transparent', 'étouffe',
    'tient chaud', 'synthétique', 'rêche'],
  'Couleur et visuel': ['couleur différente', 'pas la même couleur', 'photo trompeuse', 'plus foncé',
    'plus clair', 'rien à voir avec la photo', 'terne'],
  'Livraison et emballage': ['livraison', 'retard', 'colis abîmé', 'jamais reçu', 'emballage',
    'trompé de produit', 'manquant'],
  'Rapport qualité-prix': ['trop cher', 'pas le prix', 'arnaque', 'ne vaut pas', 'déçu du prix',
    'cher pour ce que c’est', 'cher pour ce que c\'est'],
  'Entretien': ['rétréci', 'rétrécit', 'déteint', 'au lavage', 'ne se repasse pas', 'abîmé au lavage'],
};

/** Lexiques dérivés de SELLING_POINT_KEYWORDS. */
const PRAISE_KEYWORDS: Record<string, string[]> = {
  'Qualité perçue': ['belle qualité', 'très bonne qualité', 'solide', 'bien fini', 'finitions',
    'durable', 'impeccable', 'haut de gamme', 'robuste'],
  'Coupe et tombé': ['tombe bien', 'bien coupé', 'belle coupe', 'taille parfaitement', 'à ma taille',
    'ajusté', 'tombé'],
  'Matière': ['agréable', 'doux', 'confortable', 'belle matière', 'tissu', 'respirant', 'souple'],
  'Allure': ['élégant', 'classe', 'magnifique', 'superbe', 'chic', 'allure', 'compliments', 'beau'],
  'Rapport qualité-prix': ['bon rapport', 'vaut le prix', 'bon prix', 'excellent rapport', 'qualité-prix'],
  'Service': ['livraison rapide', 'bien emballé', 'service', 'réactif', 'soigné'],
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Similarité de Jaccard sur les mots — base de `detect_content_similarity()`. */
function jaccard(a: string, b: string): number {
  const sa = new Set(norm(a).split(/\W+/).filter((w) => w.length > 3));
  const sb = new Set(norm(b).split(/\W+/).filter((w) => w.length > 3));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

export function runReviewAnalysis(i: ReviewAnalysisInput): EngineResult {
  const reviews = i.reviews;
  const n = reviews.length;

  if (n === 0) {
    return {
      engineKey: 'review-analysis',
      title: `Analyse des avis — ${i.productName}`,
      summary: 'Aucun avis à analyser pour le moment.',
      status: 'warning',
      metrics: [{ key: 'count', label: 'Avis analysés', value: 0, unit: 'u' }],
      findings: [{ severity: 'info', title: 'Aucun avis collecté',
        detail: 'Sans avis, la fiche produit perd un levier de conversion majeur et ne peut pas afficher d’étoiles dans les résultats de recherche.' }],
      recommendations: [{ priority: 1, title: 'Mettre en place une demande d’avis après livraison',
        detail: 'Un email envoyé 7 à 14 jours après la livraison obtient les meilleurs taux de réponse. Les avis vérifiés alimentent aussi l’analyse des points de friction.' }],
      tables: [], raw: {},
      dataGaps: ['Aucun avis en base. Les avis importés depuis une marketplace peuvent être ajoutés par import CSV.'],
    };
  }

  const avg = safeDiv(reviews.reduce((s, r) => s + r.rating, 0), n);
  const dist = [1, 2, 3, 4, 5].map((star) => ({
    star, count: reviews.filter((r) => r.rating === star).length,
  }));
  const negative = reviews.filter((r) => r.rating <= 2);
  const positive = reviews.filter((r) => r.rating >= 4);
  const verifiedRatio = safeDiv(reviews.filter((r) => r.isVerified).length, n);

  // ── Extraction des thèmes ──
  function extractThemes(subset: ReviewRecord[], lexicon: Record<string, string[]>) {
    const out: { theme: string; count: number; quotes: string[] }[] = [];
    for (const [theme, words] of Object.entries(lexicon)) {
      const matches = subset.filter((r) => {
        const hay = norm(`${r.title ?? ''} ${r.body ?? ''}`);
        return words.some((w) => hay.includes(norm(w)));
      });
      if (matches.length)
        out.push({ theme, count: matches.length,
          quotes: matches.slice(0, 2).map((r) => (r.body ?? r.title ?? '').slice(0, 160)) });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  const pains = extractThemes(reviews, PAIN_KEYWORDS);
  const praises = extractThemes(reviews, PRAISE_KEYWORDS);

  // ── Signaux d'authenticité, repris de review-checker ──
  const authenticityFlags: string[] = [];
  let suspiciousPairs = 0;
  const withText = reviews.filter((r) => (r.body ?? '').length > 40);
  for (let a = 0; a < withText.length; a += 1)
    for (let b = a + 1; b < withText.length; b += 1)
      if (jaccard(withText[a].body ?? '', withText[b].body ?? '') > 0.6) suspiciousPairs += 1;
  if (suspiciousPairs > 0)
    authenticityFlags.push(`${suspiciousPairs} paire(s) d’avis au contenu très similaire (similarité > 60 %)`);

  // Regroupement temporel : plus de 30 % des avis sur une même journée
  const byDay = new Map<string, number>();
  for (const r of reviews) {
    const d = r.createdAt.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const maxDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n >= 10 && maxDay && maxDay[1] / n > 0.3)
    authenticityFlags.push(`${maxDay[1]} avis sur ${n} déposés le même jour (${maxDay[0]})`);

  // Distribution en U : beaucoup de 5 et de 1, peu de notes intermédiaires
  const extremes = safeDiv(dist[0].count + dist[4].count, n);
  const middles = safeDiv(dist[1].count + dist[2].count + dist[3].count, n);
  if (n >= 10 && extremes > 0.85 && middles < 0.15)
    authenticityFlags.push('Distribution des notes polarisée (presque uniquement des 1 et des 5)');

  if (n >= 10 && verifiedRatio < 0.5)
    authenticityFlags.push(`Seulement ${pct(verifiedRatio)} d’avis liés à une commande vérifiée`);

  const veryShort = reviews.filter((r) => ((r.body ?? '').trim().length) < 20).length;
  if (n >= 10 && veryShort / n > 0.5)
    authenticityFlags.push(`${pct(safeDiv(veryShort, n))} des avis font moins de 20 caractères`);

  const metrics: Metric[] = [
    { key: 'count', label: 'Avis analysés', value: n, unit: 'u' },
    { key: 'average', label: 'Note moyenne', value: round(avg, 2), unit: '',
      status: avg >= 4.3 ? 'healthy' : avg >= 3.8 ? 'warning' : 'danger', benchmark: 4.3 },
    { key: 'negative_rate', label: 'Part d’avis négatifs (1–2 ★)', value: round(safeDiv(negative.length, n) * 100, 1),
      unit: '%', status: safeDiv(negative.length, n) <= 0.08 ? 'healthy' : safeDiv(negative.length, n) <= 0.15 ? 'warning' : 'danger' },
    { key: 'verified', label: 'Avis vérifiés', value: round(verifiedRatio * 100, 1), unit: '%',
      status: verifiedRatio >= 0.8 ? 'healthy' : verifiedRatio >= 0.5 ? 'warning' : 'danger' },
    { key: 'promoter', label: 'Part d’avis 4–5 ★', value: round(safeDiv(positive.length, n) * 100, 1), unit: '%',
      status: safeDiv(positive.length, n) >= 0.8 ? 'healthy' : 'warning' },
  ];

  const findings: Finding[] = [];
  if (avg < 3.8)
    findings.push({ severity: 'critical', title: `Note moyenne de ${round(avg, 2)}/5`,
      detail: 'Sous 3,8, la note devient un frein à l’achat plus qu’un argument. Les thèmes ci-dessous indiquent où agir en priorité.' });
  for (const p of pains.slice(0, 3))
    findings.push({ severity: p.count >= n * 0.2 ? 'critical' : 'warning',
      title: `${p.theme} — cité dans ${p.count} avis (${pct(safeDiv(p.count, n))})`,
      detail: p.quotes.length ? `Extraits : « ${p.quotes.join(' » · « ')} »` : 'Thème récurrent dans les avis.' });
  if (authenticityFlags.length)
    findings.push({ severity: 'warning', title: `${authenticityFlags.length} signal(aux) d’authenticité à vérifier`,
      detail: authenticityFlags.join(' ; ') + '. Méthode de détection reprise des scripts review-checker du dépôt Nexscope.' });

  const recommendations: Recommendation[] = [];
  const sizePain = pains.find((p) => p.theme === 'Taille et coupe');
  if (sizePain && sizePain.count >= 2)
    recommendations.push({ priority: 1, title: 'Corriger le guide des tailles de cette fiche',
      detail: `${sizePain.count} avis évoquent un problème de taille. Ajouter les mensurations réelles du vêtement à plat, la taille portée par le mannequin et une recommandation explicite (« taille petit, prendre une taille au-dessus »). C’est l’action qui réduit le plus vite le taux de retour.` });
  const qualityPain = pains.find((p) => p.theme === 'Qualité et finitions');
  if (qualityPain && qualityPain.count >= n * 0.15)
    recommendations.push({ priority: 1, title: 'Alerter le fournisseur sur un défaut récurrent',
      detail: `${qualityPain.count} avis signalent un problème de qualité ou de finition. À documenter avec photos et à remonter au fournisseur avant la prochaine commande.` });
  if (praises.length)
    recommendations.push({ priority: 2, title: `Reprendre les arguments qui fonctionnent : ${praises.slice(0, 3).map((p) => p.theme.toLowerCase()).join(', ')}`,
      detail: 'Ce sont les mots des clients eux-mêmes. Les réutiliser dans la description et les visuels aligne la promesse sur la perception réelle.' });
  if (negative.length)
    recommendations.push({ priority: 2, title: `Répondre aux ${negative.length} avis négatifs`,
      detail: 'Une réponse publique, factuelle et non défensive sur un avis négatif rassure davantage que l’absence d’avis négatif.' });

  const tables: EngineTable[] = [
    {
      title: 'Distribution des notes',
      columns: [{ key: 'note', label: 'Note' }, { key: 'nombre', label: 'Nombre', align: 'right' },
                { key: 'part', label: 'Part', align: 'right' }],
      rows: [...dist].reverse().map((d) => ({
        note: `${d.star} ★`, nombre: d.count, part: pct(safeDiv(d.count, n)),
      })),
    },
  ];
  if (pains.length)
    tables.push({
      title: 'Points de friction identifiés',
      columns: [{ key: 'theme', label: 'Thème' }, { key: 'avis', label: 'Avis concernés', align: 'right' },
                { key: 'part', label: 'Part', align: 'right' }, { key: 'extrait', label: 'Extrait' }],
      rows: pains.map((p) => ({ theme: p.theme, avis: p.count, part: pct(safeDiv(p.count, n)),
        extrait: p.quotes[0] ? `« ${p.quotes[0]} »` : '—' })),
      note: 'Détection par lexique adapté au prêt-à-porter, dérivé de PAIN_POINT_KEYWORDS (product-differentiation/scripts/analyzer.py).',
    });
  if (praises.length)
    tables.push({
      title: 'Arguments confirmés par les clients',
      columns: [{ key: 'theme', label: 'Thème' }, { key: 'avis', label: 'Avis concernés', align: 'right' },
                { key: 'extrait', label: 'Extrait' }],
      rows: praises.map((p) => ({ theme: p.theme, avis: p.count,
        extrait: p.quotes[0] ? `« ${p.quotes[0]} »` : '—' })),
    });

  const dataGaps: string[] = [];
  if (n < 10) dataGaps.push(`Seulement ${n} avis : les signaux statistiques (distribution, regroupement temporel) demandent au moins 10 avis pour être interprétables.`);
  if (reviews.every((r) => !r.body)) dataGaps.push('Les avis ne contiennent pas de texte : l’analyse thématique est impossible.');

  return {
    engineKey: 'review-analysis',
    title: `Analyse des avis — ${i.productName}`,
    summary: `${n} avis · note moyenne ${round(avg, 2)}/5 · ${pct(safeDiv(negative.length, n))} d’avis négatifs${pains.length ? ` · friction principale : ${pains[0].theme.toLowerCase()}` : ''}.`,
    status: avg < 3.8 ? 'danger' : avg < 4.3 || pains.some((p) => p.count >= n * 0.2) ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { average: round(avg, 2), distribution: dist, pains, praises, authenticityFlags, verifiedRatio },
    dataGaps,
  };
}
