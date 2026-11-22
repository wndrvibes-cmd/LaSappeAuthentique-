import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, ExternalLink, KeyRound, Play, Save, Sparkles } from 'lucide-react';
import { ENGINES, getSkill, skillSourceUrl } from '@/lib/nexscope/registry';
import { buildEngineInput } from '@/lib/nexscope/context';
import type { EngineResult, Recommendation } from '@/lib/nexscope/types';
import { runOpportunityScore, type OpportunityInput } from '@/lib/nexscope/engines/opportunity-score';
import { runDifferentiation, type DifferentiationInput } from '@/lib/nexscope/engines/differentiation';
import { EngineResultView } from '@/components/admin/EngineResultView';
import { AdminHeader, AdminPage } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorBlock, Field,
         Input, LoadingBlock, Notice, Select, Textarea } from '@/components/ui';
import { invokeFunction, supabase } from '@/lib/supabase';
import { useSkillRuns } from '@/hooks/useAdmin';
import { formatRelative } from '@/lib/format';

/* ─────────────── Sélecteurs de contexte (produit, fenêtre) ────────────── */

function useProductOptions() {
  return useQuery({
    queryKey: ['admin', 'product-options'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('products')
        .select('id, name, status').order('name');
      return data ?? [];
    },
  });
}

function useVariantOptions(productId: string | null) {
  return useQuery({
    queryKey: ['admin', 'variant-options', productId],
    enabled: Boolean(productId),
    queryFn: async () => {
      const { data } = await supabase.from('product_variants')
        .select('id, title, sku').eq('product_id', productId!).order('position');
      return data ?? [];
    },
  });
}

/* ───────────── Formulaires des moteurs à saisie manuelle ─────────────── */

function OpportunityForm({ onRun }: { onRun: (result: EngineResult, input: unknown) => void }) {
  const [f, setF] = useState<OpportunityInput>({
    title: '', categoryHint: '',
    monthlySearchVolume: null, trend: null, isSeasonal: false,
    competitorCount: null, competitorPrices: [], dominantBrand: false,
    estimatedUnitCost: 0, targetSellingPrice: 0, estimatedShippingCost: 0,
    expectedReturnRate: 0.12, vatRate: 0.2,
    leadTimeDays: 28, minOrderQuantity: 30, unitWeightGrams: 300,
    isFragile: false, isRegulated: false,
  });
  const [pricesText, setPricesText] = useState('');

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const input = {
          ...f,
          competitorPrices: pricesText.split(',').map((s) => Number(s.trim()))
            .filter((n) => !Number.isNaN(n) && n > 0),
        };
        onRun(runOpportunityScore(input), input);
      }}
    >
      <Notice tone="info">
        Ce module note une idée de produit sur quatre axes. La demande et la
        concurrence ne peuvent pas être devinées : renseignez ce que vous savez.
        Les champs laissés vides sont notés de façon neutre et signalés comme
        données manquantes — aucun chiffre de marché n'est inventé.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Produit envisagé" required className="sm:col-span-2">
          <Input required value={f.title} placeholder="Ex. : ceinture en cuir tressé"
                 onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Famille de produit">
          <Input value={f.categoryHint} placeholder="accessoires"
                 onChange={(e) => setF({ ...f, categoryHint: e.target.value })} />
        </Field>
        <Field label="Recherches mensuelles estimées" hint="Laisser vide si inconnu">
          <Input type="number" min={0} value={f.monthlySearchVolume ?? ''}
                 onChange={(e) => setF({ ...f, monthlySearchVolume: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Tendance sur 12 mois" hint="−1 (effondrement) à +1 (forte croissance)">
          <Input type="number" step="0.1" min={-1} max={1} value={f.trend ?? ''}
                 onChange={(e) => setF({ ...f, trend: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Nombre de concurrents identifiés" hint="Laisser vide si inconnu">
          <Input type="number" min={0} value={f.competitorCount ?? ''}
                 onChange={(e) => setF({ ...f, competitorCount: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Prix relevés chez les concurrents" hint="Séparés par des virgules" className="sm:col-span-2">
          <Input value={pricesText} placeholder="79, 89, 95"
                 onChange={(e) => setPricesText(e.target.value)} />
        </Field>

        <Field label="Coût d'achat unitaire (€)" required>
          <Input type="number" step="0.01" min={0} required value={f.estimatedUnitCost || ''}
                 onChange={(e) => setF({ ...f, estimatedUnitCost: Number(e.target.value) })} />
        </Field>
        <Field label="Prix de vente visé TTC (€)" required>
          <Input type="number" step="0.01" min={0} required value={f.targetSellingPrice || ''}
                 onChange={(e) => setF({ ...f, targetSellingPrice: Number(e.target.value) })} />
        </Field>
        <Field label="Logistique par unité (€)">
          <Input type="number" step="0.01" min={0} value={f.estimatedShippingCost || ''}
                 onChange={(e) => setF({ ...f, estimatedShippingCost: Number(e.target.value) })} />
        </Field>
        <Field label="Taux de retour attendu" hint="0,12 = 12 %">
          <Input type="number" step="0.01" min={0} max={1} value={f.expectedReturnRate}
                 onChange={(e) => setF({ ...f, expectedReturnRate: Number(e.target.value) })} />
        </Field>
        <Field label="Délai fournisseur (jours)">
          <Input type="number" min={0} value={f.leadTimeDays}
                 onChange={(e) => setF({ ...f, leadTimeDays: Number(e.target.value) })} />
        </Field>
        <Field label="Quantité minimale de commande">
          <Input type="number" min={1} value={f.minOrderQuantity}
                 onChange={(e) => setF({ ...f, minOrderQuantity: Number(e.target.value) })} />
        </Field>
        <Field label="Poids unitaire (g)">
          <Input type="number" min={0} value={f.unitWeightGrams}
                 onChange={(e) => setF({ ...f, unitWeightGrams: Number(e.target.value) })} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-5">
        <Checkbox label="Produit saisonnier" checked={f.isSeasonal}
                  onChange={(e) => setF({ ...f, isSeasonal: e.target.checked })} />
        <Checkbox label="Une marque domine le segment" checked={f.dominantBrand}
                  onChange={(e) => setF({ ...f, dominantBrand: e.target.checked })} />
        <Checkbox label="Fragile ou volumineux" checked={f.isFragile}
                  onChange={(e) => setF({ ...f, isFragile: e.target.checked })} />
        <Checkbox label="Soumis à réglementation" checked={f.isRegulated}
                  onChange={(e) => setF({ ...f, isRegulated: e.target.checked })} />
      </div>

      <Button type="submit" icon={<Play className="h-3.5 w-3.5" />}>Noter cette opportunité</Button>
    </form>
  );
}

function DifferentiationForm({ onRun }: { onRun: (result: EngineResult, input: unknown) => void }) {
  const { data: products } = useProductOptions();
  const [productId, setProductId] = useState('');
  const [ourPrice, setOurPrice] = useState(0);
  const [competitors, setCompetitors] = useState([{ name: '', price: 0 }]);
  type AttrRow = { key: string; label: string; ours: number; importance: 1 | 2 | 3 | 4 | 5; competitorValue: number };
  const [attributes, setAttributes] = useState<AttrRow[]>([
    { key: 'matiere', label: 'Qualité de la matière', ours: 7, importance: 5, competitorValue: 5 },
    { key: 'coupe', label: 'Coupe et tombé', ours: 7, importance: 5, competitorValue: 5 },
    { key: 'finitions', label: 'Finitions', ours: 7, importance: 4, competitorValue: 5 },
    { key: 'prix', label: 'Rapport qualité-prix perçu', ours: 6, importance: 4, competitorValue: 6 },
    { key: 'service', label: 'Service et conseil', ours: 7, importance: 3, competitorValue: 4 },
  ]);

  const product = products?.find((p) => p.id === productId);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const input: DifferentiationInput = {
          productName: product?.name ?? 'Produit',
          ourPrice,
          competitorPrices: competitors.filter((c) => c.name && c.price > 0),
          attributes: attributes.map((a) => ({
            key: a.key, label: a.label, ours: a.ours, importance: a.importance,
            competitors: competitors.filter((c) => c.name)
              .map((c) => ({ name: c.name, value: a.competitorValue })),
          })),
          painThemes: [], praiseThemes: [],
        };
        onRun(runDifferentiation(input), input);
      }}
    >
      <Notice tone="info">
        Ce module compare votre pièce aux concurrents sur des critères pondérés par
        leur importance pour le client. Les notes de 0 à 10 sont les vôtres : le
        moteur calcule les écarts, en déduit votre positionnement et identifie les
        terrains libres.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Votre produit" required>
          <Select required value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Choisir…</option>
            {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Votre prix (€)" required>
          <Input type="number" step="0.01" min={0} required value={ourPrice || ''}
                 onChange={(e) => setOurPrice(Number(e.target.value))} />
        </Field>
      </div>

      <div>
        <p className="mb-2.5 text-[0.8125rem] font-medium text-ink">Concurrents comparés</p>
        <div className="space-y-2.5">
          {competitors.map((c, i) => (
            <div key={i} className="flex gap-2.5">
              <Input placeholder="Nom du concurrent" value={c.name}
                     onChange={(e) => {
                       const next = [...competitors];
                       next[i] = { ...next[i], name: e.target.value };
                       setCompetitors(next);
                     }} />
              <Input type="number" step="0.01" min={0} placeholder="Prix" className="w-32"
                     value={c.price || ''}
                     onChange={(e) => {
                       const next = [...competitors];
                       next[i] = { ...next[i], price: Number(e.target.value) };
                       setCompetitors(next);
                     }} />
              {competitors.length > 1 && (
                <Button type="button" variant="ghost" size="sm"
                        onClick={() => setCompetitors(competitors.filter((_, j) => j !== i))}>
                  Retirer
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" className="mt-2.5"
                onClick={() => setCompetitors([...competitors, { name: '', price: 0 }])}>
          Ajouter un concurrent
        </Button>
      </div>

      <div>
        <p className="mb-2.5 text-[0.8125rem] font-medium text-ink">
          Critères de comparaison
        </p>
        <div className="space-y-3">
          {attributes.map((a, i) => (
            <div key={a.key} className="grid gap-3 rounded border border-ivory-300 p-3 sm:grid-cols-4">
              <Input value={a.label} aria-label="Critère"
                     onChange={(e) => {
                       const next = [...attributes];
                       next[i] = { ...next[i], label: e.target.value };
                       setAttributes(next);
                     }} />
              <Field label="Nous (0–10)">
                <Input type="number" min={0} max={10} value={a.ours}
                       onChange={(e) => {
                         const next = [...attributes];
                         next[i] = { ...next[i], ours: Number(e.target.value) };
                         setAttributes(next);
                       }} />
              </Field>
              <Field label="Concurrents (0–10)">
                <Input type="number" min={0} max={10} value={a.competitorValue}
                       onChange={(e) => {
                         const next = [...attributes];
                         next[i] = { ...next[i], competitorValue: Number(e.target.value) };
                         setAttributes(next);
                       }} />
              </Field>
              <Field label="Importance (1–5)">
                <Input type="number" min={1} max={5} value={a.importance}
                       onChange={(e) => {
                         const next = [...attributes];
                         next[i] = { ...next[i], importance: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 };
                         setAttributes(next);
                       }} />
              </Field>
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" icon={<Play className="h-3.5 w-3.5" />}>Analyser la différenciation</Button>
    </form>
  );
}

/* ───────────────────────────── Page du module ────────────────────────── */

export function SkillRunnerPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const skill = slug ? getSkill(slug) : null;
  const engine = skill?.engine_key ? ENGINES[skill.engine_key] : null;

  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [lastInput, setLastInput] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Analyse rédigée (mode reasoning / hybrid)
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [extraContext, setExtraContext] = useState('');

  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalFeedback, setApprovalFeedback] =
    useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const { data: products } = useProductOptions();
  const { data: variants } = useVariantOptions(productId);
  const { data: previousRuns } = useSkillRuns(slug, 5);

  const needsProduct = useMemo(
    () => ['profit-margin', 'supply-chain', 'listing-seo'].includes(engine?.key ?? ''),
    [engine],
  );
  const supportsWindow = useMemo(
    () => ['unit-economics', 'sales-analytics', 'inventory-forecast', 'funnel-cro'].includes(engine?.key ?? ''),
    [engine],
  );
  const manualEngine = engine?.key === 'opportunity-score' || engine?.key === 'differentiation';

  useEffect(() => { setResult(null); setNarrative(null); setError(null); }, [slug]);

  if (!skill) {
    return (
      <AdminPage>
        <EmptyState
          title="Module introuvable"
          description="Ce module n'existe pas dans le registre Nexscope."
          action={<Link to="/admin/intelligence" className="link-underline text-sm font-medium">Retour aux modules</Link>}
        />
      </AdminPage>
    );
  }

  async function runEngine() {
    if (!engine) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setNarrative(null);
    try {
      const input = await buildEngineInput(engine.key, {
        productId, variantId, windowDays,
      });
      if (input === null) throw new Error('Ce module nécessite une saisie manuelle.');
      const output = engine.run(input);
      setResult(output);
      setLastInput(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Le calcul a échoué.');
    } finally {
      setRunning(false);
    }
  }

  /** Demande l'analyse rédigée : instructions réelles du SKILL.md + données. */
  async function runNarrative() {
    setNarrating(true);
    setNarrativeError(null);
    const { data, error: fnError } = await invokeFunction<{
      report: string; model: string; inputTokens: number; outputTokens: number; skillRunId: string;
    }>('skill-run', {
      skillSlug: skill!.slug,
      productId, variantId, windowDays,
      engineOutput: result ? {
        summary: result.summary, status: result.status, metrics: result.metrics,
        findings: result.findings, recommendations: result.recommendations,
        raw: result.raw, dataGaps: result.dataGaps,
      } : null,
      engineInput: lastInput,
      extraContext: extraContext.trim() || null,
    });
    setNarrating(false);
    if (fnError || !data) { setNarrativeError(fnError ?? 'Analyse indisponible.'); return; }
    setNarrative(data.report);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'skill-runs'] });
  }

  /** Enregistre l'analyse pour consultation ultérieure. */
  async function saveRun() {
    if (!result) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data, error: insertError } = await supabase.from('skill_runs').insert({
      skill_slug: skill!.slug,
      title: result.title,
      status: 'succeeded',
      execution_mode: narrative ? 'hybrid' : 'engine',
      product_id: productId,
      variant_id: variantId,
      inputs: { productId, variantId, windowDays } as never,
      context_snapshot: (lastInput ?? {}) as never,
      engine_output: {
        summary: result.summary, status: result.status, metrics: result.metrics,
        findings: result.findings, tables: result.tables, raw: result.raw,
        dataGaps: result.dataGaps,
      } as never,
      report_markdown: narrative,
      recommendations: result.recommendations as never,
      metrics: Object.fromEntries(result.metrics.map((m) => [m.key, m.value])) as never,
      created_by: auth.user?.id ?? null,
      completed_at: new Date().toISOString(),
    }).select('id').single();

    if (insertError) { setError(`Enregistrement impossible : ${insertError.message}`); return; }
    setSaved(data.id);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'skill-runs'] });
  }

  /** Transforme une recommandation sensible en demande d'approbation. */
  async function requestApproval(rec: Recommendation) {
    if (!rec.actionType) return;
    setApprovalBusy(true);
    setApprovalFeedback(null);

    // État antérieur conservé pour permettre un retour en arrière
    let previousState: unknown = null;
    if (rec.actionType === 'price_change' || rec.actionType === 'bulk_price_change') {
      const changes = (rec.payload as { changes?: { product_id: string; variant_id: string | null }[] })?.changes;
      if (changes?.length) {
        const { data } = await supabase.from('variant_pricing').select('*')
          .in('variant_id', changes.map((c) => c.variant_id).filter(Boolean) as string[]);
        previousState = data;
      } else {
        const { data } = await supabase.from('products')
          .select('id, base_price').eq('id', productId ?? '').maybeSingle();
        previousState = data;
      }
    }

    const { error: insertError } = await supabase.from('approval_requests').insert({
      action_type: rec.actionType,
      risk: rec.actionType.includes('price') || rec.actionType === 'ad_budget_change' ? 'high' : 'medium',
      status: 'pending',
      title: rec.title,
      rationale: `${rec.detail}\n\nSource : module « ${skill!.name} » (${skill!.slug}), moteur ${engine?.label ?? '—'}.`,
      payload: (rec.payload ?? {}) as never,
      previous_state: previousState as never,
      estimated_impact: { summary: result?.summary ?? null } as never,
      source_skill_run_id: saved,
      product_id: productId,
    });

    setApprovalBusy(false);
    setApprovalFeedback(insertError
      ? { tone: 'danger', text: `Création impossible : ${insertError.message}` }
      : { tone: 'success', text: 'Demande créée. Validez-la depuis la page Approbations — rien n’a été appliqué.' });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'approvals'] });
  }

  return (
    <AdminPage>
      <Link to="/admin/intelligence"
            className="mb-5 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-400 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Tous les modules
      </Link>

      <AdminHeader
        eyebrow={skill.category}
        title={`${skill.emoji ? `${skill.emoji} ` : ''}${skill.name}`}
        description={skill.description}
        action={
          <a href={skillSourceUrl(skill)} target="_blank" rel="noreferrer noopener"
             className="inline-flex items-center gap-1.5 rounded border border-ivory-400 px-3 py-2 text-[0.75rem] font-medium text-ink-600 hover:border-ink/40">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Source du module
          </a>
        }
      />

      {skill.requires_external_data && skill.external_data_note && (
        <Notice tone="warning" className="mb-6" title="Données externes nécessaires">
          {skill.external_data_note}
        </Notice>
      )}

      {!engine && (
        <Notice tone="info" className="mb-6" title="Module d'analyse rédigée">
          Ce module n'a pas d'algorithme déterministe : il repose sur les instructions
          du SKILL.md d'origine, envoyées au modèle avec les données réelles de votre
          boutique. Une clé <code>ANTHROPIC_API_KEY</code> doit être configurée dans
          les secrets des Edge Functions.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        {/* Colonne de configuration */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Paramètres d'exécution"
                        subtitle={engine ? engine.label : 'Analyse rédigée'} />
            <div className="space-y-4 p-4">
              {engine && !manualEngine && (
                <>
                  {needsProduct && (
                    <>
                      <Field label="Produit" required
                             hint="Les coûts, prix et ventes sont lus dans la base.">
                        <Select value={productId ?? ''}
                                onChange={(e) => { setProductId(e.target.value || null); setVariantId(null); }}>
                          <option value="">Choisir un produit…</option>
                          {products?.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.status !== 'active' ? ' (hors ligne)' : ''}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      {engine.key === 'profit-margin' && productId && (variants?.length ?? 0) > 0 && (
                        <Field label="Variante" hint="Facultatif : sinon le prix de base du produit.">
                          <Select value={variantId ?? ''}
                                  onChange={(e) => setVariantId(e.target.value || null)}>
                            <option value="">Prix de base du produit</option>
                            {variants?.map((v) => (
                              <option key={v.id} value={v.id}>{v.title} — {v.sku}</option>
                            ))}
                          </Select>
                        </Field>
                      )}
                    </>
                  )}

                  {!needsProduct && engine.key !== 'review-analysis' && (
                    <Field label="Produit" hint="Facultatif : restreindre l'analyse à un produit.">
                      <Select value={productId ?? ''}
                              onChange={(e) => setProductId(e.target.value || null)}>
                        <option value="">Toute la boutique</option>
                        {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </Field>
                  )}

                  {engine.key === 'review-analysis' && (
                    <Field label="Périmètre">
                      <Select value={productId ?? ''}
                              onChange={(e) => setProductId(e.target.value || null)}>
                        <option value="">Tous les avis de la boutique</option>
                        {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </Field>
                  )}

                  {supportsWindow && (
                    <Field label="Fenêtre d'observation">
                      <Select value={String(windowDays)}
                              onChange={(e) => setWindowDays(Number(e.target.value))}>
                        <option value="7">7 jours</option>
                        <option value="30">30 jours</option>
                        <option value="90">90 jours</option>
                        <option value="180">180 jours</option>
                        <option value="365">1 an</option>
                      </Select>
                    </Field>
                  )}

                  <Button
                    fullWidth loading={running}
                    icon={<Play className="h-3.5 w-3.5" />}
                    onClick={() => void runEngine()}
                    disabled={needsProduct && !productId}
                  >
                    Lancer le calcul
                  </Button>

                  <p className="text-[0.6875rem] leading-relaxed text-ink-400">
                    Algorithme porté depuis <code>{engine.nexscopeSource}</code>. Il
                    s'exécute dans l'application, sur vos données réelles.
                  </p>
                </>
              )}

              {!engine && (
                <>
                  <Field label="Produit" hint="Facultatif : le contexte produit sera transmis.">
                    <Select value={productId ?? ''}
                            onChange={(e) => setProductId(e.target.value || null)}>
                      <option value="">Toute la boutique</option>
                      {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Précisions" hint="Objectif, contrainte, question particulière.">
                    <Textarea rows={4} value={extraContext}
                              onChange={(e) => setExtraContext(e.target.value)} />
                  </Field>
                  <Button fullWidth loading={narrating} icon={<Sparkles className="h-3.5 w-3.5" />}
                          onClick={() => void runNarrative()}>
                    Demander l'analyse
                  </Button>
                </>
              )}
            </div>
          </Card>

          {/* Analyses précédentes */}
          {(previousRuns?.length ?? 0) > 0 && (
            <Card>
              <CardHeader title="Analyses précédentes" />
              <ul className="divide-y divide-ivory-200">
                {previousRuns?.map((run) => (
                  <li key={run.id}>
                    <Link to={`/admin/analyses/${run.id}`}
                          className="flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-ivory-200/50">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-[0.8125rem] font-medium text-ink">{run.title}</p>
                        <p className="text-[0.6875rem] text-ink-400">{formatRelative(run.created_at)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Colonne de résultat */}
        <div className="min-w-0">
          {manualEngine ? (
            <Card className="p-5">
              {engine?.key === 'opportunity-score' ? (
                <OpportunityForm onRun={(r, i) => { setResult(r); setLastInput(i); }} />
              ) : (
                <DifferentiationForm onRun={(r, i) => { setResult(r); setLastInput(i); }} />
              )}
            </Card>
          ) : null}

          {error && <ErrorBlock className={manualEngine ? 'mt-5' : ''} title="Le calcul n'a pas abouti" message={error} />}

          {running && <LoadingBlock label="Calcul en cours sur vos données…" />}

          {result && (
            <div className={manualEngine ? 'mt-6' : ''}>
              <EngineResultView
                result={result}
                onRequestApproval={(r) => void requestApproval(r)}
                approvalBusy={approvalBusy}
                approvalFeedback={approvalFeedback}
              />

              <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-ivory-300 bg-white p-4">
                <Button variant="secondary" icon={<Save className="h-3.5 w-3.5" />}
                        onClick={() => void saveRun()} disabled={Boolean(saved)}>
                  {saved ? 'Analyse enregistrée' : 'Enregistrer cette analyse'}
                </Button>
                {saved && (
                  <Link to={`/admin/analyses/${saved}`} className="link-underline text-[0.8125rem] font-medium text-ink">
                    Consulter la fiche
                  </Link>
                )}
                {skill.execution_mode !== 'engine' && (
                  <Button variant="brass" loading={narrating} icon={<Sparkles className="h-3.5 w-3.5" />}
                          onClick={() => void runNarrative()}>
                    Ajouter l'analyse rédigée
                  </Button>
                )}
              </div>

              {narrativeError && (
                <Notice tone="warning" className="mt-4" title="Analyse rédigée indisponible">
                  {narrativeError}
                  <span className="mt-1.5 block">
                    Les chiffres ci-dessus restent valables : ils sont calculés localement.
                    L'analyse rédigée requiert une clé <code>ANTHROPIC_API_KEY</code> dans
                    les secrets des Edge Functions.
                  </span>
                </Notice>
              )}

              {narrative && (
                <Card className="mt-6">
                  <CardHeader
                    title="Analyse rédigée"
                    subtitle={`Instructions du module « ${skill.name} » appliquées à vos données`}
                    action={<Badge tone="info" icon={<Sparkles className="h-3 w-3" />}>Modèle</Badge>}
                  />
                  <div className="prose-sappe p-5 whitespace-pre-wrap">{narrative}</div>
                </Card>
              )}
            </div>
          )}

          {!result && !running && !error && !manualEngine && (
            <Card className="p-10">
              <EmptyState
                icon={engine ? <Play className="h-8 w-8" /> : <KeyRound className="h-8 w-8" />}
                title={engine ? 'Prêt à calculer' : 'Prêt à analyser'}
                description={
                  engine
                    ? needsProduct && !productId
                      ? 'Sélectionnez un produit, puis lancez le calcul. Les coûts, prix, ventes et stocks seront lus directement dans la base.'
                      : 'Lancez le calcul : le moteur travaillera sur les données réelles de votre boutique.'
                    : "Ce module produit une analyse rédigée à partir des instructions d'origine du dépôt et des données de votre boutique."
                }
              />
            </Card>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
