import type { Campaign, Id, Npc, Quest, Session } from './types';

const pick = <T extends { id: Id }>(items: T[], ids: Id[]): T[] =>
  ids.flatMap((id) => items.find((item) => item.id === id) ?? []);

export const getQuest = (c: Campaign, id: Id): Quest | undefined =>
  c.quests.find((q) => q.id === id);

export const getNpc = (c: Campaign, id: Id): Npc | undefined =>
  c.npcs.find((n) => n.id === id);

export const questsForSession = (c: Campaign, s: Session): Quest[] =>
  pick(c.quests, s.questIds);

export const npcsForSession = (c: Campaign, s: Session): Npc[] =>
  pick(c.npcs, s.npcIds);

export const sessionsForQuest = (c: Campaign, questId: Id): Session[] =>
  c.sessions.filter((s) => s.questIds.includes(questId));

export const sessionsForNpc = (c: Campaign, npcId: Id): Session[] =>
  c.sessions.filter((s) => s.npcIds.includes(npcId));

export const questsForNpc = (c: Campaign, npcId: Id): Quest[] =>
  c.quests.filter((q) => q.giverNpcId === npcId);

export const activeQuests = (c: Campaign): Quest[] =>
  c.quests.filter((q) => q.status === 'active');

export const dependentQuests = (c: Campaign, questId: Id): Quest[] =>
  c.quests.filter((q) => q.prerequisiteQuestIds.includes(questId));

export const latestSession = (c: Campaign): Session | undefined =>
  [...c.sessions].sort((a, b) => b.number - a.number)[0];
