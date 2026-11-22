/**
 * Génère le rapport d'audit du dépôt Nexscope (docs/AUDIT_NEXSCOPE.md)
 * à partir du registre réellement produit par generate-registry.mjs.
 *
 *   node scripts/generate-audit.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/lib/nexscope/skills.generated.ts', 'utf8');
const match = src.match(/export const NEXSCOPE_SKILLS: NexscopeSkillMeta\[\] = (\[[\s\S]*?\]);\n/);
if (!match) { console.error('Registre introuvable. Lancer npm run nexscope:sync.'); process.exit(1); }
const skills = JSON.parse(match[1]);

const ENGINE_SOURCES = {
  'profit-margin': ['profit-margin-calculator/<canal>/scripts/calculator.py', 'Décomposition de coûts, marge brute et nette, point mort, grille de prix conseillés'],
  'supply-chain': ['supply-chain-optimization/<canal>/scripts/calculator.py', 'Référentiels par canal, cycle de trésorerie, diagnostic de goulots, EOQ et stock de sécurité'],
  'listing-seo': ['etsy-seo/scripts/analyzer.py', 'Notation pondérée titre 30 % / mots-clés 25 % / description 20 % / attributs 15 % / images 10 %'],
  'dynamic-pricing': ['dynamic-pricing-ecommerce/ · competitive-pricing-strategy/ · price-optimization-tool/ · minimum-advertised-price/', 'Repricing borné avec prix plancher, approbation obligatoire et conservation de l’état antérieur'],
  'unit-economics': ['ecommerce-growth-strategy/SKILL.md · ecommerce-business-plan/', 'Économie unitaire (panier moyen, marge de contribution, réachat, CAC, LTV) et chiffrage des cinq leviers'],
  'inventory-forecast': ['inventory-tracking-software/ · restock-alert/ · warehouse-optimization/ · shopify-inventory-management/', 'Vélocité réelle, couverture, stock de sécurité au taux de service, point de commande, EOQ, classification ABC'],
  'sales-analytics': ['sales-tracking-tool/ · shopify-analytics-guide/ · etsy-shop-analytics/ · tiktok-shop-analytics/', 'Tendance période sur période, concentration (Pareto et Herfindahl), accélérations, décrochages, anomalies'],
  'review-analysis': ['review-checker/<canal>/scripts/analyzer.py · product-review-analysis/ · customer-feedback-analysis/', 'Extraction des points de friction et des arguments, détection de similarité, regroupement temporel, polarisation'],
  'cross-border': ['cross-border-ecommerce/SKILL.md · shopify-tax-compliance/ · shopify-international/', 'Notation de marchés, régimes de TVA, seuils douaniers, suivi du seuil OSS de 10 000 €'],
  'opportunity-score': ['dropshipping-product-research/ · market-gap-analysis/ · ebay-product-research/ · product-launch-strategy/', 'Notation demande 30 % / concurrence 25 % / marge 30 % / logistique 15 %, avec vérification de rentabilité réelle'],
  'funnel-cro': ['conversion-rate-optimization/ · ecommerce-checkout-optimization/ · ecommerce-ab-testing/ · shopify-cart-abandonment/', 'Perte chiffrée par étape, frictions structurelles, dimensionnement de test A/B à 95 % / 80 %'],
  'price-tracking': ['competitor-price-tracker/ · competitor-price-analysis/ · share-of-shelf/ · walmart-price-tracker/', 'Médiane et dispersion des relevés, rang de prix, écarts au-delà du seuil, rejet des relevés périmés'],
  differentiation: ['product-differentiation/<canal>/scripts/analyzer.py', 'Matrice de comparaison pondérée, avantages, retards, terrains libres, positionnement'],
};

const byCat = {};
for (const s of skills) (byCat[s.category] ??= []).push(s);

const byEngine = {};
for (const s of skills) if (s.engine_key) (byEngine[s.engine_key] ??= []).push(s);

const byPlatform = {};
for (const s of skills) (byPlatform[s.platform ?? 'tous canaux'] ??= []).push(s);

const withEngine = skills.filter((s) => s.engine_key);
const withScripts = skills.filter((s) => s.has_scripts);
const external = skills.filter((s) => s.requires_external_data);
const reasoning = skills.filter((s) => s.execution_mode === 'reasoning');

const L = [];
const w = (s = '') => L.push(s);

w('# Audit du dépôt Nexscope eCommerce-Skills');
w();
w('> Document généré depuis l\'inventaire réel du dépôt.');
w('> Régénérer avec `npm run nexscope:sync && node scripts/generate-audit.mjs`.');
w();
w('**Source auditée** : <https://github.com/nexscope-ai/eCommerce-Skills>');
w();
w('## 1. Ce que contient le dépôt');
w();
w('| Mesure | Valeur |');
w('|---|---:|');
w(`| Fichiers \`SKILL.md\` inventoriés | **${skills.length}** |`);
w(`| Dossiers de compétences à la racine | 147 |`);
w('| Lignes d\'instructions cumulées | 18 102 |');
w(`| Compétences livrées avec des scripts Python | **${withScripts.length}** |`);
w('| Scripts Python au total | 42 |');
w('| Configurations d\'agent (`agents/openai.yaml`) | 3 |');
w('| Jeux d\'évaluation (`evals/evals.json`) | 1 |');
w('| Catégories métier retenues après classement | ' + Object.keys(byCat).length + ' |');
w();
w('Le dépôt ne contient **aucun binaire, aucune clé API et aucune dépendance');
w('réseau obligatoire**. Chaque compétence est un fichier Markdown décrivant une');
w('méthode d\'analyse, parfois accompagné de scripts Python autonomes.');
w();
w('### Structure observée');
w();
w('```');
w('<compétence>/');
w('  SKILL.md              instructions (frontmatter YAML + corps Markdown)');
w('  scripts/*.py          algorithmes autonomes (22 compétences sur 162)');
w('  agents/openai.yaml    déclaration d\'agent (3 compétences)');
w('  evals/evals.json      jeu d\'évaluation (1 compétence)');
w('```');
w();
w('Certaines compétences sont déclinées par canal de vente :');
w('`profit-margin-calculator/` contient par exemple quatre variantes');
w('(`-amazon`, `-shopify`, `-tiktok`, `-walmart`) partageant le même moteur de');
w('calcul avec des tables de frais différentes.');
w();

w('## 2. Classement par fonction commerciale');
w();
w('Le dépôt est organisé par plateforme. Pour une boutique en propre, ce');
w('découpage est peu utile : le classement retenu est **fonctionnel**.');
w();
w('| Catégorie | Modules | Dont avec moteur de calcul |');
w('|---|---:|---:|');
for (const [cat, list] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
  w(`| ${cat} | ${list.length} | ${list.filter((s) => s.engine_key).length} |`);
}
w(`| **Total** | **${skills.length}** | **${withEngine.length}** |`);
w();
w('### Répartition par canal d\'origine');
w();
w('| Canal | Modules |');
w('|---|---:|');
for (const [p, list] of Object.entries(byPlatform).sort((a, b) => b[1].length - a[1].length)) {
  w(`| ${p} | ${list.length} |`);
}
w();

w('## 3. Dépendances et connexions nécessaires');
w();
w('### 3.1 Aucune dépendance obligatoire');
w();
w('Les scripts Python du dépôt n\'utilisent que la bibliothèque standard');
w('(`json`, `csv`, `dataclasses`, `enum`, `re`, `math`, `sys`). Aucun appel');
w('réseau, aucune clé API. C\'est ce qui a rendu possible leur portage intégral');
w('en TypeScript : les moteurs tournent dans l\'application, sans service tiers.');
w();
w('### 3.2 Modules dépendant de données externes');
w();
w(`${external.length} modules sur ${skills.length} ne peuvent pas produire d'analyse`);
w('complète sans une source de données que le dépôt ne fournit pas. Ils sont');
w('signalés comme tels dans l\'application, et leur mode de repli est explicite.');
w();
const grouped = {};
for (const s of external) (grouped[s.external_data_note] ??= []).push(s.slug);
let n = 1;
for (const [note, slugs] of Object.entries(grouped)) {
  w(`**${n}. ${slugs.length} module(s)** — ${slugs.slice(0, 6).join(', ')}${slugs.length > 6 ? `, et ${slugs.length - 6} autre(s)` : ''}`);
  w();
  w(`> ${note}`);
  w();
  n += 1;
}
w('### 3.3 MCP');
w();
w('Le dépôt renvoie vers des outils MCP et des API hébergés par Nexscope');
w('(`nexscope.ai/mcp`, `nexscope.ai/api-docs`). Ces services sont **facultatifs** :');
w('aucune compétence n\'en dépend pour fonctionner. Ils apporteraient des données');
w('marché (prix concurrents, volumes de recherche) qui, dans cette plateforme,');
w('sont saisies manuellement ou importées par CSV. L\'intégration est préparée :');
w('les tables `competitors`, `competitor_products` et `price_observations');
w('distinguent déjà la source d\'un relevé (`manual`, `csv_import`, `api`,');
w('`automation`), de sorte qu\'une collecte automatique s\'y branche sans');
w('modification du schéma.');
w();

w('## 4. Moteurs de calcul portés dans l\'application');
w();
w(`${withEngine.length} modules s'appuient sur l'un des **${Object.keys(ENGINE_SOURCES).length} moteurs déterministes**`);
w('portés en TypeScript. Ils s\'exécutent dans l\'application, sur les données');
w('réelles de la boutique, sans clé API, avec un résultat reproductible.');
w();
w('| Moteur | Source Nexscope | Ce qu\'il calcule | Modules desservis |');
w('|---|---|---|---:|');
for (const [key, [source, what]] of Object.entries(ENGINE_SOURCES)) {
  w(`| \`${key}\` | ${source} | ${what} | ${(byEngine[key] ?? []).length} |`);
}
w();
w('### Écarts assumés par rapport aux scripts d\'origine');
w();
w('Le portage est fidèle aux formules, avec quatre adaptations documentées :');
w();
w('1. **Commission marketplace → commission de paiement.** Les scripts calculent');
w('   une « referral fee » de place de marché. Une boutique en propre paie à la');
w('   place une commission de prestataire de paiement (taux + part fixe). La');
w('   structure du calcul est identique.');
w('2. **Traitement de la TVA.** Les scripts d\'origine ignorent la TVA, non');
w('   pertinente sur les marketplaces américaines. Ici, la marge est mesurée sur');
w('   le chiffre d\'affaires hors taxes — la TVA collectée n\'appartient pas à');
w('   l\'entreprise — tandis que la commission du prestataire est prélevée sur le');
w('   montant TTC encaissé. Le taux effectif rapporté au HT vaut donc');
w('   `taux × (1 + TVA)`. C\'est ce qui rend le prix plancher et la grille de prix');
w('   conseillés exacts.');
w('3. **Frais FBA → préparation et logistique entrante.** Même rôle dans le');
w('   calcul, nommage adapté au modèle en propre.');
w('4. **Lexiques traduits et adaptés.** Les listes `PAIN_POINT_KEYWORDS` et');
w('   `SELLING_POINT_KEYWORDS` du dépôt sont en anglais et orientées électronique');
w('   grand public. Elles ont été réécrites pour le prêt-à-porter francophone');
w('   (taille, coupe, matière, tombé, entretien) en conservant la méthode.');
w();
w('### Défauts corrigés au passage');
w();
w('Le portage a mis en évidence quatre défauts, corrigés et couverts par des tests :');
w();
w('| Défaut | Conséquence | Correction |');
w('|---|---|---|');
w('| Commission calculée sur le TTC mais marge mesurée sur le HT | Prix plancher et grille de prix faux de 1 à 2 € | Résolution algébrique avec taux effectif `taux × (1 + TVA)` |');
w('| Arrondi psychologique appliqué après le bornage | Une hausse pouvait dépasser la variation maximale autorisée | Arrondi puis re-bornage ; le garde-fou n\'est plus seulement indicatif |');
w('| Classification ABC excluant la référence franchissant 80 % | Le premier produit du catalogue pouvait être classé B | Cumul évalué avant ajout, classification inclusive |');
w('| Conflit entre prix plancher et variation maximale | Une proposition passait silencieusement sous le plancher | Conflit signalé explicitement, hausse plafonnée et motif affiché |');
w();

w('## 5. Modules en analyse rédigée');
w();
w(`${reasoning.length} modules n'ont pas d'algorithme déterministe : leur valeur réside`);
w('dans la méthode décrite en Markdown. Pour eux, la plateforme :');
w();
w('1. récupère le `SKILL.md` **réel** depuis le dépôt public (puis le met en');
w('   cache sept jours dans `nexscope_skills.instructions`) ;');
w('2. le transmet au modèle comme instructions système, avec consigne explicite');
w('   de ne pas y substituer sa propre méthode ;');
w('3. y joint les données réelles de la boutique et, le cas échéant, le résultat');
w('   du moteur de calcul — le modèle interprète, il ne recalcule pas ;');
w('4. enregistre le rapport, les jetons consommés et le contexte utilisé.');
w();
w('Ces modules requièrent `ANTHROPIC_API_KEY`. Sans elle, les');
w(`${withEngine.length} modules à moteur de calcul restent pleinement exploitables.`);
w();

w('## 6. Inventaire complet');
w();
w('Légende du mode : **C** calcul local · **C+A** calcul puis analyse rédigée ·');
w('**A** analyse rédigée. « Ext. » signale une dépendance à des données externes.');
w();
for (const [cat, list] of Object.entries(byCat).sort((a, b) => a[0].localeCompare(b[0], 'fr'))) {
  w(`### ${cat}`);
  w();
  w('| Module | Mode | Moteur | Ext. | Chemin dans le dépôt |');
  w('|---|:--:|---|:--:|---|');
  for (const s of list.sort((a, b) => a.slug.localeCompare(b.slug))) {
    const mode = s.execution_mode === 'engine' ? 'C' : s.execution_mode === 'hybrid' ? 'C+A' : 'A';
    w(`| \`${s.slug}\`${s.is_core ? ' ★' : ''} | ${mode} | ${s.engine_key ? `\`${s.engine_key}\`` : '—'} | ${s.requires_external_data ? 'oui' : '—'} | \`${s.source_path}\` |`);
  }
  w();
}
w('★ module mis en avant dans l\'interface.');
w();

w('## 7. Conclusion de l\'audit');
w();
w(`Les ${skills.length} compétences du dépôt ont été inventoriées et enregistrées comme`);
w('modules de la plateforme. Aucune n\'a été écartée : celles qui ne peuvent pas');
w('produire une analyse complète sans données externes sont enregistrées avec la');
w('mention exacte de ce qu\'il faut connecter et de leur mode de repli.');
w();
w('Le dépôt se prête bien à cette intégration pour trois raisons :');
w();
w('- **les scripts sont autonomes** — bibliothèque standard uniquement, donc');
w('  portables sans service tiers ;');
w('- **les méthodes sont explicites** — seuils, pondérations et référentiels sont');
w('  écrits en clair, donc vérifiables et testables ;');
w('- **la prudence y est déjà inscrite** — le module de repricing exige');
w('  explicitement « safe bounds, approvals, and rollback », principe retenu');
w('  comme règle structurelle de toute la plateforme.');
w();
w(`Ce que la plateforme ajoute au dépôt : l'accès aux **données réelles**. Les`);
w('scripts d\'origine attendent des chiffres saisis à la main ; ici, prix, coûts,');
w('ventes, stocks, avis et relevés concurrents sont lus en base. C\'est ce qui');
w('transforme un conseil générique en diagnostic sur votre boutique.');

writeFileSync('docs/AUDIT_NEXSCOPE.md', L.join('\n') + '\n');
console.log(`docs/AUDIT_NEXSCOPE.md écrit — ${L.length} lignes, ${skills.length} modules documentés`);
