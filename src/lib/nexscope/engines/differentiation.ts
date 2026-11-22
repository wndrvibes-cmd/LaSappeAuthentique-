/**
 * MOTEUR — Différenciation produit
 *
 * Porté depuis :
 *   product-differentiation/product-differentiation-shopify/scripts/analyzer.py
 *   (matrice de comparaison, identification d'opportunités, positionnement)
 *   product-differentiation/<canal>/SKILL.md
 *   (dépôt nexscope-ai/eCommerce-Skills)
 *
 * Construit une matrice de comparaison entre votre produit et les
 * concurrents saisis, identifie les axes où vous êtes devant, derrière,
 * ou là où personne ne joue, et propose un positionnement.
 */
import type { EngineResult, EngineTable, Finding, Metric, Recommendation } from '../types';
import { eur, pct, round, safeDiv } from '../shared';

export interface DifferentiationAttribute {
  key: string;
  label: string;
  /** Notre valeur sur cet axe, de 0 à 10. */
  ours: number | null;
  /** Valeurs concurrentes sur le même axe, de 0 à 10. */
  competitors: { name: string; value: number | null }[];
  /** Cet axe compte-t-il pour le client ? De 1 (accessoire) à 5 (décisif). */
  importance: 1 | 2 | 3 | 4 | 5;
}

export interface DifferentiationInput {
  productName: string;
  ourPrice: number;
  competitorPrices: { name: string; price: number }[];
  attributes: DifferentiationAttribute[];
  /** Thèmes de friction issus de l'analyse des avis, si disponible. */
  painThemes: { theme: string; count: number }[];
  /** Arguments confirmés par les avis, si disponible. */
  praiseThemes: { theme: string; count: number }[];
}

export function runDifferentiation(i: DifferentiationInput): EngineResult {
  const scored = i.attributes
    .filter((a) => a.ours !== null)
    .map((a) => {
      const compValues = a.competitors.map((c) => c.value).filter((v): v is number => v !== null);
      const compAvg = compValues.length ? safeDiv(compValues.reduce((s, v) => s + v, 0), compValues.length) : null;
      const compMax = compValues.length ? Math.max(...compValues) : null;
      const gap = compAvg !== null ? (a.ours as number) - compAvg : null;
      // Pondération : écart × importance
      const weightedGap = gap !== null ? gap * a.importance : null;
      const isWhiteSpace = compMax !== null && compMax <= 4 && a.importance >= 4;
      return { attr: a, compAvg, compMax, gap, weightedGap, isWhiteSpace };
    });

  const strengths = scored.filter((s) => (s.gap ?? 0) > 1).sort((a, b) => (b.weightedGap ?? 0) - (a.weightedGap ?? 0));
  const weaknesses = scored.filter((s) => (s.gap ?? 0) < -1).sort((a, b) => (a.weightedGap ?? 0) - (b.weightedGap ?? 0));
  const whiteSpaces = scored.filter((s) => s.isWhiteSpace);

  const marketPrices = i.competitorPrices.map((c) => c.price);
  const marketAvg = marketPrices.length ? safeDiv(marketPrices.reduce((s, p) => s + p, 0), marketPrices.length) : null;
  const priceGap = marketAvg !== null ? safeDiv(i.ourPrice - marketAvg, marketAvg) : null;

  // Score de valeur perçue : moyenne pondérée de nos notes sur les axes importants
  const totalImportance = scored.reduce((s, x) => s + x.attr.importance, 0);
  const valueScore = totalImportance > 0
    ? round(safeDiv(scored.reduce((s, x) => s + (x.attr.ours as number) * x.attr.importance, 0), totalImportance) * 10, 1)
    : null;
  const competitorValueScore = totalImportance > 0 && scored.some((s) => s.compAvg !== null)
    ? round(safeDiv(
        scored.reduce((s, x) => s + (x.compAvg ?? 0) * x.attr.importance, 0), totalImportance) * 10, 1)
    : null;

  // Positionnement : valeur relative vs prix relatif
  let positioning = 'Indéterminé';
  if (valueScore !== null && competitorValueScore !== null && priceGap !== null) {
    const valueGap = safeDiv(valueScore - competitorValueScore, competitorValueScore);
    if (valueGap > 0.1 && priceGap > 0.1) positioning = 'Premium assumé — valeur supérieure, prix supérieur';
    else if (valueGap > 0.1 && priceGap <= 0.1) positioning = 'Meilleur rapport valeur-prix du segment';
    else if (valueGap <= -0.1 && priceGap > 0.1) positioning = 'Position fragile — prix supérieur sans supériorité perçue';
    else if (valueGap <= -0.1 && priceGap <= -0.1) positioning = 'Entrée de gamme — à assumer ou à faire évoluer';
    else positioning = 'Aligné sur le marché — différenciation faible';
  }

  const metrics: Metric[] = [
    { key: 'value_score', label: 'Score de valeur perçue', value: valueScore ?? 0, unit: '/100',
      status: valueScore === null ? undefined : valueScore >= 70 ? 'healthy' : valueScore >= 50 ? 'warning' : 'danger' },
    { key: 'competitor_score', label: 'Score moyen des concurrents', value: competitorValueScore ?? 0, unit: '/100' },
    { key: 'strengths', label: 'Axes où vous êtes devant', value: strengths.length, unit: 'u',
      status: strengths.length >= 2 ? 'healthy' : strengths.length === 1 ? 'warning' : 'danger' },
    { key: 'weaknesses', label: 'Axes où vous êtes derrière', value: weaknesses.length, unit: 'u',
      status: weaknesses.length === 0 ? 'healthy' : weaknesses.length <= 2 ? 'warning' : 'danger' },
    { key: 'white_space', label: 'Axes importants délaissés par tous', value: whiteSpaces.length, unit: 'u',
      hint: 'Terrain libre sur un critère qui compte pour le client.' },
    { key: 'price_gap', label: 'Écart de prix au marché',
      value: priceGap !== null ? round(priceGap * 100, 1) : 0, unit: '%' },
  ];

  const findings: Finding[] = [];
  if (positioning.startsWith('Position fragile'))
    findings.push({ severity: 'critical', title: 'Prix supérieur sans supériorité perçue',
      detail: `Votre prix est ${pct(priceGap ?? 0)} au-dessus de la moyenne (${eur(i.ourPrice)} contre ${eur(marketAvg ?? 0)}) alors que votre score de valeur (${valueScore}/100) est inférieur à celui des concurrents (${competitorValueScore}/100). C’est la configuration la plus difficile à défendre commercialement.` });
  if (!strengths.length)
    findings.push({ severity: 'critical', title: 'Aucun axe de supériorité identifié',
      detail: 'Sans avantage net sur un critère qui compte, la décision d’achat se fait sur le prix. C’est le point à corriger avant toute dépense publicitaire.' });
  for (const s of strengths.slice(0, 3))
    findings.push({ severity: 'info', title: `Avantage sur « ${s.attr.label} »`,
      detail: `Vous : ${s.attr.ours}/10 contre ${round(s.compAvg ?? 0, 1)}/10 en moyenne. Importance pour le client : ${s.attr.importance}/5. Cet écart doit être visible dès la fiche produit.` });
  for (const w of weaknesses.slice(0, 3))
    findings.push({ severity: w.attr.importance >= 4 ? 'critical' : 'warning',
      title: `Retard sur « ${w.attr.label} »`,
      detail: `Vous : ${w.attr.ours}/10 contre ${round(w.compAvg ?? 0, 1)}/10. Importance ${w.attr.importance}/5.${w.attr.importance >= 4 ? ' Critère décisif : à corriger en priorité.' : ''}` });
  for (const ws of whiteSpaces.slice(0, 2))
    findings.push({ severity: 'info', title: `Terrain libre sur « ${ws.attr.label} »`,
      detail: `Aucun concurrent ne dépasse ${ws.compMax}/10 sur un critère d’importance ${ws.attr.importance}/5. C’est l’angle de différenciation le moins disputé.` });

  if (i.painThemes.length)
    findings.push({ severity: 'warning', title: 'Frictions confirmées par vos propres avis',
      detail: `${i.painThemes.slice(0, 3).map((p) => `${p.theme} (${p.count} avis)`).join(', ')}. Ces points sont déjà documentés par vos clients : les corriger est plus rentable que d’inventer un nouvel argument.` });

  const recommendations: Recommendation[] = [];
  if (strengths.length)
    recommendations.push({ priority: 1, title: `Construire le discours produit sur « ${strengths[0].attr.label} »`,
      detail: `C’est votre écart le plus fort sur un critère important. À faire apparaître dans le titre, le premier visuel et les trois premières lignes de la description — pas en bas de page.` });
  if (whiteSpaces.length)
    recommendations.push({ priority: 2, title: `Occuper le terrain libre : « ${whiteSpaces[0].attr.label} »`,
      detail: 'Personne ne s’y positionne alors que le critère compte. Un investissement modéré y crée une différence immédiatement lisible.' });
  const criticalWeakness = weaknesses.find((w) => w.attr.importance >= 4);
  if (criticalWeakness)
    recommendations.push({ priority: 1, title: `Combler le retard sur « ${criticalWeakness.attr.label} »`,
      detail: `Critère décisif où vous êtes à ${criticalWeakness.attr.ours}/10 contre ${round(criticalWeakness.compAvg ?? 0, 1)}/10. Tant que cet écart existe, la différenciation sur les autres axes ne compense pas.` });
  if (i.praiseThemes.length)
    recommendations.push({ priority: 2, title: 'Reprendre les mots de vos clients',
      detail: `Vos avis valorisent : ${i.praiseThemes.slice(0, 3).map((p) => p.theme.toLowerCase()).join(', ')}. Ce vocabulaire converti mieux qu’un argumentaire rédigé en interne.` });

  const tables: EngineTable[] = [{
    title: 'Matrice de comparaison',
    columns: [
      { key: 'axe', label: 'Critère' },
      { key: 'importance', label: 'Importance', align: 'right' },
      { key: 'nous', label: 'Nous', align: 'right' },
      { key: 'concurrents', label: 'Moyenne concurrents', align: 'right' },
      { key: 'ecart', label: 'Écart', align: 'right' },
      { key: 'lecture', label: 'Lecture' },
    ],
    rows: scored.map((s) => ({
      axe: s.attr.label,
      importance: `${s.attr.importance}/5`,
      nous: `${s.attr.ours}/10`,
      concurrents: s.compAvg !== null ? `${round(s.compAvg, 1)}/10` : '—',
      ecart: s.gap !== null ? `${s.gap >= 0 ? '+' : ''}${round(s.gap, 1)}` : '—',
      lecture: s.isWhiteSpace ? 'terrain libre'
             : (s.gap ?? 0) > 1 ? 'avantage'
             : (s.gap ?? 0) < -1 ? 'retard'
             : 'à parité',
    })),
    note: 'Notes de 0 à 10 saisies par vous. Le moteur ne les devine pas : il calcule les écarts, les pondère par l’importance client et en déduit le positionnement.',
  }];

  if (i.competitorPrices.length)
    tables.push({
      title: 'Prix du segment',
      columns: [{ key: 'acteur', label: 'Acteur' }, { key: 'prix', label: 'Prix', align: 'right' },
                { key: 'ecart', label: 'Écart vs nous', align: 'right' }],
      rows: [
        { acteur: `${i.productName} (nous)`, prix: eur(i.ourPrice), ecart: '—' },
        ...i.competitorPrices.map((c) => ({
          acteur: c.name, prix: eur(c.price),
          ecart: `${c.price >= i.ourPrice ? '+' : ''}${pct(safeDiv(c.price - i.ourPrice, i.ourPrice))}`,
        })),
      ],
    });

  const dataGaps: string[] = [];
  const missing = i.attributes.filter((a) => a.ours === null);
  if (missing.length) dataGaps.push(`${missing.length} critère(s) non noté(s) : ${missing.map((a) => a.label).join(', ')}.`);
  if (!i.competitorPrices.length) dataGaps.push('Aucun prix concurrent renseigné : le positionnement prix n’est pas calculé.');
  if (!i.painThemes.length && !i.praiseThemes.length)
    dataGaps.push('Aucun thème issu des avis : lancer d’abord l’analyse des avis pour croiser la différenciation perçue avec la réalité vécue par vos clients.');

  return {
    engineKey: 'differentiation',
    title: `Différenciation — ${i.productName}`,
    summary: `${positioning}. ${strengths.length} avantage(s), ${weaknesses.length} retard(s), ${whiteSpaces.length} terrain(s) libre(s).`,
    status: positioning.startsWith('Position fragile') || !strengths.length ? 'danger'
          : weaknesses.some((w) => w.attr.importance >= 4) ? 'warning' : 'healthy',
    metrics, findings, recommendations, tables,
    raw: { positioning, valueScore, competitorValueScore, priceGap,
           strengths: strengths.map((s) => s.attr.label),
           weaknesses: weaknesses.map((s) => s.attr.label),
           whiteSpaces: whiteSpaces.map((s) => s.attr.label) },
    dataGaps,
  };
}
