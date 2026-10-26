import type { Campaign, Id, Npc, PlayerCharacter, Quest, Session, StatDefinition, Stats } from './types';

const pick = <T extends { id: Id }>(items: T[], ids: Id[]): T[] =>
  ids.flatMap((id) => items.find((item) => item.id === id) ?? []);

export const getQuest = (c: Campaign, id: Id): Quest | undefined =>
  c.quests.find((q) => q.id === id);

export const getNpc = (c: Campaign, id: Id): Npc | undefined =>
  c.npcs.find((n) => n.id === id);

export const statsFor = (c: Campaign, stats: Stats | undefined): { def: StatDefinition; value: number }[] =>
  c.statDefinitions.flatMap((def) => (stats && def.id in stats ? [{ def, value: stats[def.id] }] : []));

export const countStatValues = (c: Campaign, statId: Id): number =>
  [...c.characters, ...c.npcs].filter((x) => x.stats && statId in x.stats).length;

/** Display names: the chosen option's name, or the character's free text. */
export const raceLabel = (c: Campaign, p: PlayerCharacter): string =>
  (p.raceId && c.races.find((r) => r.id === p.raceId)?.name) || p.race;

export const classLabel = (c: Campaign, p: PlayerCharacter): string =>
  (p.classId && c.classes.find((o) => o.id === p.classId)?.name) || p.characterClass;

export const countCharactersWithRace = (c: Campaign, id: Id): number =>
  c.characters.filter((p) => p.raceId === id).length;

export const countCharactersWithClass = (c: Campaign, id: Id): number =>
  c.characters.filter((p) => p.classId === id).length;

export const charactersForSession = (c: Campaign, s: Session): PlayerCharacter[] =>
  pick(c.characters, s.characterIds);

export const sessionsForCharacter = (c: Campaign, characterId: Id): Session[] =>
  c.sessions.filter((s) => s.characterIds.includes(characterId));

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
