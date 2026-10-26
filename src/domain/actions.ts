import type { Campaign, Id, Npc, PlayerCharacter, Quest, Session, StatDefinition, Stats } from './types';

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

const MAX_STAT_VALUE = 100000;

function validateStats(c: Campaign, stats: Stats): void {
  for (const [id, value] of Object.entries(stats)) {
    const def = c.statDefinitions.find((d) => d.id === id);
    if (!def) throw new DomainError(`Unknown stat: ${id}`);
    if (!Number.isInteger(value) || Math.abs(value) > MAX_STAT_VALUE) {
      throw new DomainError(`${def.name} must be a whole number between -${MAX_STAT_VALUE} and ${MAX_STAT_VALUE}`);
    }
  }
}

export function upsertStatDefinition(c: Campaign, def: StatDefinition): Campaign {
  const name = def.name.trim();
  if (!name) throw new DomainError('A stat needs a name');
  const clash = c.statDefinitions.some((d) => d.id !== def.id && d.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new DomainError(`A stat named "${name}" already exists`);
  return { ...c, statDefinitions: upsert(c.statDefinitions, { ...def, name }) };
}

const withoutStat = (stats: Stats, id: Id): Stats => {
  const { [id]: _removed, ...rest } = stats;
  return rest;
};

export function deleteStatDefinition(c: Campaign, id: Id): Campaign {
  return {
    ...c,
    statDefinitions: c.statDefinitions.filter((d) => d.id !== id),
    characters: c.characters.map((p) => ({ ...p, stats: withoutStat(p.stats, id) })),
    npcs: c.npcs.map((n) => (n.stats ? { ...n, stats: withoutStat(n.stats, id) } : n)),
  };
}

export function upsertNpc(c: Campaign, npc: Npc): Campaign {
  if (npc.stats) validateStats(c, npc.stats);
  return { ...c, npcs: upsert(c.npcs, npc) };
}

export function upsertCharacter(c: Campaign, character: PlayerCharacter): Campaign {
  validateStats(c, character.stats);
  return { ...c, characters: upsert(c.characters, character) };
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
  const missingCharacter = session.characterIds.find((id) => !c.characters.some((p) => p.id === id));
  if (missingCharacter) throw new DomainError(`Unknown character: ${missingCharacter}`);
  return { ...c, sessions: upsert(c.sessions, session) };
}

export function deleteCharacter(c: Campaign, id: Id): Campaign {
  return {
    ...c,
    characters: c.characters.filter((p) => p.id !== id),
    sessions: c.sessions.map((s) => ({ ...s, characterIds: without(s.characterIds, id) })),
  };
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
