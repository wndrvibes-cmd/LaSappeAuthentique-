import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Brain, Calculator, Cpu, ExternalLink, Filter, KeyRound, Search, Sparkles } from 'lucide-react';
import { ENGINES, NEXSCOPE_CATEGORIES, NEXSCOPE_SOURCE_REPO, registryStats, searchSkills,
         skillSourceUrl } from '@/lib/nexscope/registry';
import type { NexscopeSkillMeta } from '@/lib/nexscope/types';
import { AdminHeader, AdminPage, StatTile } from '@/components/admin/AdminLayout';
import { Badge, Button, Card, Input, Notice, Select } from '@/components/ui';
import { cn } from '@/lib/utils';

const MODE_LABEL = {
  engine: 'Calcul local',
  hybrid: 'Calcul + analyse',
  reasoning: 'Analyse rédigée',
} as const;

const MODE_HELP = {
  engine: "Un algorithme s'exécute dans l'application sur vos données réelles. Aucune clé API, résultat reproductible.",
  hybrid: "Un algorithme calcule les chiffres sur vos données réelles. L'analyse rédigée qui les interprète nécessite une clé Anthropic.",
  reasoning: "Les instructions réelles du module sont envoyées au modèle avec vos données. Nécessite une clé Anthropic.",
} as const;

function SkillCard({ skill }: { skill: NexscopeSkillMeta }) {
  const engine = skill.engine_key ? ENGINES[skill.engine_key] : null;

  return (
    <Card className="flex h-full flex-col p-4 transition-shadow duration-300 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[0.9375rem] leading-snug text-ink">
            {skill.emoji && <span className="mr-1.5">{skill.emoji}</span>}
            {skill.name}
          </h3>
          <p className="mt-0.5 text-[0.6875rem] uppercase tracking-wider text-ink-400">
            {skill.platform ?? 'tous canaux'}
          </p>
        </div>
        {skill.is_core && <Badge tone="brass">Cœur</Badge>}
      </div>

      <p className="mt-2.5 line-clamp-3 flex-1 text-[0.8125rem] leading-relaxed text-ink-500">
        {skill.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={skill.execution_mode === 'reasoning' ? 'info' : 'success'}
               icon={skill.execution_mode === 'reasoning'
                 ? <Sparkles className="h-3 w-3" />
                 : <Calculator className="h-3 w-3" />}>
          {MODE_LABEL[skill.execution_mode]}
        </Badge>
        {skill.requires_external_data && (
          <Badge tone="warning" icon={<KeyRound className="h-3 w-3" />}>Données externes</Badge>
        )}
        {skill.has_scripts && <Badge tone="neutral">Script d'origine porté</Badge>}
      </div>

      {engine && (
        <p className="mt-2.5 text-[0.6875rem] leading-snug text-ink-400">
          Moteur : <span className="font-medium text-ink-600">{engine.label}</span>
        </p>
      )}

      {skill.requires_external_data && skill.external_data_note && (
        <p className="mt-2 rounded bg-brass-soft/50 px-2.5 py-2 text-[0.6875rem] leading-snug text-ink-600">
          {skill.external_data_note}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-ivory-200 pt-3">
        <Link
          to={`/admin/intelligence/${skill.slug}`}
          className="flex-1 rounded bg-ink px-3 py-2 text-center text-[0.75rem] font-medium text-ivory transition-colors hover:bg-ink-800"
        >
          Ouvrir le module
        </Link>
        <a
          href={skillSourceUrl(skill)}
          target="_blank" rel="noreferrer noopener"
          title="Voir le SKILL.md d'origine"
          className="rounded border border-ivory-400 p-2 text-ink-400 transition-colors hover:border-ink/40 hover:text-ink"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </Card>
  );
}

export function IntelligencePage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const category = params.get('categorie');
  const mode = params.get('mode');
  const engineFilter = params.get('moteur');
  const onlyCore = params.get('coeur') === '1';
  const onlyOffline = params.get('local') === '1';

  const stats = registryStats();

  const filtered = useMemo(() => {
    let list = searchSkills(query);
    if (category) list = list.filter((s) => s.category === category);
    if (mode) list = list.filter((s) => s.execution_mode === mode);
    if (engineFilter) list = list.filter((s) => s.engine_key === engineFilter);
    if (onlyCore) list = list.filter((s) => s.is_core);
    if (onlyOffline) list = list.filter((s) => s.engine_key && !s.requires_external_data);
    return list;
  }, [query, category, mode, engineFilter, onlyCore, onlyOffline]);

  const byCategory = useMemo(() => {
    const map = new Map<string, NexscopeSkillMeta[]>();
    for (const s of filtered) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <AdminPage>
      <AdminHeader
        eyebrow="Intelligence commerciale"
        title="Modules Nexscope"
        description={
          <>
            Les {stats.total} compétences du dépôt{' '}
            <a href={NEXSCOPE_SOURCE_REPO} target="_blank" rel="noreferrer noopener"
               className="link-underline font-medium text-ink">
              nexscope-ai/eCommerce-Skills
            </a>{' '}
            sont enregistrées comme modules exploitables. {stats.withEngine} d'entre
            elles s'appuient sur l'un des {stats.engines} moteurs de calcul portés dans
            l'application : ils travaillent sur vos données réelles, sans clé API.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Modules enregistrés" value={String(stats.total)}
                  hint="Inventaire complet du dépôt" icon={<Brain className="h-4 w-4" />} />
        <StatTile label="Moteurs de calcul" value={String(stats.engines)}
                  hint={`${stats.withEngine} modules les utilisent`} tone="success"
                  icon={<Cpu className="h-4 w-4" />} />
        <StatTile label="Scripts d'origine portés" value={String(stats.withScripts)}
                  hint="Algorithmes Python traduits en TypeScript"
                  icon={<Calculator className="h-4 w-4" />} />
        <StatTile label="Dépendent de données externes" value={String(stats.requiringExternalData)}
                  hint="Connexion à préciser avant usage" tone="warning"
                  icon={<KeyRound className="h-4 w-4" />} />
      </div>

      {/* Filtres */}
      <div className="mt-7 flex flex-wrap items-end gap-3 rounded-lg border border-ivory-300 bg-white p-4">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-ink-400" aria-hidden />
          <Input className="pl-9" placeholder="Rechercher un module…"
                 value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select className="w-auto" value={category ?? ''}
                onChange={(e) => setParam('categorie', e.target.value || null)}
                aria-label="Filtrer par catégorie">
          <option value="">Toutes les catégories</option>
          {NEXSCOPE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select className="w-auto" value={mode ?? ''}
                onChange={(e) => setParam('mode', e.target.value || null)}
                aria-label="Filtrer par mode d'exécution">
          <option value="">Tous les modes</option>
          <option value="engine">Calcul local</option>
          <option value="hybrid">Calcul + analyse</option>
          <option value="reasoning">Analyse rédigée</option>
        </Select>
        <Button
          size="sm" variant={onlyCore ? 'primary' : 'secondary'}
          onClick={() => setParam('coeur', onlyCore ? null : '1')}
        >
          Modules cœur
        </Button>
        <Button
          size="sm" variant={onlyOffline ? 'primary' : 'secondary'}
          icon={<Filter className="h-3.5 w-3.5" />}
          onClick={() => setParam('local', onlyOffline ? null : '1')}
        >
          Sans clé API
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-ink-400">
          {filtered.length} module{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
          {engineFilter && ENGINES[engineFilter] && ` · moteur « ${ENGINES[engineFilter].label} »`}
        </p>
        {(category || mode || engineFilter || onlyCore || onlyOffline || query) && (
          <Button size="sm" variant="ghost" onClick={() => { setParams({}, { replace: true }); setQuery(''); }}>
            Réinitialiser les filtres
          </Button>
        )}
      </div>

      {/* Explication des modes */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {(['engine', 'hybrid', 'reasoning'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setParam('mode', mode === m ? null : m)}
            className={cn(
              'rounded-lg border p-3.5 text-left transition-colors',
              mode === m ? 'border-ink bg-ink/[0.02]' : 'border-ivory-300 bg-white hover:border-ink/30',
            )}
          >
            <p className="text-[0.8125rem] font-semibold text-ink">{MODE_LABEL[m]}</p>
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{MODE_HELP[m]}</p>
          </button>
        ))}
      </div>

      {/* Modules par catégorie */}
      {byCategory.length ? (
        <div className="mt-9 space-y-10">
          {byCategory.map(([cat, skills]) => (
            <section key={cat}>
              <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-ivory-300 pb-2.5">
                <h2 className="font-display text-lg text-ink">{cat}</h2>
                <span className="text-[0.75rem] text-ink-400">{skills.length} module(s)</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {skills.map((s) => <SkillCard key={s.slug} skill={s} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Notice tone="info" className="mt-9">
          Aucun module ne correspond à ces critères. Élargissez la recherche ou
          réinitialisez les filtres.
        </Notice>
      )}
    </AdminPage>
  );
}
