/**
 * Edge Function — analyse rédigée d'un module Nexscope.
 *
 * Principe de l'intégration : les INSTRUCTIONS RÉELLES du SKILL.md publié
 * dans nexscope-ai/eCommerce-Skills sont récupérées depuis le dépôt (puis
 * mises en cache en base), et transmises au modèle comme instructions
 * système, accompagnées des données réelles de la boutique.
 *
 * Le modèle ne fabrique donc pas une méthode : il applique celle du dépôt
 * aux chiffres de la boutique. Les chiffres, eux, viennent des moteurs de
 * calcul déterministes exécutés côté application.
 */
import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { requireStaff, serviceClient } from '../_shared/supabase.ts';

const SKILL_RAW_BASE =
  'https://raw.githubusercontent.com/nexscope-ai/eCommerce-Skills/main';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Durée de validité du cache des instructions (7 jours). */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Payload {
  skillSlug: string;
  productId?: string | null;
  variantId?: string | null;
  windowDays?: number;
  engineOutput?: Record<string, unknown> | null;
  engineInput?: unknown;
  extraContext?: string | null;
}

/** Récupère les instructions du module, depuis le cache ou depuis le dépôt. */
async function loadInstructions(
  db: ReturnType<typeof serviceClient>, slug: string,
): Promise<{ instructions: string; sourcePath: string; fromCache: boolean }> {
  const { data: skill } = await db
    .from('nexscope_skills')
    .select('slug, source_path, instructions, instructions_fetched_at')
    .eq('slug', slug).maybeSingle();

  if (!skill) throw new Error(`Module inconnu : ${slug}`);

  const fresh = skill.instructions && skill.instructions_fetched_at &&
    Date.now() - new Date(skill.instructions_fetched_at).getTime() < CACHE_TTL_MS;

  if (fresh) {
    return { instructions: skill.instructions!, sourcePath: skill.source_path, fromCache: true };
  }

  const url = `${SKILL_RAW_BASE}/${skill.source_path}/SKILL.md`;
  const response = await fetch(url, { headers: { Accept: 'text/plain' } });

  if (!response.ok) {
    // Le dépôt est injoignable : on se rabat sur le cache même périmé.
    if (skill.instructions) {
      return { instructions: skill.instructions, sourcePath: skill.source_path, fromCache: true };
    }
    throw new Error(
      `Les instructions du module n'ont pu être récupérées (${response.status}). ` +
      `Vérifiez que l'environnement autorise l'accès à raw.githubusercontent.com.`,
    );
  }

  const text = await response.text();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const sha = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  await db.from('nexscope_skills').update({
    instructions: text,
    instructions_sha: sha,
    instructions_fetched_at: new Date().toISOString(),
  }).eq('slug', slug);

  return { instructions: text, sourcePath: skill.source_path, fromCache: false };
}

/** Rassemble les données réelles de la boutique à transmettre au modèle. */
async function buildStoreContext(
  db: ReturnType<typeof serviceClient>, payload: Payload,
): Promise<Record<string, unknown>> {
  const windowDays = payload.windowDays ?? 90;

  const [settings, economics, topProducts, inventory, margins] = await Promise.all([
    db.from('shop_settings').select('*').maybeSingle(),
    db.rpc('store_unit_economics', { p_days: windowDays }),
    db.from('product_performance').select('*').order('revenue', { ascending: false }).limit(15),
    db.from('inventory_health').select('*').eq('needs_restock', true).limit(25),
    db.from('variant_margins').select('*').limit(200),
  ]);

  const context: Record<string, unknown> = {
    boutique: {
      nom: settings.data?.shop_name,
      devise: settings.data?.currency,
      taux_tva: settings.data?.vat_rate,
      prix_ttc: settings.data?.prices_include_vat,
      marge_nette_cible: settings.data?.target_net_margin,
      cout_acquisition_cible: settings.data?.target_cac,
      charges_fixes_mensuelles: settings.data?.monthly_fixed_costs,
      franco_de_port: settings.data?.free_shipping_above,
    },
    economie_unitaire: economics.data,
    fenetre_observation_jours: windowDays,
    meilleures_ventes: (topProducts.data ?? []).map((p) => ({
      produit: p.name, unites: p.units_sold, ca: p.revenue,
      marge_brute: p.gross_margin, stock: p.stock_available,
      note: p.average_rating, avis: p.review_count,
    })),
    references_a_reapprovisionner: (inventory.data ?? []).map((h) => ({
      reference: h.sku, produit: `${h.product_name} — ${h.variant_title}`,
      disponible: h.available, seuil: h.reorder_point,
      ventes_par_jour: h.daily_velocity, couverture_jours: h.days_of_cover,
    })),
    marges_sous_objectif: (margins.data ?? [])
      .filter((m) => m.net_margin !== null &&
        Number(m.net_margin) < Number(settings.data?.target_net_margin ?? 0.25))
      .slice(0, 25)
      .map((m) => ({
        reference: m.sku, produit: `${m.product_name} — ${m.variant_title}`,
        prix: m.price, marge_nette: m.net_margin, benefice: m.net_profit,
      })),
  };

  if (payload.productId) {
    const { data: product } = await db
      .from('products').select('*').eq('id', payload.productId).maybeSingle();
    if (product) {
      const [{ data: variants }, { data: reviews }, { data: productMargins }] = await Promise.all([
        db.from('product_variants').select('sku, title, price, cost_price')
          .eq('product_id', product.id),
        db.from('product_reviews').select('rating, title, body')
          .eq('product_id', product.id).eq('is_published', true).limit(50),
        db.from('variant_margins').select('*').eq('product_id', product.id),
      ]);
      context.produit_cible = {
        nom: product.name,
        accroche: product.subtitle,
        description: product.description,
        composition: product.composition,
        prix: product.base_price,
        cout_achat: product.cost_price,
        logistique_entrante: product.inbound_shipping,
        taux_retour: product.return_rate,
        part_publicitaire: product.ad_spend_ratio,
        mots_cles: product.tags,
        titre_seo: product.seo_title,
        meta_description: product.seo_description,
        variantes: variants,
        marges_par_variante: (productMargins ?? []).map((m) => ({
          reference: m.sku, marge_brute: m.gross_margin, marge_nette: m.net_margin,
        })),
        avis: reviews,
      };
    }
  }

  return context;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return errorResponse('Méthode non autorisée', 405);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Corps de requête invalide');
  }
  if (!payload.skillSlug) return errorResponse('skillSlug manquant');

  const startedAt = Date.now();
  let userId: string | null = null;

  try {
    const staff = await requireStaff(req);
    userId = staff.userId;
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Accès refusé', 403);
  }

  const db = serviceClient();

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return errorResponse(
      "ANTHROPIC_API_KEY n'est pas configurée. Les modules dotés d'un moteur de calcul " +
      "continuent de fonctionner sans elle : seule l'analyse rédigée la nécessite. " +
      "Définir le secret avec : supabase secrets set ANTHROPIC_API_KEY=...",
      503,
    );
  }

  const { data: settings } = await db
    .from('shop_settings').select('ai_model, ai_enabled').maybeSingle();
  if (settings?.ai_enabled === false) {
    return errorResponse(
      "Les analyses rédigées sont désactivées dans les paramètres de la boutique.", 403,
    );
  }
  const model = settings?.ai_model ?? 'claude-opus-5';

  /* Trace de l'exécution, créée avant l'appel pour ne rien perdre en cas d'échec */
  const { data: run } = await db.from('skill_runs').insert({
    skill_slug: payload.skillSlug,
    title: `Analyse — ${payload.skillSlug}`,
    status: 'running',
    execution_mode: payload.engineOutput ? 'hybrid' : 'reasoning',
    product_id: payload.productId ?? null,
    variant_id: payload.variantId ?? null,
    inputs: {
      windowDays: payload.windowDays ?? 90,
      extraContext: payload.extraContext ?? null,
    },
    model,
    created_by: userId,
  }).select('id').single();

  try {
    const { instructions, sourcePath, fromCache } = await loadInstructions(db, payload.skillSlug);
    const storeContext = await buildStoreContext(db, payload);

    const systemPrompt = [
      "Tu es le moteur d'analyse commerciale de la boutique « La Sappe Authentique »,",
      "une maison de prêt-à-porter vendant en direct depuis la France.",
      '',
      "Tu appliques STRICTEMENT la méthode décrite ci-dessous, issue du dépôt public",
      `nexscope-ai/eCommerce-Skills (${sourcePath}/SKILL.md). Tu n'y substitues pas`,
      'ta propre méthode.',
      '',
      'Règles impératives :',
      "— N'invente aucun chiffre. Les données fournies sont les seules disponibles.",
      '  Si une donnée manque, dis-le explicitement et indique comment l\'obtenir.',
      '— Les calculs déterministes ont déjà été effectués par l\'application et te sont',
      '  transmis sous « resultat_calcul ». Ne les recalcule pas et ne les contredis pas :',
      '  interprète-les, hiérarchise-les, et explique ce qu\'il faut en faire.',
      '— Ne recommande JAMAIS d\'appliquer directement un changement de prix, une dépense',
      '  publicitaire ou une commande fournisseur : ces actions passent par une demande',
      "  d'approbation validée par l'administrateur. Formule-les comme des propositions.",
      '— Réponds en français, dans un style sobre et direct. Pas de superlatifs,',
      '  pas de formules creuses. Des chiffres, des causes, des actions.',
      '— Structure ta réponse en Markdown avec des titres de niveau 2, et termine par',
      "  une section « Prochaines étapes » de trois actions au maximum, ordonnées.",
      '',
      '════════ MÉTHODE DU MODULE (instructions du dépôt) ════════',
      instructions,
    ].join('\n');

    const userContent = [
      '════════ DONNÉES RÉELLES DE LA BOUTIQUE ════════',
      JSON.stringify(storeContext, null, 2),
      '',
      ...(payload.engineOutput ? [
        '════════ RÉSULTAT DU CALCUL DÉTERMINISTE ════════',
        'Ces chiffres ont été calculés par le moteur porté depuis les scripts du dépôt.',
        'Ils sont exacts : appuie-toi dessus.',
        JSON.stringify(payload.engineOutput, null, 2),
        '',
      ] : []),
      ...(payload.extraContext ? [
        '════════ PRÉCISIONS DE L\'UTILISATEUR ════════',
        payload.extraContext,
        '',
      ] : []),
      'Produis l\'analyse demandée par la méthode du module, appliquée à ces données.',
    ].join('\n');

    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      const message = result?.error?.message ?? `Erreur ${response.status}`;
      if (run) {
        await db.from('skill_runs').update({
          status: 'failed', error: message,
          duration_ms: Date.now() - startedAt,
          completed_at: new Date().toISOString(),
        }).eq('id', run.id);
      }
      return errorResponse(`Analyse indisponible : ${message}`, 502);
    }

    const report = (result.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text).join('\n');

    if (run) {
      await db.from('skill_runs').update({
        status: 'succeeded',
        report_markdown: report,
        context_snapshot: storeContext,
        engine_output: payload.engineOutput ?? null,
        input_tokens: result.usage?.input_tokens ?? null,
        output_tokens: result.usage?.output_tokens ?? null,
        duration_ms: Date.now() - startedAt,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id);
    }

    return jsonResponse({
      report,
      model,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      skillRunId: run?.id ?? null,
      instructionsFromCache: fromCache,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur interne';
    console.error('[skill-run]', message);
    if (run) {
      await db.from('skill_runs').update({
        status: 'failed', error: message,
        duration_ms: Date.now() - startedAt,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id);
    }
    return errorResponse(message, 500);
  }
});
