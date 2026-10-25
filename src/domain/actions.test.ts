import { describe, expect, it } from 'vitest';
import { ashenCrown } from '../data/ashenCrown';
import {
  DomainError,
  deleteNpc,
  deleteQuest,
  deleteSession,
  upsertQuest,
  upsertSession,
} from './actions';
import { isCampaign, sanitizeCampaign } from './integrity';

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
});
