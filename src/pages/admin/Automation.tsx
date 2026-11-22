/**
 * Centre d'automatisation et file d'approbation.
 *
 * Règle structurelle du projet : une automatisation observe, calcule et
 * signale. Elle ne modifie jamais un prix, un budget publicitaire ou une
 * commande fournisseur. Ces actions passent par une demande d'approbation
 * que l'administrateur valide explicitement, avec conservation de l'état
 * antérieur pour pouvoir revenir en arrière.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock, Pause, Play, Plus, RotateCcw, ShieldAlert,
         ShieldCheck, Workflow, X } from 'lucide-react';
import { useAlerts, useApprovals, useAutomationRuns, useAutomations,
         useDecideApproval, useResolveAlert } from '@/hooks/useAdmin';
import { NEXSCOPE_SKILLS } from '@/lib/nexscope/registry';
import { AdminHeader, AdminPage, StatTile } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorBlock, Field,
         Input, LoadingBlock, Modal, Notice, Select, Table, Td, Textarea, Th } from '@/components/ui';
import { ACTION_TYPE_LABEL, ALERT_KIND_LABEL, APPROVAL_STATUS_LABEL,
         AUTOMATION_KIND_LABEL, describeCron, formatDateTime, formatPrice,
         formatRelative } from '@/lib/format';
import { invokeFunction, supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { ApprovalRequest, Automation } from '@/types/database';

/* ════════════════════════════ Automatisations ═════════════════════════ */

export function AutomationsPage() {
  const { data: automations, isLoading, error, refetch } = useAutomations();
  const { data: runs } = useAutomationRuns(null, 30);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<Automation> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runFeedback, setRunFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const active = (automations ?? []).filter((a) => a.status === 'active');
  const lastRuns = new Map<string, typeof runs extends (infer T)[] | undefined ? T : never>();
  for (const r of runs ?? []) if (!lastRuns.has(r.automation_id)) lastRuns.set(r.automation_id, r);

  async function toggle(a: Automation) {
    await supabase.from('automations')
      .update({ status: a.status === 'active' ? 'paused' : 'active' }).eq('id', a.id);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'automations'] });
  }

  async function save() {
    if (!editing?.name || !editing.kind) return;
    setSaving(true);
    setSaveError(null);
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      name: editing.name,
      description: editing.description ?? null,
      kind: editing.kind,
      skill_slug: editing.skill_slug ?? null,
      status: editing.status ?? 'paused',
      schedule_cron: editing.schedule_cron ?? '0 7 * * 1',
      timezone: editing.timezone ?? 'Europe/Paris',
      config: editing.config ?? {},
      requires_approval: editing.requires_approval ?? true,
      max_price_change_pct: Number(editing.max_price_change_pct ?? 0.08),
      notify_email: editing.notify_email ?? null,
      created_by: auth.user?.id ?? null,
    };
    const { error: err } = editing.id
      ? await supabase.from('automations').update(payload).eq('id', editing.id)
      : await supabase.from('automations').insert(payload);
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'automations'] });
  }

  /** Déclenche une exécution immédiate via l'Edge Function. */
  async function runNow(a: Automation) {
    setRunningId(a.id);
    setRunFeedback(null);
    const { data, error: fnError } = await invokeFunction<{
      status: string; summary: string; approvalsCreated: number; alertsCreated: number;
    }>('automation-tick', { automationId: a.id, triggerSource: 'manual' });
    setRunningId(null);
    setRunFeedback(fnError || !data
      ? { tone: 'danger', text: fnError ?? "L'exécution a échoué." }
      : { tone: 'success',
          text: `${data.summary} — ${data.approvalsCreated} demande(s) d'approbation, ${data.alertsCreated} alerte(s).` });
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  }

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Automatisation"
        title="Automatisations"
        description="Analyses programmées, alertes et surveillance. Aucune automatisation ne modifie un prix, un budget publicitaire ou une commande fournisseur : elle produit une demande que vous approuvez."
        action={
          <Button icon={<Plus className="h-4 w-4" />}
                  onClick={() => setEditing({
                    kind: 'stock_alert', status: 'paused',
                    schedule_cron: '0 7 * * 1', requires_approval: true,
                    max_price_change_pct: 0.08, config: {},
                  })}>
            Nouvelle automatisation
          </Button>
        }
      />

      <Notice tone="success" className="mb-6" title="Garde-fou permanent">
        <ShieldCheck className="mb-0.5 mr-1 inline h-3.5 w-3.5" aria-hidden />
        Les actions sensibles — changement de prix, dépense publicitaire, commande
        fournisseur, envoi d'emails en masse — ne sont jamais exécutées
        automatiquement. L'automatisation crée une demande d'approbation ; rien ne
        s'applique avant votre validation explicite, et l'état antérieur est
        conservé pour permettre un retour en arrière.
      </Notice>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Automatisations" value={String(automations?.length ?? 0)} />
        <StatTile label="Actives" value={String(active.length)}
                  tone={active.length ? 'success' : 'neutral'} />
        <StatTile label="Exécutions récentes" value={String(runs?.length ?? 0)} />
        <StatTile label="Échecs"
                  value={String((runs ?? []).filter((r) => r.status === 'failed').length)}
                  tone={(runs ?? []).some((r) => r.status === 'failed') ? 'danger' : 'success'} />
      </div>

      {runFeedback && <Notice tone={runFeedback.tone} className="mb-5">{runFeedback.text}</Notice>}

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : automations?.length ? (
        <div className="space-y-4">
          {automations.map((a) => {
            const last = lastRuns.get(a.id);
            const skill = a.skill_slug ? NEXSCOPE_SKILLS.find((s) => s.slug === a.skill_slug) : null;
            return (
              <Card key={a.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-[0.9375rem] text-ink">{a.name}</h3>
                      <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>
                        {a.status === 'active' ? 'Active' : 'En pause'}
                      </Badge>
                      <Badge tone="info">{AUTOMATION_KIND_LABEL[a.kind] ?? a.kind}</Badge>
                      {a.requires_approval && (
                        <Badge tone="brass" icon={<ShieldAlert className="h-3 w-3" />}>
                          Approbation requise
                        </Badge>
                      )}
                    </div>
                    {a.description && (
                      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-500">{a.description}</p>
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem] text-ink-400">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" aria-hidden /> {describeCron(a.schedule_cron)}
                      </span>
                      {skill && (
                        <Link to={`/admin/intelligence/${skill.slug}`} className="link-underline">
                          module : {skill.name}
                        </Link>
                      )}
                      {a.last_run_at && (
                        <span>
                          dernière exécution {formatRelative(a.last_run_at)}
                          {last && ` · ${last.status === 'succeeded' ? 'réussie' : last.status === 'failed' ? 'en échec' : last.status}`}
                        </span>
                      )}
                      {a.run_count > 0 && <span>{a.run_count} exécution(s)</span>}
                      {Number(a.max_price_change_pct) > 0 && (
                        <span>variation bornée à ±{Math.round(Number(a.max_price_change_pct) * 100)} %</span>
                      )}
                    </div>
                    {last?.summary && (
                      <p className="mt-2.5 rounded bg-ivory-200/60 px-3 py-2 text-[0.75rem] text-ink-600">
                        {last.summary}
                      </p>
                    )}
                    {last?.error && (
                      <p className="mt-2.5 rounded bg-bordeaux-soft px-3 py-2 text-[0.75rem] text-signal-danger">
                        Dernière erreur : {last.error}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="secondary" loading={runningId === a.id}
                            icon={<Play className="h-3.5 w-3.5" />}
                            onClick={() => void runNow(a)}>
                      Exécuter
                    </Button>
                    <Button size="sm" variant="ghost"
                            icon={a.status === 'active'
                              ? <Pause className="h-3.5 w-3.5" />
                              : <Play className="h-3.5 w-3.5" />}
                            onClick={() => void toggle(a)}>
                      {a.status === 'active' ? 'Mettre en pause' : 'Activer'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Modifier</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Workflow className="h-9 w-9" />}
          title="Aucune automatisation"
          description="Créez une surveillance de stock, un rapport de ventes hebdomadaire ou une veille de prix. Les automatisations livrées avec la boutique sont en pause : activez-les quand vous le souhaitez."
          action={<Button onClick={() => setEditing({ kind: 'stock_alert', status: 'paused',
            schedule_cron: '0 7 * * *', requires_approval: true, config: {} })}>
            Créer une automatisation
          </Button>}
        />
      )}

      {/* Historique */}
      {(runs?.length ?? 0) > 0 && (
        <Card className="mt-7">
          <CardHeader title="Historique des exécutions"
                      subtitle="Les 30 dernières, toutes automatisations confondues" />
          <Table>
            <thead>
              <tr>
                <Th>Automatisation</Th><Th>Déclenchement</Th><Th>Statut</Th>
                <Th>Résumé</Th><Th align="right">Demandes</Th>
                <Th align="right">Alertes</Th><Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {runs?.map((r) => {
                const a = automations?.find((x) => x.id === r.automation_id);
                return (
                  <tr key={r.id}>
                    <Td><span className="font-medium text-ink">{a?.name ?? '—'}</span></Td>
                    <Td><span className="text-[0.75rem]">
                      {r.trigger_source === 'manual' ? 'manuel' : 'programmé'}
                    </span></Td>
                    <Td>
                      <Badge tone={r.status === 'succeeded' ? 'success'
                        : r.status === 'failed' ? 'danger' : 'neutral'}>
                        {r.status === 'succeeded' ? 'Réussie'
                          : r.status === 'failed' ? 'Échec'
                          : r.status === 'running' ? 'En cours' : 'Ignorée'}
                      </Badge>
                    </Td>
                    <Td><span className="line-clamp-2 text-[0.75rem]">
                      {r.summary ?? r.error ?? '—'}
                    </span></Td>
                    <Td align="right">{r.approvals_created || '—'}</Td>
                    <Td align="right">{r.alerts_created || '—'}</Td>
                    <Td><span className="text-[0.75rem] text-ink-400">
                      {formatDateTime(r.started_at)}
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
          open onClose={() => setEditing(null)} size="lg"
          title={editing.id ? "Modifier l'automatisation" : 'Nouvelle automatisation'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
              <Button loading={saving} onClick={() => void save()}>Enregistrer</Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom" required className="sm:col-span-2">
              <Input required value={editing.name ?? ''}
                     onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea rows={2} value={editing.description ?? ''}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Type" required>
              <Select value={editing.kind ?? 'stock_alert'}
                      onChange={(e) => setEditing({ ...editing, kind: e.target.value as Automation['kind'] })}>
                {Object.entries(AUTOMATION_KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="Module Nexscope associé" hint="Facultatif selon le type">
              <Select value={editing.skill_slug ?? ''}
                      onChange={(e) => setEditing({ ...editing, skill_slug: e.target.value || null })}>
                <option value="">Aucun</option>
                {NEXSCOPE_SKILLS.filter((s) => s.engine_key).map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Planification (cron)" required
                   hint={`${describeCron(editing.schedule_cron ?? '0 7 * * 1')} — 5 champs : minute heure jour mois jour-semaine`}>
              <Input required className="font-mono" value={editing.schedule_cron ?? '0 7 * * 1'}
                     onChange={(e) => setEditing({ ...editing, schedule_cron: e.target.value })} />
            </Field>
            <Field label="Variation de prix maximale autorisée"
                   hint="0,08 = ±8 % par passe. Garde-fou appliqué par le moteur.">
              <Input type="number" step="0.01" min={0} max={0.5}
                     value={editing.max_price_change_pct ?? 0.08}
                     onChange={(e) => setEditing({ ...editing, max_price_change_pct: Number(e.target.value) })} />
            </Field>
            <Field label="Email de notification" className="sm:col-span-2"
                   hint="Laisser vide pour ne pas être notifié par email.">
              <Input type="email" value={editing.notify_email ?? ''}
                     onChange={(e) => setEditing({ ...editing, notify_email: e.target.value })} />
            </Field>
            <div className="sm:col-span-2 space-y-3">
              <Checkbox
                label="Exiger une approbation pour toute action sensible (recommandé)"
                checked={editing.requires_approval ?? true}
                onChange={(e) => setEditing({ ...editing, requires_approval: e.target.checked })}
              />
              <Checkbox
                label="Activer immédiatement"
                checked={editing.status === 'active'}
                onChange={(e) => setEditing({ ...editing, status: e.target.checked ? 'active' : 'paused' })}
              />
            </div>
            {editing.requires_approval === false && (
              <div className="sm:col-span-2">
                <Notice tone="warning" title="Approbation désactivée">
                  Même ainsi, cette plateforme n'applique jamais automatiquement un
                  changement de prix, un budget publicitaire ou une commande
                  fournisseur : la fonction d'application vérifie systématiquement
                  qu'une approbation a bien été accordée. Décocher cette case ne
                  réduit donc que les notifications pour les actions sans risque.
                </Notice>
              </div>
            )}
            {saveError && <div className="sm:col-span-2"><Notice tone="danger">{saveError}</Notice></div>}
          </div>
        </Modal>
      )}
    </AdminPage>
  );
}

/* ═════════════════════════════ Approbations ═══════════════════════════ */

function ApprovalCard({ approval }: { approval: ApprovalRequest }) {
  const decide = useDecideApproval();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = approval.payload as Record<string, unknown>;
  const changes = (payload?.changes as { sku?: string; name?: string; current_price?: number;
                   new_price?: number; change_pct?: number; reason?: string }[]) ?? [];
  const lines = (payload?.lines as { sku?: string; product_name?: string; variant_title?: string;
                 quantity?: number; unit_cost?: number }[]) ?? [];
  const expired = new Date(approval.expires_at) < new Date();

  async function act(decision: 'approved' | 'rejected') {
    setError(null);
    try {
      await decide.mutateAsync({ id: approval.id, decision, note: note || undefined });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Décision impossible.');
    }
  }

  return (
    <Card className={cn('p-5', approval.risk === 'high' && 'border-l-2 border-l-signal-danger')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={approval.risk === 'high' ? 'danger'
              : approval.risk === 'medium' ? 'warning' : 'neutral'}>
              Risque {approval.risk === 'high' ? 'élevé' : approval.risk === 'medium' ? 'moyen' : 'faible'}
            </Badge>
            <Badge tone="info">{ACTION_TYPE_LABEL[approval.action_type] ?? approval.action_type}</Badge>
            <Badge tone={
              approval.status === 'applied' ? 'success'
              : approval.status === 'rejected' ? 'danger'
              : approval.status === 'expired' || expired ? 'neutral' : 'warning'}>
              {expired && approval.status === 'pending'
                ? 'Expirée'
                : APPROVAL_STATUS_LABEL[approval.status]}
            </Badge>
          </div>

          <h3 className="mt-2.5 font-display text-[0.9375rem] text-ink">{approval.title}</h3>
          <p className="mt-1.5 whitespace-pre-line text-[0.8125rem] leading-relaxed text-ink-600">
            {approval.rationale}
          </p>

          {changes.length > 0 && (
            <div className="mt-3.5 overflow-hidden rounded border border-ivory-300">
              <Table>
                <thead>
                  <tr>
                    <Th>Référence</Th><Th>Produit</Th>
                    <Th align="right">Prix actuel</Th><Th align="right">Prix proposé</Th>
                    <Th align="right">Variation</Th>
                  </tr>
                </thead>
                <tbody>
                  {changes.slice(0, 20).map((c, i) => (
                    <tr key={i}>
                      <Td><span className="font-mono text-[0.75rem]">{c.sku ?? '—'}</span></Td>
                      <Td>{c.name ?? '—'}</Td>
                      <Td align="right">{c.current_price !== undefined ? formatPrice(c.current_price) : '—'}</Td>
                      <Td align="right">
                        <span className="font-medium">
                          {c.new_price !== undefined ? formatPrice(c.new_price) : '—'}
                        </span>
                      </Td>
                      <Td align="right">
                        {c.change_pct !== undefined && (
                          <span className={c.change_pct > 0 ? 'text-signal-success' : 'text-signal-warning'}>
                            {c.change_pct > 0 ? '+' : ''}{(c.change_pct * 100).toFixed(1)} %
                          </span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {changes.length > 20 && (
                <p className="px-4 py-2 text-[0.75rem] text-ink-400">
                  et {changes.length - 20} autre(s) ligne(s).
                </p>
              )}
            </div>
          )}

          {lines.length > 0 && (
            <div className="mt-3.5 overflow-hidden rounded border border-ivory-300">
              <Table>
                <thead>
                  <tr>
                    <Th>Référence</Th><Th>Produit</Th>
                    <Th align="right">Quantité</Th><Th align="right">Coût unitaire</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.slice(0, 20).map((l, i) => (
                    <tr key={i}>
                      <Td><span className="font-mono text-[0.75rem]">{l.sku ?? '—'}</span></Td>
                      <Td>{l.product_name} {l.variant_title && `— ${l.variant_title}`}</Td>
                      <Td align="right">{l.quantity ?? '—'}</Td>
                      <Td align="right">{l.unit_cost !== undefined ? formatPrice(l.unit_cost) : '—'}</Td>
                      <Td align="right">
                        {l.quantity && l.unit_cost !== undefined
                          ? formatPrice(l.quantity * l.unit_cost) : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}

          {approval.action_type === 'ad_budget_change' || approval.action_type === 'purchase_order'
            || approval.action_type === 'bulk_email' ? (
            <Notice tone="info" className="mt-3.5">
              Cette action s'exécute dans un système externe. L'approuver la marque
              comme traitée pour la traçabilité, sans rien déclencher automatiquement
              côté boutique : à vous de la réaliser chez le prestataire concerné.
            </Notice>
          ) : null}

          <p className="mt-3 text-[0.6875rem] text-ink-300">
            Créée {formatRelative(approval.created_at)} · expire le {formatDateTime(approval.expires_at)}
            {approval.decided_at && ` · décidée ${formatRelative(approval.decided_at)}`}
            {approval.applied_at && ` · appliquée ${formatRelative(approval.applied_at)}`}
          </p>

          {approval.apply_error && (
            <Notice tone="danger" className="mt-3" title="L'application a échoué">
              {approval.apply_error}
            </Notice>
          )}
          {approval.decision_note && (
            <p className="mt-2 rounded bg-ivory-200/60 px-3 py-2 text-[0.75rem] text-ink-600">
              Note : {approval.decision_note}
            </p>
          )}
        </div>

        {approval.status === 'pending' && !expired && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="secondary" icon={<X className="h-3.5 w-3.5" />}
                    onClick={() => { setOpen(true); }}>
              Décider
            </Button>
          </div>
        )}
      </div>

      {open && (
        <Modal
          open onClose={() => setOpen(false)}
          title="Décision sur une action sensible"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button variant="danger" loading={decide.isPending}
                      icon={<X className="h-3.5 w-3.5" />}
                      onClick={() => void act('rejected')}>
                Refuser
              </Button>
              <Button loading={decide.isPending} icon={<Check className="h-3.5 w-3.5" />}
                      onClick={() => void act('approved')}>
                Approuver et appliquer
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-[0.875rem] font-medium text-ink">{approval.title}</p>
            <Notice tone="warning" title="Ce que fait l'approbation">
              {approval.action_type.includes('price')
                ? 'Les nouveaux prix seront appliqués immédiatement et l\'ancien prix conservé dans l\'historique, ce qui permet de revenir en arrière.'
                : approval.action_type === 'inventory_adjustment'
                  ? 'Les niveaux de stock seront ajustés et chaque mouvement tracé avec son motif.'
                  : approval.action_type === 'discount_creation'
                    ? 'Le code de réduction sera créé avec les conditions décrites.'
                    : 'L\'action sera marquée comme traitée pour la traçabilité, sans exécution automatique côté boutique.'}
            </Notice>
            <Field label="Note de décision" hint="Conservée dans l'historique. Recommandée pour tracer votre raisonnement.">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
          </div>
        </Modal>
      )}
    </Card>
  );
}

export function ApprovalsPage() {
  const [status, setStatus] = useState<string | null>('pending');
  const { data: approvals, isLoading, error, refetch } = useApprovals(status);

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Automatisation"
        title="Approbations"
        description="Chaque action sensible proposée par un module ou une automatisation attend ici votre décision. Rien n'est appliqué sans elle."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ['pending', 'En attente'], ['approved', 'Approuvées'],
          ['applied', 'Appliquées'], ['rejected', 'Refusées'], [null, 'Toutes'],
        ].map(([value, label]) => (
          <Button
            key={String(value)} size="sm"
            variant={status === value ? 'primary' : 'secondary'}
            onClick={() => setStatus(value as string | null)}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : approvals?.length ? (
        <div className="space-y-4">
          {approvals.map((a) => <ApprovalCard key={a.id} approval={a} />)}
        </div>
      ) : (
        <EmptyState
          icon={<ShieldCheck className="h-9 w-9" />}
          title={status === 'pending' ? 'Aucune décision en attente' : 'Aucune demande'}
          description={status === 'pending'
            ? "Les modules et automatisations créeront ici leurs propositions d'action sensible. Vous décidez, puis l'application est tracée."
            : 'Aucune demande dans ce statut.'}
          action={
            <Link to="/admin/intelligence" className="link-underline text-sm font-medium">
              Lancer une analyse
            </Link>
          }
        />
      )}

      <Notice tone="info" className="mt-7" title="Comment le retour en arrière fonctionne">
        <RotateCcw className="mb-0.5 mr-1 inline h-3.5 w-3.5" aria-hidden />
        Pour un changement de prix, l'ancien prix est enregistré dans l'historique
        des prix avec la date, le motif et l'auteur de la décision. Pour un
        ajustement de stock, chaque mouvement est tracé. Vous pouvez donc toujours
        reconstituer l'état antérieur et le rétablir.
      </Notice>
    </AdminPage>
  );
}

/* ══════════════════════════════ Alertes ══════════════════════════════ */

export function AlertsPage() {
  const [includeResolved, setIncludeResolved] = useState(false);
  const { data: alerts, isLoading, error, refetch } = useAlerts(includeResolved);
  const resolve = useResolveAlert();

  const critical = (alerts ?? []).filter((a) => a.severity === 'critical');

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Pilotage"
        title="Alertes"
        description="Signaux détectés par les automatisations et par les opérations de la boutique : ruptures, seuils franchis, marges sous l'objectif."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Alertes ouvertes" value={String(alerts?.filter((a) => !a.is_resolved).length ?? 0)} />
        <StatTile label="Critiques" value={String(critical.length)}
                  tone={critical.length ? 'danger' : 'success'} />
        <StatTile label="Non lues" value={String(alerts?.filter((a) => !a.is_read).length ?? 0)} />
      </div>

      <div className="mb-5">
        <Button size="sm" variant={includeResolved ? 'primary' : 'secondary'}
                onClick={() => setIncludeResolved(!includeResolved)}>
          {includeResolved ? 'Masquer les alertes traitées' : 'Afficher les alertes traitées'}
        </Button>
      </div>

      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : null} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingBlock />
      ) : alerts?.length ? (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.id}>
              <Card className={cn('p-4', a.is_resolved && 'opacity-60')}>
                <div className="flex items-start gap-3.5">
                  <AlertTriangle
                    className={cn('mt-0.5 h-4 w-4 shrink-0',
                      a.severity === 'critical' ? 'text-signal-danger'
                      : a.severity === 'warning' ? 'text-signal-warning' : 'text-signal-info')}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[0.875rem] font-semibold text-ink">{a.title}</p>
                      <Badge tone={a.severity === 'critical' ? 'danger'
                        : a.severity === 'warning' ? 'warning' : 'info'}>
                        {ALERT_KIND_LABEL[a.kind] ?? a.kind}
                      </Badge>
                      {a.is_resolved && <Badge tone="neutral">Traitée</Badge>}
                    </div>
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-600">{a.message}</p>
                    <p className="mt-1.5 text-[0.6875rem] text-ink-300">
                      {formatRelative(a.created_at)}
                    </p>
                  </div>
                  {!a.is_resolved && (
                    <Button size="sm" variant="ghost" icon={<Check className="h-3.5 w-3.5" />}
                            onClick={() => resolve.mutate(a.id)}>
                      Marquer traitée
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={includeResolved ? 'Aucune alerte' : 'Aucune alerte ouverte'}
          description="Les ruptures de stock, les seuils franchis et les écarts de marge apparaîtront ici."
        />
      )}
    </AdminPage>
  );
}
