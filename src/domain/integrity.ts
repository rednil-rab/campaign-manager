import type { Campaign, Id } from './types';

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

/** Drops references to records that no longer exist. */
export function sanitizeCampaign(c: Campaign): Campaign {
  const questIds = new Set<Id>(c.quests.map((q) => q.id));
  const npcIds = new Set<Id>(c.npcs.map((n) => n.id));
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
    })),
  };
}
