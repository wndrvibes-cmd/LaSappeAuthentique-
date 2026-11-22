/**
 * MOTEUR — Audit SEO d'une fiche produit
 *
 * Portage TypeScript de :
 *   etsy-seo/scripts/analyzer.py  (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Pondération du score conservée à l'identique :
 *   titre 30 % · mots-clés 25 % · description 20 % · attributs 15 % · images 10 %
 *
 * Les contraintes de longueur sont adaptées au référencement web (Google /
 * Google Shopping) plutôt qu'au format Etsy : titre 50–70 caractères pour la
 * balise title, description de 300 mots minimum, 5 images recommandées.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { clamp } from '../shared';

export interface ListingSeoInput {
  productName: string;
  seoTitle: string | null;
  seoDescription: string | null;
  description: string | null;
  tags: string[];
  imageCount: number;
  imagesWithAlt: number;
  /** Attributs structurés renseignés : matière, entretien, coupe… */
  attributes: { composition: boolean; careGuide: boolean; category: boolean; weight: boolean };
  /** Mots-clés cibles de la catégorie (saisis ou issus du catalogue). */
  targetKeywords: string[];
  variantCount: number;
  hasReviews: boolean;
}

type Grade = 'excellent' | 'good' | 'average' | 'poor' | 'critical';

const GRADE_LABEL: Record<Grade, string> = {
  excellent: 'Excellent', good: 'Bon', average: 'Moyen', poor: 'Faible', critical: 'Critique',
};

function gradeOf(total: number): Grade {
  if (total >= 90) return 'excellent';
  if (total >= 70) return 'good';
  if (total >= 50) return 'average';
  if (total >= 30) return 'poor';
  return 'critical';
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** `analyze_title()` — adapté aux contraintes du web. */
function analyzeTitle(title: string, keywords: string[]) {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  const len = title.length;

  if (len === 0) { return { score: 0, len, issues: ['Balise title absente'], suggestions: ['Renseigner un titre SEO'], keywordCount: 0 }; }
  if (len < 30) { issues.push('Titre trop court (moins de 30 caractères)'); score -= 20; }
  else if (len > 70) { issues.push('Titre tronqué dans les résultats de recherche (plus de 70 caractères)'); score -= 15; }
  else if (len < 50) { suggestions.push('Un titre de 50 à 70 caractères exploite toute la largeur affichée par Google'); score -= 5; }

  const hay = norm(title);
  const found = keywords.filter((k) => hay.includes(norm(k)));
  if (found.length === 0) { issues.push('Aucun mot-clé cible dans le titre'); score -= 25; }
  else if (found.length < 2) { suggestions.push('Ajouter un second mot-clé qualifiant (matière, usage, coupe)'); score -= 10; }

  if (title.split(/\s+/).length < 4) { issues.push('Titre trop pauvre en mots'); score -= 15; }
  if (/[!@#$%^*()_+=[\]{}|\\:";'<>?/]/.test(title)) { suggestions.push('Éviter les caractères spéciaux dans le titre'); score -= 5; }
  if (title === title.toUpperCase() && len > 6) { issues.push('Titre entièrement en majuscules'); score -= 15; }
  if (!/—|–|\||,/.test(title)) suggestions.push('Séparer le produit de la marque par un tiret cadratin ou une barre verticale');

  return { score: clamp(score, 0, 100), len, issues, suggestions, keywordCount: found.length };
}

/** `analyze_tags()` — les mots-clés tiennent lieu de tags. */
function analyzeKeywords(tags: string[], keywords: string[]) {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  if (tags.length === 0) { return { score: 0, issues: ['Aucun mot-clé renseigné'], suggestions: ['Renseigner au moins 5 mots-clés'], longTail: 0 }; }
  if (tags.length < 5) { issues.push(`Seulement ${tags.length} mot(s)-clé(s) — viser au moins 5`); score -= 25; }
  else if (tags.length < 8) { suggestions.push('8 à 13 mots-clés couvrent mieux les requêtes longues'); score -= 8; }

  const longTail = tags.filter((t) => t.trim().split(/\s+/).length >= 2).length;
  if (longTail === 0) { issues.push('Aucune expression de longue traîne (deux mots ou plus)'); score -= 20; }
  else if (longTail < tags.length * 0.4) { suggestions.push('La longue traîne convertit mieux : viser 40 % des mots-clés en expressions'); score -= 8; }

  const lower = tags.map(norm);
  if (new Set(lower).size !== lower.length) { issues.push('Mots-clés en doublon'); score -= 10; }
  const overlap = keywords.filter((k) => lower.some((t) => t.includes(norm(k)))).length;
  if (overlap === 0) { issues.push('Aucun recoupement avec les mots-clés cibles de la catégorie'); score -= 15; }
  if (tags.some((t) => t.length > 30)) { suggestions.push('Raccourcir les mots-clés de plus de 30 caractères'); score -= 5; }

  return { score: clamp(score, 0, 100), issues, suggestions, longTail };
}

/** `analyze_description()`. */
function analyzeDescription(description: string, metaDescription: string | null, keywords: string[]) {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  const words = description.trim() ? description.trim().split(/\s+/).length : 0;

  if (words === 0) { return { score: 0, words, issues: ['Description absente'], suggestions: [], metaOk: false }; }
  if (words < 50) { issues.push('Description très courte (moins de 50 mots)'); score -= 30; }
  else if (words < 150) { suggestions.push('Viser 150 à 400 mots : matière, coupe, entretien, usage'); score -= 12; }

  const hay = norm(description);
  const found = keywords.filter((k) => hay.includes(norm(k)));
  if (found.length === 0) { issues.push('Aucun mot-clé cible dans la description'); score -= 20; }

  const firstSentence = description.slice(0, 160);
  if (!keywords.some((k) => norm(firstSentence).includes(norm(k)))) {
    suggestions.push('Placer le mot-clé principal dans les 160 premiers caractères'); score -= 8;
  }

  const metaLen = metaDescription?.length ?? 0;
  const metaOk = metaLen >= 120 && metaLen <= 165;
  if (metaLen === 0) { issues.push('Méta-description absente'); score -= 15; }
  else if (!metaOk) { suggestions.push('Méta-description idéale entre 120 et 165 caractères'); score -= 6; }

  return { score: clamp(score, 0, 100), words, issues, suggestions, metaOk };
}

export function runListingSeo(i: ListingSeoInput): EngineResult {
  const keywords = i.targetKeywords.length ? i.targetKeywords : i.tags;
  const title = i.seoTitle || i.productName;

  const t = analyzeTitle(title, keywords);
  const k = analyzeKeywords(i.tags, keywords);
  const d = analyzeDescription(i.description ?? '', i.seoDescription, keywords);

  // Attributs structurés (15 %)
  const attrFilled = Object.values(i.attributes).filter(Boolean).length;
  const attrScore = Math.round((attrFilled / 4) * 100);

  // Images (10 %)
  let imgScore = 100;
  if (i.imageCount === 0) imgScore = 0;
  else {
    if (i.imageCount < 3) imgScore -= 40;
    else if (i.imageCount < 5) imgScore -= 15;
    const altRatio = i.imageCount > 0 ? i.imagesWithAlt / i.imageCount : 0;
    if (altRatio < 1) imgScore -= Math.round((1 - altRatio) * 35);
  }
  imgScore = clamp(imgScore, 0, 100);

  // Pondération d'origine : 30 / 25 / 20 / 15 / 10
  const total = Math.round(t.score * 0.30 + k.score * 0.25 + d.score * 0.20 + attrScore * 0.15 + imgScore * 0.10);
  const grade = gradeOf(total);

  const metrics: Metric[] = [
    { key: 'total', label: 'Score SEO global', value: total, unit: '/100',
      status: total >= 70 ? 'healthy' : total >= 50 ? 'warning' : 'danger', benchmark: 70 },
    { key: 'title', label: 'Titre (30 %)', value: t.score, unit: '/100',
      status: t.score >= 70 ? 'healthy' : t.score >= 50 ? 'warning' : 'danger' },
    { key: 'keywords', label: 'Mots-clés (25 %)', value: k.score, unit: '/100',
      status: k.score >= 70 ? 'healthy' : k.score >= 50 ? 'warning' : 'danger' },
    { key: 'description', label: 'Description (20 %)', value: d.score, unit: '/100',
      status: d.score >= 70 ? 'healthy' : d.score >= 50 ? 'warning' : 'danger' },
    { key: 'attributes', label: 'Attributs (15 %)', value: attrScore, unit: '/100',
      status: attrScore >= 70 ? 'healthy' : attrScore >= 50 ? 'warning' : 'danger' },
    { key: 'images', label: 'Images (10 %)', value: imgScore, unit: '/100',
      status: imgScore >= 70 ? 'healthy' : imgScore >= 50 ? 'warning' : 'danger' },
  ];

  const findings: Finding[] = [];
  for (const [section, res] of [['Titre', t], ['Mots-clés', k], ['Description', d]] as const) {
    for (const issue of res.issues)
      findings.push({ severity: 'critical', title: `${section} — ${issue}`, detail: 'Point bloquant pour le référencement de cette fiche.' });
    for (const s of (res as { suggestions?: string[] }).suggestions ?? [])
      findings.push({ severity: 'info', title: `${section} — ${s}`, detail: 'Amélioration recommandée.' });
  }
  if (i.imageCount < 5)
    findings.push({ severity: 'warning', title: `${i.imageCount} image(s) seulement`,
      detail: 'En prêt-à-porter, 5 à 8 visuels (porté, détail matière, dos, accessoirisé) réduisent nettement le taux de retour et augmentent la conversion.' });
  if (i.imagesWithAlt < i.imageCount)
    findings.push({ severity: 'warning', title: `${i.imageCount - i.imagesWithAlt} image(s) sans texte alternatif`,
      detail: 'Le texte alternatif sert à la fois l’accessibilité et le référencement dans Google Images.' });
  if (!i.hasReviews)
    findings.push({ severity: 'info', title: 'Aucun avis publié',
      detail: 'Les avis alimentent les données structurées (étoiles dans les résultats) et rassurent avant achat.' });

  const recommendations: Recommendation[] = [];
  if (t.score < 80) {
    const kw = keywords[0] ?? i.productName.split(' ')[0];
    const proposal = `${i.productName} — ${kw} | La Sappe Authentique`.slice(0, 70);
    recommendations.push({ priority: 1, title: 'Réécrire la balise title',
      detail: `Proposition (${proposal.length} caractères) : « ${proposal} ». Le mot-clé principal est placé en tête, la marque en fin.` });
  }
  if (k.score < 80)
    recommendations.push({ priority: 2, title: 'Compléter les mots-clés avec de la longue traîne',
      detail: `${i.tags.length} mot(s)-clé(s) dont ${k.longTail} expression(s). Ajouter des requêtes d’intention : « ${keywords[0] ?? 'produit'} homme », « ${keywords[0] ?? 'produit'} fait main », « acheter ${keywords[0] ?? 'produit'} en ligne ».` });
  if (d.score < 80)
    recommendations.push({ priority: 2, title: 'Étoffer la description',
      detail: `${d.words} mots actuellement. Structurer en quatre blocs : matière et provenance, coupe et tombé, entretien, occasions de port. Viser 250 à 400 mots.` });
  if (attrFilled < 4)
    recommendations.push({ priority: 3, title: 'Renseigner les attributs manquants',
      detail: 'Composition, guide d’entretien, catégorie et poids alimentent les filtres de la boutique, le flux Google Shopping et les données structurées.' });

  const tables: EngineTable[] = [{
    title: 'Détail de la notation',
    columns: [
      { key: 'critere', label: 'Critère' },
      { key: 'poids', label: 'Poids', align: 'right' },
      { key: 'score', label: 'Score', align: 'right' },
      { key: 'constat', label: 'Constat' },
    ],
    rows: [
      { critere: 'Titre', poids: '30 %', score: `${t.score}/100`, constat: `${t.len} caractères, ${t.keywordCount} mot(s)-clé(s)` },
      { critere: 'Mots-clés', poids: '25 %', score: `${k.score}/100`, constat: `${i.tags.length} mot(s)-clé(s), ${k.longTail} en longue traîne` },
      { critere: 'Description', poids: '20 %', score: `${d.score}/100`, constat: `${d.words} mots, méta-description ${d.metaOk ? 'correcte' : 'à revoir'}` },
      { critere: 'Attributs', poids: '15 %', score: `${attrScore}/100`, constat: `${attrFilled}/4 renseignés` },
      { critere: 'Images', poids: '10 %', score: `${imgScore}/100`, constat: `${i.imageCount} image(s), ${i.imagesWithAlt} avec texte alternatif` },
    ],
    note: 'Pondération reprise du script etsy-seo/scripts/analyzer.py du dépôt Nexscope.',
  }];

  return {
    engineKey: 'listing-seo',
    title: `Audit SEO — ${i.productName}`,
    summary: `${total}/100 — ${GRADE_LABEL[grade]}. ${findings.filter((f) => f.severity === 'critical').length} point(s) bloquant(s).`,
    status: total >= 70 ? 'healthy' : total >= 50 ? 'warning' : 'danger',
    metrics, findings, recommendations, tables,
    raw: { total, grade, title: t, keywords: k, description: d, attrScore, imgScore },
    dataGaps: i.targetKeywords.length
      ? []
      : ['Aucun mot-clé cible fourni : l’audit s’appuie sur les mots-clés déjà saisis sur la fiche. Pour un audit comparatif, renseigner les mots-clés visés.'],
  };
}
