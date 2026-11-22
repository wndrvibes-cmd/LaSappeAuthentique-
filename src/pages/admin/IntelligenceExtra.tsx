/**
 * Pages complémentaires d'intelligence commerciale :
 * analyses sauvegardées, veille concurrentielle, opportunités produit.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Brain, Compass, Eye, Pin, Plus, Trash2, Upload } from 'lucide-react';
import { useCompetitors, useOpportunities, usePriceHistory, useSkillRun,
         useSkillRuns } from '@/hooks/useAdmin';
import { NEXSCOPE_SKILLS, getSkill } from '@/lib/nexscope/registry';
import type { EngineResult } from '@/lib/nexscope/types';
import { EngineResultView } from '@/components/admin/EngineResultView';
import { AdminHeader, AdminPage, StatTile } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBlock, Field, Input,
         LoadingBlock, Modal, Notice, Select, Table, Td, Textarea, Th } from '@/components/ui';
import { formatDateTime, formatPercent, formatPrice, formatRelative } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Competitor } from '@/types/database';

/* ════════════════════════ Analyses sauvegardées ═══════════════════════ */

export function SavedAnalysesPage() {
  const [skillSlug, setSkillSlug] = useState<string | null>(null);
  const { data: runs, isLoading, error, refetch } = useSkillRuns(skillSlug, 100);
  const queryClient = useQueryClient();

  const usedSlugs = [...new Set((runs ?? []).map((r) => r.skill_slug))];

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Intelligence commerciale"
        title="Analyses sauvegardées"
        description="Chaque analyse conserve les données sur lesquelles elle a été calculée. Vous pouvez donc la relire plus tard et comparer l'évolution."
        action={
          <Link to="/admin/intelligence"
                className="inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-[0.8125rem] font-medium text-ivory hover:bg-ink-800">
            <Brain className="h-4 w-4" aria-hidden /> Nouvelle analyse
          </Link>
        }
      />

      {usedSlugs.length > 1 && (
        <div className="mb-5">
          <Select className="w-auto" value={skillSlug ?? ''}
                  onChange={(e) => setSkillSlug(e.target.value || null)}
                  aria-label="Filtrer par module">
            <option value="">Tous les modules</option>
            {usedSlugs.map((slug) => {
              const s = NEXSCOPE_SKILLS.find((x) => x.slug === slug);
              return <option key={slug} value={slug}>{s?.name ?? slug}</option>;
            })}
          </Select>
        </div>
      )}

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : runs?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Analyse</Th><Th>Module</Th><Th>Mode</Th>
                <Th align="right">Indicateurs</Th><Th>Date</Th><Th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const skill = NEXSCOPE_SKILLS.find((s) => s.slug === r.skill_slug);
                const metricCount = Object.keys((r.metrics ?? {}) as object).length;
                return (
                  <tr key={r.id} className="transition-colors hover:bg-ivory-200/40">
                    <Td>
                      <Link to={`/admin/analyses/${r.id}`}
                            className="font-medium text-ink hover:text-brass-dark">
                        {r.is_pinned && <Pin className="mr-1 inline h-3 w-3 text-brass" aria-hidden />}
                        {r.title}
                      </Link>
                    </Td>
                    <Td><span className="text-[0.75rem]">{skill?.name ?? r.skill_slug}</span></Td>
                    <Td>
                      <Badge tone={r.execution_mode === 'engine' ? 'success' : 'info'}>
                        {r.execution_mode === 'engine' ? 'Calcul'
                          : r.execution_mode === 'hybrid' ? 'Calcul + analyse' : 'Analyse'}
                      </Badge>
                    </Td>
                    <Td align="right">{metricCount || '—'}</Td>
                    <Td><span className="text-[0.75rem] text-ink-400">
                      {formatDateTime(r.created_at)}
                    </span></Td>
                    <Td align="right">
                      <button
                        type="button"
                        aria-label="Supprimer cette analyse"
                        onClick={async () => {
                          await supabase.from('skill_runs').delete().eq('id', r.id);
                          void queryClient.invalidateQueries({ queryKey: ['admin', 'skill-runs'] });
                        }}
                        className="rounded p-1.5 text-ink-400 transition-colors hover:bg-bordeaux-soft hover:text-signal-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          icon={<Brain className="h-9 w-9" />}
          title="Aucune analyse sauvegardée"
          description="Lancez un module, puis enregistrez son résultat pour le retrouver ici et suivre son évolution."
          action={
            <Link to="/admin/intelligence"
                  className="inline-flex rounded bg-ink px-4 py-2 text-[0.8125rem] font-medium text-ivory">
              Voir les modules
            </Link>
          }
        />
      )}
    </AdminPage>
  );
}

export function SavedAnalysisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: run, isLoading, error } = useSkillRun(id);
  const queryClient = useQueryClient();

  if (isLoading) return <AdminPage><LoadingBlock /></AdminPage>;
  if (error || !run) {
    return (
      <AdminPage>
        <ErrorBlock title="Analyse introuvable"
                    message={error instanceof Error ? error.message : null} />
      </AdminPage>
    );
  }

  const skill = getSkill(run.skill_slug);
  const output = run.engine_output as unknown as Partial<EngineResult> | null;

  // Reconstitution d'un EngineResult à partir de ce qui a été enregistré
  const result: EngineResult | null = output ? {
    engineKey: skill?.engine_key ?? 'inconnu',
    title: run.title,
    summary: output.summary ?? '',
    status: output.status ?? 'warning',
    metrics: output.metrics ?? [],
    findings: output.findings ?? [],
    recommendations: (run.recommendations as unknown as EngineResult['recommendations']) ?? [],
    tables: output.tables ?? [],
    raw: output.raw ?? {},
    dataGaps: output.dataGaps ?? [],
  } : null;

  return (
    <AdminPage>
      <Link to="/admin/analyses"
            className="mb-5 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-400 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Toutes les analyses
      </Link>

      <AdminHeader
        eyebrow={skill?.category ?? 'Analyse'}
        title={run.title}
        description={
          <>
            Module <strong>{skill?.name ?? run.skill_slug}</strong> ·
            exécutée le {formatDateTime(run.created_at)} ·
            mode {run.execution_mode === 'engine' ? 'calcul local'
              : run.execution_mode === 'hybrid' ? 'calcul + analyse rédigée' : 'analyse rédigée'}
            {run.model && ` · modèle ${run.model}`}
          </>
        }
        action={
          <div className="flex gap-2">
            <Button
              size="sm" variant={run.is_pinned ? 'brass' : 'secondary'}
              icon={<Pin className="h-3.5 w-3.5" />}
              onClick={async () => {
                await supabase.from('skill_runs')
                  .update({ is_pinned: !run.is_pinned }).eq('id', run.id);
                void queryClient.invalidateQueries({ queryKey: ['admin', 'skill-run', id] });
              }}
            >
              {run.is_pinned ? 'Épinglée' : 'Épingler'}
            </Button>
            {skill && (
              <Link to={`/admin/intelligence/${skill.slug}`}
                    className="inline-flex items-center rounded border border-ivory-400 px-3 py-2 text-[0.75rem] font-medium text-ink-600 hover:border-ink/40">
                Relancer le module
              </Link>
            )}
          </div>
        }
      />

      <Notice tone="info" className="mb-6">
        Cette analyse reflète l'état de la boutique au {formatDateTime(run.created_at)}.
        Les chiffres n'ont pas été recalculés depuis : relancez le module pour obtenir
        une photographie à jour.
      </Notice>

      {result ? (
        <EngineResultView result={result} />
      ) : (
        <Notice tone="warning">Aucun résultat de calcul enregistré pour cette analyse.</Notice>
      )}

      {run.report_markdown && (
        <Card className="mt-6">
          <CardHeader title="Analyse rédigée" />
          <div className="prose-sappe whitespace-pre-wrap p-5">{run.report_markdown}</div>
        </Card>
      )}

      {run.error && (
        <Notice tone="danger" className="mt-6" title="Erreur consignée">{run.error}</Notice>
      )}
    </AdminPage>
  );
}

/* ═══════════════════════ Veille concurrentielle ═══════════════════════ */

export function CompetitorsPage() {
  const { data: competitors, isLoading, error, refetch } = useCompetitors();
  const { data: priceHistory } = usePriceHistory();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<Competitor> | null>(null);
  const [observing, setObserving] = useState<{ id: string; title: string } | null>(null);
  const [price, setPrice] = useState('');
  const [shipping, setShipping] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const trackedProducts = (competitors ?? []).flatMap((c) =>
    c.products.map((p) => ({ ...p, competitorName: c.name })));

  async function saveCompetitor() {
    if (!editing?.name) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      name: editing.name, website: editing.website ?? null,
      platform: editing.platform ?? null, country_code: editing.country_code ?? null,
      positioning: editing.positioning ?? null, notes: editing.notes ?? null,
      is_tracked: editing.is_tracked ?? true,
    };
    const { error: err } = editing.id
      ? await supabase.from('competitors').update(payload).eq('id', editing.id)
      : await supabase.from('competitors').insert(payload);
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'competitors'] });
  }

  async function saveObservation() {
    if (!observing || !price) return;
    setSaving(true);
    const { error: err } = await supabase.from('price_observations').insert({
      competitor_product_id: observing.id,
      price: Number(price),
      shipping_price: shipping ? Number(shipping) : null,
      source: 'manual',
    });
    if (!err) {
      await supabase.from('competitor_products').update({
        last_price: Number(price), last_checked_at: new Date().toISOString(),
      }).eq('id', observing.id);
    }
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setObserving(null); setPrice(''); setShipping('');
    void queryClient.invalidateQueries({ queryKey: ['admin', 'competitors'] });
  }

  /** Import CSV : concurrent;titre;url;prix;port;date */
  async function importCsv(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0].toLowerCase();
      const sep = header.includes(';') ? ';' : ',';
      const cols = header.split(sep).map((c) => c.trim());
      const idx = (name: string) => cols.findIndex((c) => c.includes(name));
      const iComp = idx('concurrent');
      const iTitle = idx('titre');
      const iPrice = idx('prix');
      const iShip = idx('port');

      if (iComp < 0 || iTitle < 0 || iPrice < 0) {
        throw new Error('Colonnes attendues : concurrent ; titre ; prix ; port (facultatif)');
      }

      let inserted = 0;
      let skipped = 0;
      for (const line of lines.slice(1)) {
        const cells = line.split(sep).map((c) => c.trim());
        const compName = cells[iComp];
        const title = cells[iTitle];
        const value = Number(cells[iPrice].replace(',', '.'));
        if (!compName || !title || Number.isNaN(value)) { skipped += 1; continue; }

        // Concurrent : retrouvé ou créé
        const existingComp = (competitors ?? []).find(
          (c) => c.name.toLowerCase() === compName.toLowerCase());
        let comp: { id: string; products: { id: string; title: string }[] };
        if (existingComp) {
          comp = existingComp;
        } else {
          const { data } = await supabase.from('competitors')
            .insert({ name: compName, is_tracked: true }).select('*').single();
          if (!data) { skipped += 1; continue; }
          comp = { ...data, products: [] };
        }

        // Produit concurrent : retrouvé ou créé
        const existingCp = comp.products.find(
          (p) => p.title.toLowerCase() === title.toLowerCase());
        let cpId: string;
        if (existingCp) {
          cpId = existingCp.id;
        } else {
          const { data } = await supabase.from('competitor_products')
            .insert({ competitor_id: comp.id, title, is_tracked: true })
            .select('id').single();
          if (!data) { skipped += 1; continue; }
          cpId = data.id;
        }

        await supabase.from('price_observations').insert({
          competitor_product_id: cpId, price: value,
          shipping_price: iShip >= 0 && cells[iShip] ? Number(cells[iShip].replace(',', '.')) : null,
          source: 'csv_import',
        });
        await supabase.from('competitor_products').update({
          last_price: value, last_checked_at: new Date().toISOString(),
        }).eq('id', cpId);
        inserted += 1;
      }

      setImportResult(`${inserted} relevé(s) importé(s)${skipped ? `, ${skipped} ligne(s) ignorée(s)` : ''}.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'competitors'] });
    } catch (e) {
      setImportResult(`Import impossible : ${e instanceof Error ? e.message : 'format non reconnu'}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Intelligence commerciale"
        title="Veille concurrentielle"
        description="Les relevés de prix sont saisis manuellement ou importés par CSV. La plateforme n'effectue aucune collecte automatique : elle analyse ce que vous lui fournissez."
        action={
          <div className="flex gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-ivory-400 px-3 py-2 text-[0.75rem] font-medium text-ink-600 hover:border-ink/40">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {importing ? 'Import…' : 'Importer un CSV'}
              <input type="file" accept=".csv,text/csv" className="hidden" disabled={importing}
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); }} />
            </label>
            <Button icon={<Plus className="h-4 w-4" />}
                    onClick={() => setEditing({ is_tracked: true })}>
              Nouveau concurrent
            </Button>
          </div>
        }
      />

      {importResult && (
        <Notice tone={importResult.startsWith('Import impossible') ? 'danger' : 'success'} className="mb-5">
          {importResult}
        </Notice>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Concurrents suivis"
                  value={String((competitors ?? []).filter((c) => c.is_tracked).length)} />
        <StatTile label="Produits comparés" value={String(trackedProducts.length)}
                  tone={trackedProducts.length ? 'neutral' : 'warning'} />
        <StatTile label="Avec relevé de prix"
                  value={String(trackedProducts.filter((p) => p.last_price !== null).length)} />
      </div>

      <Notice tone="info" className="mb-6" title="Format du fichier d'import">
        Colonnes attendues, séparées par un point-virgule :{' '}
        <code>concurrent ; titre ; prix ; port</code>. La colonne « port » est
        facultative. Les concurrents et produits inconnus sont créés automatiquement.
      </Notice>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : competitors?.length ? (
        <div className="space-y-5">
          {competitors.map((c) => (
            <Card key={c.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {c.name}
                    {!c.is_tracked && <Badge tone="neutral">non suivi</Badge>}
                  </span>
                }
                subtitle={[c.platform, c.country_code, c.positioning].filter(Boolean).join(' · ') || undefined}
                action={
                  <div className="flex gap-2">
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noreferrer noopener"
                         className="rounded border border-ivory-400 p-1.5 text-ink-400 hover:border-ink/40 hover:text-ink">
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Modifier</Button>
                  </div>
                }
              />
              {c.products.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Produit concurrent</Th><Th align="right">Dernier prix</Th>
                      <Th>Dernier relevé</Th><Th />
                    </tr>
                  </thead>
                  <tbody>
                    {c.products.map((p) => (
                      <tr key={p.id}>
                        <Td>
                          <span className="font-medium text-ink">{p.title}</span>
                          {p.url && (
                            <a href={p.url} target="_blank" rel="noreferrer noopener"
                               className="ml-2 text-[0.6875rem] text-brass-dark hover:underline">
                              voir
                            </a>
                          )}
                        </Td>
                        <Td align="right">
                          {p.last_price !== null
                            ? formatPrice(Number(p.last_price), p.currency)
                            : <span className="text-signal-warning">aucun</span>}
                        </Td>
                        <Td>
                          <span className="text-[0.75rem] text-ink-400">
                            {p.last_checked_at ? formatRelative(p.last_checked_at) : '—'}
                          </span>
                        </Td>
                        <Td align="right">
                          <Button size="sm" variant="ghost"
                                  onClick={() => { setObserving({ id: p.id, title: p.title });
                                                   setPrice(''); setShipping(''); }}>
                            Saisir un prix
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="px-5 py-6 text-[0.8125rem] text-ink-400">
                  Aucun produit comparé pour ce concurrent. Importez un CSV pour en ajouter.
                </p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Eye className="h-9 w-9" />}
          title="Aucun concurrent suivi"
          description="Ajoutez les enseignes auxquelles vous vous comparez, puis saisissez ou importez leurs prix. Le module de veille calculera ensuite votre positionnement."
          action={<Button onClick={() => setEditing({ is_tracked: true })}>Ajouter un concurrent</Button>}
        />
      )}

      {/* Historique de nos prix */}
      {(priceHistory?.length ?? 0) > 0 && (
        <Card className="mt-7">
          <CardHeader title="Historique de vos prix"
                      subtitle="Toute modification validée est tracée avec son motif" />
          <Table>
            <thead>
              <tr>
                <Th align="right">Ancien prix</Th><Th align="right">Nouveau prix</Th>
                <Th align="right">Variation</Th><Th>Motif</Th><Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {priceHistory?.slice(0, 30).map((h) => {
                const delta = h.old_price !== null
                  ? (Number(h.new_price) - Number(h.old_price)) / Number(h.old_price) : null;
                return (
                  <tr key={h.id}>
                    <Td align="right">
                      {h.old_price !== null ? formatPrice(Number(h.old_price)) : '—'}
                    </Td>
                    <Td align="right">{formatPrice(Number(h.new_price))}</Td>
                    <Td align="right">
                      {delta !== null && (
                        <span className={delta > 0 ? 'text-signal-success' : 'text-signal-warning'}>
                          {delta > 0 ? '+' : ''}{formatPercent(delta)}
                        </span>
                      )}
                    </Td>
                    <Td><span className="text-[0.75rem]">{h.reason ?? '—'}</span></Td>
                    <Td><span className="text-[0.75rem] text-ink-400">
                      {formatDateTime(h.created_at)}
                    </span></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {editing && (
        <Modal
          open onClose={() => setEditing(null)}
          title={editing.id ? 'Modifier le concurrent' : 'Nouveau concurrent'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
              <Button loading={saving} onClick={() => void saveCompetitor()}>Enregistrer</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nom" required>
              <Input required value={editing.name ?? ''}
                     onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Site web">
              <Input type="url" value={editing.website ?? ''}
                     onChange={(e) => setEditing({ ...editing, website: e.target.value })} />
            </Field>
            <Field label="Positionnement" hint="premium, milieu de gamme, entrée de gamme…">
              <Input value={editing.positioning ?? ''}
                     onChange={(e) => setEditing({ ...editing, positioning: e.target.value })} />
            </Field>
            <Field label="Pays" hint="Code à deux lettres">
              <Input maxLength={2} value={editing.country_code ?? ''}
                     onChange={(e) => setEditing({ ...editing, country_code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={editing.notes ?? ''}
                        onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            {saveError && <Notice tone="danger">{saveError}</Notice>}
          </div>
        </Modal>
      )}

      {observing && (
        <Modal
          open onClose={() => setObserving(null)}
          title="Saisir un relevé de prix"
          footer={
            <>
              <Button variant="ghost" onClick={() => setObserving(null)}>Annuler</Button>
              <Button loading={saving} disabled={!price} onClick={() => void saveObservation()}>
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-[0.875rem] text-ink-600">{observing.title}</p>
            <Field label="Prix constaté (€)" required>
              <Input type="number" step="0.01" min={0} autoFocus value={price}
                     onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Frais de port (€)" hint="Facultatif : permet une comparaison à prix rendu">
              <Input type="number" step="0.01" min={0} value={shipping}
                     onChange={(e) => setShipping(e.target.value)} />
            </Field>
            <Notice tone="info">
              Le relevé est horodaté. Le module de veille ne retient que les relevés
              de moins de 30 jours : un prix périmé est plus trompeur qu'une absence
              de donnée.
            </Notice>
          </div>
        </Modal>
      )}
    </AdminPage>
  );
}

/* ═══════════════════════ Opportunités produit ═════════════════════════ */

const OPPORTUNITY_STATUS_LABEL: Record<string, string> = {
  new: 'À étudier', researching: 'En recherche', validated: 'Validée',
  rejected: 'Écartée', launched: 'Lancée',
};

export function OpportunitiesPage() {
  const { data: opportunities, isLoading, error, refetch } = useOpportunities();
  const queryClient = useQueryClient();

  const byStatus = (status: string) => (opportunities ?? []).filter((o) => o.status === status);

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Intelligence commerciale"
        title="Opportunités produit"
        description="Les idées notées par le module de recherche produit. La note est calculée sur quatre axes : demande, concurrence, marge réelle et faisabilité logistique."
        action={
          <Link to="/admin/intelligence/dropshipping-product-research"
                className="inline-flex items-center gap-1.5 rounded bg-brass px-4 py-2 text-[0.8125rem] font-medium text-ink hover:bg-brass-light">
            <Compass className="h-4 w-4" aria-hidden /> Noter une idée
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Object.entries(OPPORTUNITY_STATUS_LABEL).map(([key, label]) => (
          <StatTile key={key} label={label} value={String(byStatus(key).length)}
                    tone={key === 'validated' ? 'success' : key === 'rejected' ? 'neutral' : 'neutral'} />
        ))}
      </div>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : opportunities?.length ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Opportunité</Th><Th align="right">Note</Th>
                <Th align="right">Demande</Th><Th align="right">Concurrence</Th>
                <Th align="right">Marge</Th><Th align="right">Logistique</Th>
                <Th>Verdict</Th><Th>Statut</Th><Th />
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-ivory-200/40">
                  <Td>
                    <span className="font-medium text-ink">{o.title}</span>
                    {o.category_hint && (
                      <span className="block text-[0.6875rem] text-ink-400">{o.category_hint}</span>
                    )}
                  </Td>
                  <Td align="right">
                    {o.total_score !== null ? (
                      <span className={
                        o.total_score >= 75 ? 'font-semibold text-signal-success'
                        : o.total_score >= 60 ? 'text-signal-warning' : 'text-ink-400'}>
                        {o.total_score}/100
                      </span>
                    ) : '—'}
                  </Td>
                  <Td align="right">{o.demand_score ?? '—'}</Td>
                  <Td align="right">{o.competition_score ?? '—'}</Td>
                  <Td align="right">
                    {o.est_margin_pct !== null
                      ? <span className={Number(o.est_margin_pct) < 25 ? 'text-signal-warning' : ''}>
                          {Number(o.est_margin_pct).toFixed(1)} %
                        </span>
                      : o.margin_score ?? '—'}
                  </Td>
                  <Td align="right">{o.logistics_score ?? '—'}</Td>
                  <Td><span className="text-[0.75rem]">{o.verdict ?? '—'}</span></Td>
                  <Td>
                    <Select
                      className="h-7 w-auto text-[0.75rem]"
                      value={o.status}
                      aria-label={`Statut de ${o.title}`}
                      onChange={async (e) => {
                        await supabase.from('product_opportunities')
                          .update({ status: e.target.value as typeof o.status }).eq('id', o.id);
                        void queryClient.invalidateQueries({ queryKey: ['admin', 'opportunities'] });
                      }}
                    >
                      {Object.entries(OPPORTUNITY_STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </Select>
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      aria-label="Supprimer"
                      onClick={async () => {
                        await supabase.from('product_opportunities').delete().eq('id', o.id);
                        void queryClient.invalidateQueries({ queryKey: ['admin', 'opportunities'] });
                      }}
                      className="rounded p-1.5 text-ink-400 hover:bg-bordeaux-soft hover:text-signal-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          icon={<Compass className="h-9 w-9" />}
          title="Aucune opportunité enregistrée"
          description="Notez une idée de produit avec le module de recherche produit : il vérifie sa rentabilité réelle au prix visé avant de conclure."
          action={
            <Link to="/admin/intelligence/dropshipping-product-research"
                  className="inline-flex rounded bg-ink px-4 py-2 text-[0.8125rem] font-medium text-ivory">
              Noter une idée
            </Link>
          }
        />
      )}
    </AdminPage>
  );
}
