import type { Campaign, Id, Npc, Quest, Session } from './types';

export class DomainError extends Error {}

const upsert = <T extends { id: Id }>(items: T[], item: T): T[] =>
  items.some((i) => i.id === item.id)
    ? items.map((i) => (i.id === item.id ? item : i))
    : [...items, item];

const without = (ids: Id[], id: Id): Id[] => ids.filter((x) => x !== id);

/** True if following prerequisites from `quest` leads back to itself. */
const createsCycle = (quests: Quest[], quest: Quest): boolean => {
  const byId = new Map(quests.map((q) => [q.id, q]));
  const seen = new Set<Id>();
  const stack = [...quest.prerequisiteQuestIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === quest.id) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.prerequisiteQuestIds ?? []));
  }
  return false;
};

export function upsertNpc(c: Campaign, npc: Npc): Campaign {
  return { ...c, npcs: upsert(c.npcs, npc) };
}

export function upsertQuest(c: Campaign, quest: Quest): Campaign {
  const known = new Set(c.quests.map((q) => q.id));
  if (quest.giverNpcId && !c.npcs.some((n) => n.id === quest.giverNpcId)) {
    throw new DomainError(`Unknown giver NPC: ${quest.giverNpcId}`);
  }
  for (const id of quest.prerequisiteQuestIds) {
    if (id === quest.id) throw new DomainError('A quest cannot require itself');
    if (!known.has(id)) throw new DomainError(`Unknown prerequisite quest: ${id}`);
  }
  const quests = upsert(c.quests, quest);
  if (createsCycle(quests, quest)) {
    throw new DomainError('Prerequisites would create a cycle');
  }
  return { ...c, quests };
}

export function upsertSession(c: Campaign, session: Session): Campaign {
  const missingQuest = session.questIds.find((id) => !c.quests.some((q) => q.id === id));
  if (missingQuest) throw new DomainError(`Unknown quest: ${missingQuest}`);
  const missingNpc = session.npcIds.find((id) => !c.npcs.some((n) => n.id === id));
  if (missingNpc) throw new DomainError(`Unknown NPC: ${missingNpc}`);
  return { ...c, sessions: upsert(c.sessions, session) };
}

export function deleteNpc(c: Campaign, id: Id): Campaign {
  return {
    ...c,
    npcs: c.npcs.filter((n) => n.id !== id),
    quests: c.quests.map((q) => (q.giverNpcId === id ? { ...q, giverNpcId: undefined } : q)),
    sessions: c.sessions.map((s) => ({ ...s, npcIds: without(s.npcIds, id) })),
  };
}

export function deleteQuest(c: Campaign, id: Id): Campaign {
  return {
    ...c,
    quests: c.quests
      .filter((q) => q.id !== id)
      .map((q) => ({ ...q, prerequisiteQuestIds: without(q.prerequisiteQuestIds, id) })),
    sessions: c.sessions.map((s) => ({ ...s, questIds: without(s.questIds, id) })),
  };
}

export function deleteSession(c: Campaign, id: Id): Campaign {
  return { ...c, sessions: c.sessions.filter((s) => s.id !== id) };
}
