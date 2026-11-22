/**
 * Génère le registre Nexscope (SQL de seed + module TypeScript) à partir de
 * l'audit réel du dépôt nexscope-ai/eCommerce-Skills.
 *
 *   node scripts/generate-registry.mjs <chemin-du-depot-clone>
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT || !existsSync(ROOT)) {
  console.error('Usage: node scripts/generate-registry.mjs <chemin-du-depot-eCommerce-Skills>');
  process.exit(1);
}

/* ─────────────────── 1. Lecture réelle des SKILL.md ─────────────────── */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (entry === 'SKILL.md') acc.push(p);
  }
  return acc;
}

/**
 * Le dépôt mélange TROIS formats de métadonnées. L'audit local de la base a
 * révélé que n'en lire qu'un laissait 42 modules sur 162 sans description.
 *
 *  1. frontmatter plat          name / description / metadata.nexscope.{emoji,category}
 *                               → 120 fichiers
 *  2. frontmatter imbriqué      nexscope: { name, category, tags, keywords… }
 *                               sans description : elle est dans le corps
 *                               → 16 fichiers
 *  3. aucun frontmatter         titre H1 + premier paragraphe
 *                               → 26 fichiers
 *
 * Les trois sont lus ici, pour qu'aucun module ne soit enregistré incomplet.
 */
function parseSkill(text, dirName) {
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
  const body = fmMatch ? text.slice(fmMatch[0].length) : text;

  const out = { name: '', description: '', category: '', emoji: '', format: '' };

  if (fmMatch) {
    const fm = fmMatch[1];

    /* Valeur d'une clé, y compris sur plusieurs lignes et en bloc replié. */
    const scalar = (key) => {
      const re = new RegExp(`^(\\s*)${key}:\\s*(.*)$`, 'm');
      const m = fm.match(re);
      if (!m) return '';
      const indent = m[1].length;
      let value = m[2].trim();

      // Bloc replié ou littéral : on agrège les lignes plus indentées.
      if (value === '>' || value === '|' || value === '>-' || value === '|-') {
        const lines = fm.slice(m.index + m[0].length).split('\n');
        const collected = [];
        for (const line of lines) {
          if (line.trim() === '') { collected.push(''); continue; }
          const lineIndent = line.length - line.trimStart().length;
          if (lineIndent <= indent) break;
          collected.push(line.trim());
        }
        return collected.join(' ').replace(/\s+/g, ' ').trim();
      }

      // Chaîne entre guillemets pouvant se poursuivre sur les lignes suivantes.
      const quote = value[0] === '"' ? '"' : value[0] === "'" ? "'" : null;
      if (quote) {
        if (value.length > 1 && value.endsWith(quote)) return value.slice(1, -1);
        const lines = fm.slice(m.index + m[0].length).split('\n');
        let acc = value.slice(1);
        for (const line of lines) {
          const trimmed = line.trim();
          acc += ` ${trimmed}`;
          if (trimmed.endsWith(quote)) { acc = acc.slice(0, -1); break; }
        }
        return acc.replace(/\s+/g, ' ').trim();
      }

      return value;
    };

    out.name = scalar('name');
    out.description = scalar('description');
    out.category = scalar('category');
    out.emoji = scalar('emoji');
    out.format = /^\s*nexscope:\s*$/m.test(fm) && !/^name:/m.test(fm)
      ? 'frontmatter-imbrique' : 'frontmatter-plat';
  } else {
    out.format = 'corps-markdown';
  }

  /* Repli sur le corps du document pour ce qui manque encore. */
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) {
    const title = heading[1].trim();
    // Un emoji en fin de titre est l'usage du dépôt : « Titre 🚀 »
    const emojiMatch = title.match(/\s([\p{Extended_Pictographic}]+)\s*$/u);
    if (!out.emoji && emojiMatch) out.emoji = emojiMatch[1];
    if (!out.name) out.name = title.replace(/\s[\p{Extended_Pictographic}]+\s*$/u, '').trim();
  }

  if (!out.description && heading) {
    // Premier paragraphe de texte après le titre : c'est la description
    // rédigée par les auteurs, préférable à une reformulation.
    for (const block of body.slice(heading.index + heading[0].length).split(/\n\s*\n/)) {
      const b = block.trim();
      if (!b || b.startsWith('#') || b.startsWith('![') || b.startsWith('```')
          || b.startsWith('|') || b.startsWith('-') || b.startsWith('>')) continue;
      out.description = b.replace(/\s+/g, ' ').trim();
      break;
    }
  }

  if (!out.name) out.name = dirName;
  if (!out.description) {
    out.description = `Compétence « ${out.name} » du dépôt Nexscope. `
      + `Aucune description n'est fournie dans le fichier source : se reporter au SKILL.md.`;
  }

  return out;
}

function hasScripts(dir) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (e.endsWith('.py')) return true;
    }
  }
  return false;
}

/* ───────────── 2. Classement fonctionnel (métier, pas plateforme) ───── */
const CATEGORY_RULES = [
  [/product-research|dropshipping-product-research|trending-products|market-gap|product-launch|product-differentiation/, 'Recherche produit & Opportunités'],
  [/competitor|share-of-shelf|competitive-pricing/, 'Veille concurrentielle'],
  [/pric|profit-margin|minimum-advertised|dynamic-pricing|price-optimization|price-tracker/, 'Prix & Rentabilité'],
  [/seo|keyword|title-optimization|listing-optimization|feed-management|google-shopping/, 'SEO & Visibilité'],
  [/description|content-marketing|photography|video|blog|landing-page|shoppable/, 'Contenu & Fiches produits'],
  [/advertising|ppc|ads|marketing-strategy|social-media-marketing|affiliate|influencer|creator/, 'Marketing & Acquisition'],
  [/email|cart-abandonment|retention|loyalty|personalization|subscription|customer-service|returns|feedback/, 'Fidélisation & Relation client'],
  [/conversion|checkout|ab-testing|page-speed|speed-optimization|theme-optimization|upsell/, 'Conversion & Expérience'],
  [/inventory|restock|warehouse|supply-chain|fulfillment|shipping/, 'Stocks & Logistique'],
  [/cross-border|international|localization|tax-compliance|compliance/, 'International & Conformité'],
  [/brand|reputation|review/, 'Marque & Réputation'],
  [/analytics|sales-tracking|business-plan|growth-strategy/, 'Analytique & Pilotage'],
  [/monitoring|status-page|file-integrity|api-monitoring|domain-monitoring|visual-regression|synthetic/, 'Surveillance & Fiabilité'],
  [/shop-setup|seller-guide|seller-tools|migration|multichannel|omnichannel|app-recommendations|wholesale|multi-shop|star-seller|custom-orders|digital-products|print-on-demand|seasonal|offsite|google-channel|facebook-instagram|live-selling|promotions|branding/, 'Canaux & Marketplaces'],
];

function classify(slug, desc) {
  const hay = `${slug} ${desc}`.toLowerCase();
  for (const [re, cat] of CATEGORY_RULES) if (re.test(hay)) return cat;
  return 'Canaux & Marketplaces';
}

function platformOf(slug) {
  for (const p of ['shopify', 'amazon', 'walmart', 'etsy', 'ebay', 'woocommerce'])
    if (slug.includes(p)) return p;
  if (slug.includes('tiktok')) return 'tiktok-shop';
  return null;
}

/* ───── 3. Modules dotés d'un moteur déterministe (portage TypeScript) ── */
//  Chaque entrée = un algorithme réellement exécuté dans l'application.
const ENGINE_MAP = [
  [/^profit-margin-calculator/, 'profit-margin', 'hybrid'],
  [/^supply-chain-optimization|^warehouse-optimization/, 'supply-chain', 'hybrid'],
  [/^product-differentiation/, 'differentiation', 'hybrid'],
  [/review-checker$|^product-review-analysis|^review-monitoring|^customer-feedback-analysis/, 'review-analysis', 'hybrid'],
  [/^dynamic-pricing-ecommerce|^price-optimization-tool|^competitive-pricing-strategy|^minimum-advertised-price/, 'dynamic-pricing', 'hybrid'],
  [/seo$|^product-page-seo|^etsy-seo-tags|^product-title-optimization|^walmart-listing-optimization|^tiktok-shop-listing-optimization/, 'listing-seo', 'hybrid'],
  [/^ecommerce-growth-strategy|^ecommerce-business-plan/, 'unit-economics', 'hybrid'],
  [/^inventory-tracking-software|^restock-alert|inventory-management$|^tiktok-shop-inventory/, 'inventory-forecast', 'hybrid'],
  [/^sales-tracking-tool|analytics-guide$|shop-analytics$|^tiktok-shop-analytics/, 'sales-analytics', 'hybrid'],
  [/^cross-border-ecommerce|^tiktok-shop-cross-border|^shopify-international/, 'cross-border', 'hybrid'],
  [/^dropshipping-product-research|^ebay-product-research|^tiktok-shop-product-research|^market-gap-analysis|trending-products$/, 'opportunity-score', 'hybrid'],
  [/^conversion-rate-optimization|^ecommerce-checkout-optimization|conversion-optimization$|^shopify-cart-abandonment|^tiktok-shop-conversion|^ecommerce-ab-testing|^shopify-ab-testing/, 'funnel-cro', 'hybrid'],
  [/^competitor-price-tracker|^competitor-price-analysis|^walmart-price-tracker/, 'price-tracking', 'hybrid'],
];

function engineOf(slug) {
  for (const [re, key, mode] of ENGINE_MAP) if (re.test(slug)) return { engine_key: key, execution_mode: mode };
  return { engine_key: null, execution_mode: 'reasoning' };
}

/* ─── 4. Modules dépendant de données externes (à connecter explicitement) ─ */
const EXTERNAL_RULES = [
  [/price-tracker|price-analysis|share-of-shelf/, "Relevés de prix concurrents : saisie manuelle et import CSV disponibles sans clé. Pour une collecte automatique, connecter une source de données marché (API Nexscope ou équivalent)."],
  [/^brand-monitoring|^online-reputation|^domain-monitoring|^social-media-monitor|^brand-protection/, "Surveillance web : nécessite une source de veille (API de recherche ou flux). Sans clé, les mentions sont saisies ou importées manuellement."],
  [/^api-monitoring|^synthetic-monitoring|^public-status-page|^file-integrity|^visual-regression|^localization-testing/, "Supervision technique : nécessite un service de monitoring externe. Module fourni comme cadre d'analyse et de configuration."],
  [/keyword-research|trending-products/, "Volumes de recherche et tendances : connecter une source de données mots-clés pour des chiffres réels. Sans clé, le module travaille sur vos propres données de recherche interne."],
  [/advertising|^ecommerce-ppc|ads$|offsite-ads/, "Données de campagnes : connecter la régie concernée (Google Ads, Meta, TikTok Ads) pour importer les performances réelles. Sans connexion, saisie manuelle des indicateurs."],
  [/review-checker|review-monitoring|product-review-analysis/, "Avis externes : les avis de votre boutique sont analysés nativement. Pour les avis d'une marketplace, importer un export CSV."],
];

function externalOf(slug) {
  for (const [re, note] of EXTERNAL_RULES) if (re.test(slug)) return note;
  return null;
}

/* ──────────────── 5. Modules mis en avant (cœur du produit) ────────── */
const CORE = new Set([
  'profit-margin-calculator-shopify', 'dynamic-pricing-ecommerce', 'competitor-price-tracker',
  'ecommerce-competitor-analysis', 'dropshipping-product-research', 'ecommerce-growth-strategy',
  'ecommerce-marketing-strategy-builder', 'shopify-seo', 'product-description-generator',
  'ecommerce-ppc-strategy-planner', 'ecommerce-email-marketing-builder', 'influencer-outreach',
  'ecommerce-customer-retention', 'conversion-rate-optimization', 'sales-tracking-tool',
  'inventory-tracking-software', 'supply-chain-optimization-shopify', 'cross-border-ecommerce',
  'brand-monitoring', 'review-monitoring',
]);

/* ──────────────────────────── Construction ─────────────────────────── */
const files = walk(ROOT).sort();
const formats = {};
const skills = files.map((file) => {
  const text = readFileSync(file, 'utf8');
  const dir = file.replace(/\/SKILL\.md$/, '');
  const dirName = basename(dir);
  const parsed = parseSkill(text, dirName);
  formats[parsed.format] = (formats[parsed.format] ?? 0) + 1;
  // Le slug reste le nom du dossier : c'est l'identifiant stable du dépôt.
  const slug = dirName;
  const desc = parsed.description;
  const { engine_key, execution_mode } = engineOf(slug);
  const external = externalOf(slug);
  return {
    slug,
    name: parsed.name,
    category: classify(slug, desc),
    platform: platformOf(slug),
    emoji: parsed.emoji || null,
    description: desc,
    source_path: relative(ROOT, dir),
    execution_mode,
    engine_key,
    has_scripts: hasScripts(dir),
    requires_external_data: Boolean(external),
    external_data_note: external,
    is_core: CORE.has(slug),
    lines: text.split('\n').length,
  };
});

const bySlug = new Map();
for (const s of skills) if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
const unique = [...bySlug.values()];

/* Position : les modules cœur d'abord, puis engines, puis le reste */
unique.sort((a, b) =>
  Number(b.is_core) - Number(a.is_core) ||
  Number(Boolean(b.engine_key)) - Number(Boolean(a.engine_key)) ||
  a.category.localeCompare(b.category, 'fr') ||
  a.slug.localeCompare(b.slug));
unique.forEach((s, i) => { s.position = i + 1; });

/* ───────────────────────── Sortie SQL de seed ──────────────────────── */
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const rows = unique.map((s) =>
  `  (${q(s.slug)}, ${q(s.name)}, ${q(s.category)}, ${q(s.platform)}, ${q(s.emoji)}, ${q(s.description)}, ` +
  `${q(s.source_path)}, ${q(s.execution_mode)}, ${q(s.engine_key)}, ${s.has_scripts}, ` +
  `${s.requires_external_data}, ${q(s.external_data_note)}, ${s.is_core}, ${s.position})`);

const sql = `-- ============================================================================
-- 0009 — Seed du registre Nexscope
--
--  GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
--  Source : https://github.com/nexscope-ai/eCommerce-Skills
--  Commande : npm run nexscope:sync
--  ${unique.length} modules issus de l'audit du dépôt.
-- ============================================================================

insert into public.nexscope_skills
  (slug, name, category, platform, emoji, description, source_path,
   execution_mode, engine_key, has_scripts, requires_external_data,
   external_data_note, is_core, position)
values
${rows.join(',\n')}
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  platform = excluded.platform,
  emoji = excluded.emoji,
  description = excluded.description,
  source_path = excluded.source_path,
  execution_mode = excluded.execution_mode,
  engine_key = excluded.engine_key,
  has_scripts = excluded.has_scripts,
  requires_external_data = excluded.requires_external_data,
  external_data_note = excluded.external_data_note,
  is_core = excluded.is_core,
  position = excluded.position,
  updated_at = now();
`;
writeFileSync(join(process.cwd(), 'supabase/migrations/20260101000900_nexscope_registry_seed.sql'), sql);

/* ────────────────── Sortie TypeScript (registre client) ────────────── */
const ts = `/**
 * Registre des modules Nexscope — GÉNÉRÉ AUTOMATIQUEMENT.
 * Source : https://github.com/nexscope-ai/eCommerce-Skills
 * Régénérer avec : npm run nexscope:sync
 *
 * ${unique.length} modules · ${unique.filter((s) => s.engine_key).length} dotés d'un moteur de calcul déterministe
 */
import type { NexscopeSkillMeta } from './types';

export const NEXSCOPE_SOURCE_REPO = 'https://github.com/nexscope-ai/eCommerce-Skills';
export const NEXSCOPE_SKILL_COUNT = ${unique.length};

export const NEXSCOPE_SKILLS: NexscopeSkillMeta[] = ${JSON.stringify(
  unique.map(({ lines, ...s }) => s), null, 2)};

export const NEXSCOPE_CATEGORIES = ${JSON.stringify(
  [...new Set(unique.map((s) => s.category))].sort((a, b) => a.localeCompare(b, 'fr')), null, 2)};
`;
writeFileSync(join(process.cwd(), 'src/lib/nexscope/skills.generated.ts'), ts);

/* ─────────────────────────── Rapport console ───────────────────────── */
const byCat = {};
for (const s of unique) (byCat[s.category] ??= []).push(s);
console.log(`SKILL.md trouvés        : ${files.length}`);
console.log(`Modules uniques         : ${unique.length}`);
console.log(`Avec moteur déterministe: ${unique.filter((s) => s.engine_key).length}`);
console.log(`Scripts Python d'origine: ${unique.filter((s) => s.has_scripts).length}`);
console.log(`Données externes requises: ${unique.filter((s) => s.requires_external_data).length}`);
const missing = unique.filter((s) => !s.description || !s.description.trim());
console.log(`Sans description        : ${missing.length}${missing.length ? ` → ${missing.map((s) => s.slug).join(', ')}` : ' (aucun)'}`);
console.log('\nFormats de métadonnées rencontrés :');
for (const [f, n] of Object.entries(formats)) console.log(`  ${String(n).padStart(3)}  ${f}`);
console.log('\nPar catégorie :');
for (const [c, list] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${String(list.length).padStart(3)}  ${c}`);
