import { describe, expect, it } from 'vitest';
import { ashenCrown } from '../data/ashenCrown';
import {
  DomainError,
  deleteCharacter,
  deleteNpc,
  deleteQuest,
  deleteSession,
  deleteStatDefinition,
  upsertCharacter,
  upsertNpc,
  upsertQuest,
  upsertSession,
  upsertStatDefinition,
} from './actions';
import { isCampaign, sanitizeCampaign } from './integrity';
import { countStatValues } from './selectors';

describe('deleteNpc', () => {
  const result = deleteNpc(ashenCrown, 'npc-mirelle');

  it('removes the NPC and every reference to it', () => {
    expect(result.npcs.some((n) => n.id === 'npc-mirelle')).toBe(false);
    expect(result.sessions.every((s) => !s.npcIds.includes('npc-mirelle'))).toBe(true);
    expect(result.quests.every((q) => q.giverNpcId !== 'npc-mirelle')).toBe(true);
  });

  it('does not mutate the input', () => {
    expect(ashenCrown.npcs).toHaveLength(4);
  });
});

describe('deleteQuest', () => {
  it('removes the quest from sessions and prerequisites', () => {
    const result = deleteQuest(ashenCrown, 'quest-letter');
    expect(result.quests.some((q) => q.id === 'quest-letter')).toBe(false);
    expect(result.quests.every((q) => !q.prerequisiteQuestIds.includes('quest-letter'))).toBe(true);
    expect(result.sessions.every((s) => !s.questIds.includes('quest-letter'))).toBe(true);
  });
});

describe('deleteSession', () => {
  it('removes only the session', () => {
    const result = deleteSession(ashenCrown, 'session-1');
    expect(result.sessions).toHaveLength(2);
    expect(result.quests).toEqual(ashenCrown.quests);
  });
});

describe('upsertQuest', () => {
  const crown = ashenCrown.quests.find((q) => q.id === 'quest-crown')!;
  const letter = ashenCrown.quests.find((q) => q.id === 'quest-letter')!;

  it('rejects self-prerequisites, unknown references and cycles', () => {
    expect(() => upsertQuest(ashenCrown, { ...crown, prerequisiteQuestIds: ['quest-crown'] })).toThrow(DomainError);
    expect(() => upsertQuest(ashenCrown, { ...crown, giverNpcId: 'nope' })).toThrow(DomainError);
    expect(() => upsertQuest(ashenCrown, { ...letter, prerequisiteQuestIds: ['quest-crown'] })).toThrow(
      /cycle/,
    );
  });

  it('updates an existing quest in place', () => {
    const result = upsertQuest(ashenCrown, { ...crown, title: 'Renamed' });
    expect(result.quests).toHaveLength(4);
    expect(result.quests.find((q) => q.id === 'quest-crown')?.title).toBe('Renamed');
  });
});

describe('upsertSession', () => {
  it('rejects unknown references', () => {
    const s = { ...ashenCrown.sessions[0], questIds: ['ghost'] };
    expect(() => upsertSession(ashenCrown, s)).toThrow(DomainError);
  });
});

describe('integrity', () => {
  it('sanitizes dangling references', () => {
    const dirty = {
      ...ashenCrown,
      sessions: [{ ...ashenCrown.sessions[0], questIds: ['ghost'], npcIds: ['ghost'] }],
    };
    const clean = sanitizeCampaign(dirty);
    expect(clean.sessions[0].questIds).toEqual([]);
    expect(clean.sessions[0].npcIds).toEqual([]);
  });

  it('recognizes valid and invalid campaigns', () => {
    expect(isCampaign(ashenCrown)).toBe(true);
    expect(isCampaign({ id: 'x' })).toBe(false);
    expect(isCampaign(null)).toBe(false);
  });

  it('upgrades data saved before characters and stats existed', () => {
    const { characters: _characters, statDefinitions: _defs, ...rest } = ashenCrown;
    const legacy = {
      ...rest,
      sessions: ashenCrown.sessions.map(({ characterIds: _ids, ...s }) => s),
    };
    expect(isCampaign(legacy)).toBe(true);
    const upgraded = sanitizeCampaign(legacy as unknown as typeof ashenCrown);
    expect(upgraded.characters).toEqual([]);
    expect(upgraded.statDefinitions).toEqual([]);
    expect(upgraded.sessions.every((s) => s.characterIds.length === 0)).toBe(true);
  });

  it('drops attendance of unknown characters', () => {
    const dirty = {
      ...ashenCrown,
      sessions: [{ ...ashenCrown.sessions[0], characterIds: ['ghost', 'pc-kael'] }],
    };
    expect(sanitizeCampaign(dirty).sessions[0].characterIds).toEqual(['pc-kael']);
  });

  it('drops stat values with no definition or a non-numeric value', () => {
    const dirty = {
      ...ashenCrown,
      characters: [{ ...ashenCrown.characters[0], stats: { str: 12, ghost: 5, hp: 'lots' } }],
    } as unknown as typeof ashenCrown;
    expect(sanitizeCampaign(dirty).characters[0].stats).toEqual({ str: 12 });
  });
});

describe('characters', () => {
  const kael = ashenCrown.characters[0];

  it('deleting a character removes it from session attendance', () => {
    const result = deleteCharacter(ashenCrown, 'pc-kael');
    expect(result.characters.some((p) => p.id === 'pc-kael')).toBe(false);
    expect(result.sessions.every((s) => !s.characterIds.includes('pc-kael'))).toBe(true);
    expect(ashenCrown.characters).toHaveLength(3);
  });

  it('upserts by id', () => {
    const updated = upsertCharacter(ashenCrown, { ...kael, name: 'Kael the Bold' });
    expect(updated.characters).toHaveLength(3);
    expect(updated.characters[0].name).toBe('Kael the Bold');
    expect(upsertCharacter(ashenCrown, { ...kael, id: 'pc-new' }).characters).toHaveLength(4);
  });

  it('rejects unknown stats and non-integer values', () => {
    const bad = (stats: Record<string, number>) => () => upsertCharacter(ashenCrown, { ...kael, stats });
    expect(bad({ ghost: 1 })).toThrow(DomainError);
    expect(bad({ str: 2.5 })).toThrow(DomainError);
    expect(bad({ str: NaN })).toThrow(DomainError);
    expect(bad({ str: 1_000_000 })).toThrow(DomainError);
  });

  it('accepts sparse and negative stat values', () => {
    const result = upsertCharacter(ashenCrown, { ...kael, stats: { str: -1 } });
    expect(result.characters[0].stats).toEqual({ str: -1 });
  });

  it('validates optional NPC stats and accepts NPCs without them', () => {
    const npc = ashenCrown.npcs[0];
    expect(upsertNpc(ashenCrown, { ...npc, stats: undefined }).npcs[0].stats).toBeUndefined();
    expect(() => upsertNpc(ashenCrown, { ...npc, stats: { ghost: 1 } })).toThrow(DomainError);
  });

  it('rejects sessions that reference unknown characters', () => {
    const session = { ...ashenCrown.sessions[0], characterIds: ['ghost'] };
    expect(() => upsertSession(ashenCrown, session)).toThrow(DomainError);
  });
});

describe('stat definitions', () => {
  it('adds, renames and keeps values attached by id', () => {
    const added = upsertStatDefinition(ashenCrown, { id: 'luck', name: ' Luck ' });
    expect(added.statDefinitions[added.statDefinitions.length - 1]).toEqual({ id: 'luck', name: 'Luck' });
    const renamed = upsertStatDefinition(added, { id: 'str', name: 'Might' });
    expect(renamed.statDefinitions.find((d) => d.id === 'str')?.name).toBe('Might');
    expect(renamed.characters[0].stats.str).toBe(16);
  });

  it('rejects blank and duplicate names', () => {
    expect(() => upsertStatDefinition(ashenCrown, { id: 'x', name: '  ' })).toThrow(DomainError);
    expect(() => upsertStatDefinition(ashenCrown, { id: 'x', name: 'max hp' })).toThrow(DomainError);
    expect(() => upsertStatDefinition(ashenCrown, { id: 'hp', name: 'MAX HP' })).not.toThrow();
  });

  it('deleting a stat removes its values from characters and NPCs', () => {
    const result = deleteStatDefinition(ashenCrown, 'hp');
    expect(result.statDefinitions.some((d) => d.id === 'hp')).toBe(false);
    expect(result.characters.every((p) => !('hp' in p.stats))).toBe(true);
    expect(result.npcs.every((n) => !n.stats || !('hp' in n.stats))).toBe(true);
    expect(result.characters[0].stats.str).toBe(16);
    expect(ashenCrown.characters[0].stats.hp).toBe(28);
  });

  it('counts how many records hold a stat value', () => {
    expect(countStatValues(ashenCrown, 'hp')).toBe(4);
    expect(countStatValues(ashenCrown, 'missing')).toBe(0);
  });
});
