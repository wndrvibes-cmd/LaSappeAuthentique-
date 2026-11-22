/**
 * Point d'entrée du moteur Nexscope côté application.
 *
 * Croise le registre généré depuis le dépôt (162 modules) avec les moteurs
 * de calcul déterministes disponibles localement.
 */
import { NEXSCOPE_CATEGORIES, NEXSCOPE_SKILLS, NEXSCOPE_SKILL_COUNT, NEXSCOPE_SOURCE_REPO } from './skills.generated';
import { ENGINES, getEngine, type EngineInfo } from './engines';
import type { NexscopeSkillMeta } from './types';

export { NEXSCOPE_SKILLS, NEXSCOPE_CATEGORIES, NEXSCOPE_SKILL_COUNT, NEXSCOPE_SOURCE_REPO, ENGINES, getEngine };
export type { NexscopeSkillMeta, EngineInfo };

const BY_SLUG = new Map(NEXSCOPE_SKILLS.map((s) => [s.slug, s]));

export function getSkill(slug: string): NexscopeSkillMeta | null {
  return BY_SLUG.get(slug) ?? null;
}

export function skillsByCategory(): Record<string, NexscopeSkillMeta[]> {
  const out: Record<string, NexscopeSkillMeta[]> = {};
  for (const s of NEXSCOPE_SKILLS) (out[s.category] ??= []).push(s);
  for (const list of Object.values(out)) list.sort((a, b) => a.position - b.position);
  return out;
}

export function coreSkills(): NexscopeSkillMeta[] {
  return NEXSCOPE_SKILLS.filter((s) => s.is_core).sort((a, b) => a.position - b.position);
}

/** Modules qui tournent entièrement en local, sans aucune clé API. */
export function offlineCapableSkills(): NexscopeSkillMeta[] {
  return NEXSCOPE_SKILLS.filter((s) => s.engine_key !== null && !s.requires_external_data);
}

export function searchSkills(query: string): NexscopeSkillMeta[] {
  const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!q) return NEXSCOPE_SKILLS;
  return NEXSCOPE_SKILLS.filter((s) =>
    `${s.slug} ${s.name} ${s.category} ${s.description} ${s.platform ?? ''}`
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .includes(q));
}

/** URL du SKILL.md d'origine, pour consultation directe de la source. */
export function skillSourceUrl(skill: NexscopeSkillMeta): string {
  return `${NEXSCOPE_SOURCE_REPO}/blob/main/${skill.source_path}/SKILL.md`;
}

export interface RegistryStats {
  total: number;
  withEngine: number;
  withScripts: number;
  requiringExternalData: number;
  categories: number;
  engines: number;
}

export function registryStats(): RegistryStats {
  return {
    total: NEXSCOPE_SKILLS.length,
    withEngine: NEXSCOPE_SKILLS.filter((s) => s.engine_key).length,
    withScripts: NEXSCOPE_SKILLS.filter((s) => s.has_scripts).length,
    requiringExternalData: NEXSCOPE_SKILLS.filter((s) => s.requires_external_data).length,
    categories: NEXSCOPE_CATEGORIES.length,
    engines: Object.keys(ENGINES).length,
  };
}

/** Modules disponibles pour un moteur donné. */
export function skillsUsingEngine(engineKey: string): NexscopeSkillMeta[] {
  return NEXSCOPE_SKILLS.filter((s) => s.engine_key === engineKey);
}
