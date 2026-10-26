import type { Campaign, Id, Stats } from './types';

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

/** Minimal shape check for data read from untrusted storage. */
export function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    isArray(c.sessions) &&
    isArray(c.quests) &&
    isArray(c.npcs)
  );
}

/**
 * Drops references to records that no longer exist and fills fields added
 * after earlier versions were saved (characters, session attendance).
 */
export function sanitizeCampaign(raw: Campaign): Campaign {
  const statDefinitions = (raw.statDefinitions ?? []).filter(
    (d) => d && typeof d.id === 'string' && typeof d.name === 'string',
  );
  const statIds = new Set<Id>(statDefinitions.map((d) => d.id));
  const cleanStats = (stats: unknown): Stats =>
    Object.fromEntries(
      Object.entries(stats && typeof stats === 'object' ? stats : {}).filter(
        ([id, v]) => statIds.has(id) && typeof v === 'number' && Number.isFinite(v),
      ),
    );
  const c = {
    ...raw,
    statDefinitions,
    characters: (raw.characters ?? []).map((p) => ({ ...p, stats: cleanStats(p.stats) })),
    npcs: raw.npcs.map((n) => (n.stats ? { ...n, stats: cleanStats(n.stats) } : n)),
  };
  const questIds = new Set<Id>(c.quests.map((q) => q.id));
  const npcIds = new Set<Id>(c.npcs.map((n) => n.id));
  const characterIds = new Set<Id>(c.characters.map((p) => p.id));
  return {
    ...c,
    quests: c.quests.map((q) => ({
      ...q,
      giverNpcId: q.giverNpcId && npcIds.has(q.giverNpcId) ? q.giverNpcId : undefined,
      prerequisiteQuestIds: q.prerequisiteQuestIds.filter((id) => id !== q.id && questIds.has(id)),
    })),
    sessions: c.sessions.map((s) => ({
      ...s,
      questIds: s.questIds.filter((id) => questIds.has(id)),
      npcIds: s.npcIds.filter((id) => npcIds.has(id)),
      characterIds: (s.characterIds ?? []).filter((id) => characterIds.has(id)),
    })),
  };
}
