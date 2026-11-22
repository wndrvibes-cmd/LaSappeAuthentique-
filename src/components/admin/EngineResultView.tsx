/**
 * Rendu d'un résultat de moteur Nexscope.
 *
 * Même présentation pour les treize moteurs : verdict, indicateurs,
 * constats, recommandations (avec le bouton d'approbation quand l'action
 * est sensible), tableaux de détail, puis — toujours — la liste explicite
 * des données manquantes.
 */
import { useState } from 'react';
import { ArrowRight, Check, Download, Info, ShieldAlert, TriangleAlert, XCircle } from 'lucide-react';
import type { EngineResult, Finding, Metric, Recommendation } from '@/lib/nexscope/types';
import { Badge, Button, Card, CardHeader, Notice, StatusBadge, Table, Td, Th } from '@/components/ui';
import { downloadCsv } from '@/lib/utils';
import { cn } from '@/lib/utils';

function MetricCard({ metric }: { metric: Metric }) {
  const tones = {
    healthy: 'text-signal-success', warning: 'text-signal-warning',
    danger: 'text-signal-danger', loss: 'text-signal-danger',
  } as const;
  const unit = metric.unit === '€' ? ' €' : metric.unit === '%' ? ' %'
    : metric.unit === 'j' ? ' j' : metric.unit === '/100' ? ' / 100'
    : metric.unit === 'x' ? '×' : metric.unit === 'u' ? '' : '';
  const value = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(metric.value);

  return (
    <div className="rounded border border-ivory-300 bg-white p-3.5">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
        {metric.label}
      </p>
      <p className={cn('mt-1.5 font-display text-xl font-semibold tabular',
                       metric.status ? tones[metric.status] : 'text-ink')}>
        {value}{unit}
      </p>
      {metric.benchmark !== undefined && (
        <p className="mt-0.5 text-[0.6875rem] tabular text-ink-400">
          référence {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(metric.benchmark)}{unit}
        </p>
      )}
      {metric.hint && <p className="mt-1.5 text-[0.625rem] leading-snug text-ink-400">{metric.hint}</p>}
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const config = {
    critical: { icon: XCircle, cls: 'text-signal-danger', box: 'border-signal-danger/20 bg-bordeaux-soft/40' },
    warning: { icon: TriangleAlert, cls: 'text-signal-warning', box: 'border-signal-warning/25 bg-brass-soft/40' },
    info: { icon: Info, cls: 'text-signal-info', box: 'border-ivory-300 bg-ivory-200/40' },
  }[finding.severity];
  const Icon = config.icon;

  return (
    <li className={cn('rounded border px-4 py-3', config.box)}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.cls)} aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-ink">{finding.title}</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-600">{finding.detail}</p>
          {finding.impact && (
            <p className="mt-1.5 text-[0.75rem] font-medium tabular text-ink">
              Impact chiffré : {finding.impact}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function RecommendationRow({
  recommendation, onRequestApproval, approvalBusy,
}: {
  recommendation: Recommendation;
  onRequestApproval?: (r: Recommendation) => void;
  approvalBusy?: boolean;
}) {
  const priorityTone = { 1: 'danger', 2: 'warning', 3: 'neutral' } as const;
  return (
    <li className="rounded border border-ivory-300 bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={priorityTone[recommendation.priority]}>
              Priorité {recommendation.priority}
            </Badge>
            {recommendation.requiresApproval && (
              <Badge tone="brass" icon={<ShieldAlert className="h-3 w-3" />}>
                Approbation requise
              </Badge>
            )}
          </div>
          <p className="mt-2 text-[0.875rem] font-semibold text-ink">{recommendation.title}</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-600">{recommendation.detail}</p>
        </div>
        {recommendation.requiresApproval && onRequestApproval && (
          <Button
            size="sm" variant="secondary" loading={approvalBusy}
            icon={<ArrowRight className="h-3.5 w-3.5" />}
            onClick={() => onRequestApproval(recommendation)}
          >
            Soumettre à approbation
          </Button>
        )}
      </div>
    </li>
  );
}

export function EngineResultView({
  result, onRequestApproval, approvalBusy, approvalFeedback,
}: {
  result: EngineResult;
  onRequestApproval?: (r: Recommendation) => void;
  approvalBusy?: boolean;
  approvalFeedback?: { tone: 'success' | 'danger'; text: string } | null;
}) {
  const [openTable, setOpenTable] = useState(0);

  return (
    <div className="space-y-6">
      {/* Verdict */}
      <Card className="overflow-hidden">
        <div className="border-b border-ivory-300 bg-ivory-200/50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg text-ink">{result.title}</h2>
              <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-600">{result.summary}</p>
            </div>
            <StatusBadge status={result.status} />
          </div>
        </div>

        {result.metrics.length > 0 && (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.metrics.map((m) => <MetricCard key={m.key} metric={m} />)}
          </div>
        )}
      </Card>

      {/* Constats */}
      {result.findings.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-base text-ink">
            Constats <span className="font-sans text-[0.8125rem] font-normal text-ink-400">
              ({result.findings.length})
            </span>
          </h3>
          <ul className="space-y-2.5">
            {result.findings.map((f, i) => <FindingRow key={i} finding={f} />)}
          </ul>
        </section>
      )}

      {/* Recommandations */}
      {result.recommendations.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-base text-ink">Actions recommandées</h3>
          {approvalFeedback && (
            <Notice tone={approvalFeedback.tone} className="mb-3">{approvalFeedback.text}</Notice>
          )}
          <ul className="space-y-2.5">
            {[...result.recommendations]
              .sort((a, b) => a.priority - b.priority)
              .map((r, i) => (
                <RecommendationRow
                  key={i} recommendation={r}
                  onRequestApproval={onRequestApproval}
                  approvalBusy={approvalBusy}
                />
              ))}
          </ul>
          {result.recommendations.some((r) => r.requiresApproval) && (
            <Notice tone="info" className="mt-3">
              Les actions marquées « approbation requise » ne sont jamais appliquées
              automatiquement. Les soumettre crée une demande que vous validez ou
              refusez depuis la page <strong>Approbations</strong>, avec conservation
              de l'état antérieur pour pouvoir revenir en arrière.
            </Notice>
          )}
        </section>
      )}

      {/* Tableaux */}
      {result.tables.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {result.tables.map((t, i) => (
              <button
                key={t.title}
                type="button"
                onClick={() => setOpenTable(i)}
                className={cn(
                  'rounded border px-3 py-1.5 text-[0.75rem] font-medium transition-colors',
                  openTable === i
                    ? 'border-ink bg-ink text-ivory'
                    : 'border-ivory-400 text-ink-600 hover:border-ink/40',
                )}
              >
                {t.title}
              </button>
            ))}
          </div>

          {result.tables[openTable] && (
            <Card>
              <CardHeader
                title={result.tables[openTable].title}
                action={
                  <Button
                    size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />}
                    onClick={() => downloadCsv(
                      `${result.engineKey}-${result.tables[openTable].title.toLowerCase().replace(/\s+/g, '-')}`,
                      result.tables[openTable].rows,
                    )}
                  >
                    CSV
                  </Button>
                }
              />
              <Table>
                <thead>
                  <tr>
                    {result.tables[openTable].columns.map((c) => (
                      <Th key={c.key} align={c.align}>{c.label}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.tables[openTable].rows.map((row, ri) => (
                    <tr key={ri}>
                      {result.tables[openTable].columns.map((c) => (
                        <Td key={c.key} align={c.align}>{row[c.key] ?? '—'}</Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {result.tables[openTable].note && (
                <p className="border-t border-ivory-200 px-5 py-3 text-[0.75rem] leading-relaxed text-ink-400">
                  {result.tables[openTable].note}
                </p>
              )}
            </Card>
          )}
        </section>
      )}

      {/* Données manquantes — toujours affichées, jamais masquées */}
      {result.dataGaps.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-base text-ink">Ce qui limite cette analyse</h3>
          <ul className="space-y-2">
            {result.dataGaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded border border-ivory-300 bg-ivory-200/40 px-4 py-3">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                <p className="text-[0.8125rem] leading-relaxed text-ink-600">{gap}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.dataGaps.length === 0 && (
        <p className="flex items-center gap-2 text-[0.8125rem] text-signal-success">
          <Check className="h-4 w-4" aria-hidden />
          Analyse complète : toutes les données nécessaires étaient disponibles.
        </p>
      )}
    </div>
  );
}
