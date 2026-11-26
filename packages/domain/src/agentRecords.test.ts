import { describe, expect, it } from 'vitest';
import { DomainError } from './actions';
import { createSession, endSession, patchCharacter, patchSession, playerSessions } from './agentRecords';
import { ashenCrown } from './ashenCrown';

const kael = ashenCrown.characters[0];
const item = (over = {}) => ({ id: 'i-1', name: 'Lantern', quantity: 1, notes: '', ...over });
const find = (c: typeof ashenCrown, id: string) => c.characters.find((p) => p.id === id)!;

describe('patchCharacter', () => {
  it('merges stats, keeping the others', () => {
    const next = find(patchCharacter(ashenCrown, kael.id, { stats: { hp: 12 } }), kael.id);
    expect(next.stats).toEqual({ ...kael.stats, hp: 12 });
  });

  it('rejects unknown, fractional and huge stat values', () => {
    expect(() => patchCharacter(ashenCrown, kael.id, { stats: { ghost: 1 } })).toThrow(DomainError);
    expect(() => patchCharacter(ashenCrown, kael.id, { stats: { hp: 2.5 } })).toThrow(DomainError);
    expect(() => patchCharacter(ashenCrown, kael.id, { stats: { hp: 100001 } })).toThrow(DomainError);
  });

  it('replaces conditions, trimmed, and enforces the limits', () => {
    const next = find(patchCharacter(ashenCrown, kael.id, { conditions: [' poisoned ', 'prone'] }), kael.id);
    expect(next.conditions).toEqual(['poisoned', 'prone']);
    expect(() => patchCharacter(ashenCrown, kael.id, { conditions: Array.from({ length: 21 }, (_, i) => `c${i}`) })).toThrow(DomainError);
    expect(() => patchCharacter(ashenCrown, kael.id, { conditions: ['x'.repeat(41)] })).toThrow(DomainError);
    expect(() => patchCharacter(ashenCrown, kael.id, { conditions: [' '] })).toThrow(DomainError);
  });

  it('upserts items by id without duplicating, and removes by id', () => {
    const once = patchCharacter(ashenCrown, kael.id, { inventory: { upsert: [item()] } });
    const twice = patchCharacter(once, kael.id, { inventory: { upsert: [item({ quantity: 3 })] } });
    expect(find(twice, kael.id).inventory.filter((i) => i.id === 'i-1')).toEqual([item({ quantity: 3 })]);
    const removed = patchCharacter(twice, kael.id, { inventory: { remove: ['i-1'] } });
    expect(find(removed, kael.id).inventory.some((i) => i.id === 'i-1')).toBe(false);
    expect(() => patchCharacter(ashenCrown, kael.id, { inventory: { upsert: [item({ quantity: -1 })] } })).toThrow(DomainError);
  });

  it('sets player notes and DM notes, leaving other characters alone', () => {
    const next = patchCharacter(ashenCrown, kael.id, { playerNotes: 'Hi', notes: 'Careful' });
    expect(find(next, kael.id)).toMatchObject({ playerNotes: 'Hi', notes: 'Careful' });
    expect(next.characters.slice(1)).toEqual(ashenCrown.characters.slice(1));
  });

  it('throws for an unknown character', () => {
    expect(() => patchCharacter(ashenCrown, 'ghost', { playerNotes: 'x' })).toThrow(DomainError);
  });
});

describe('createSession', () => {
  const input = { id: 's-new', title: 'Into the marsh', playedOn: '2026-11-26' };

  it('numbers the new session after the highest existing one and keeps defaults empty', () => {
    const next = createSession(ashenCrown, input);
    const highest = Math.max(...ashenCrown.sessions.map((s) => s.number));
    expect(next.sessions.find((s) => s.id === 's-new')).toEqual({
      ...input,
      number: highest + 1,
      summary: '',
      questIds: [],
      npcIds: [],
      characterIds: [],
    });
  });

  it('returns the campaign unchanged when the id already exists (retry)', () => {
    const once = createSession(ashenCrown, input);
    expect(createSession(once, input)).toBe(once);
  });

  it('rejects unknown references', () => {
    expect(() => createSession(ashenCrown, { ...input, questIds: ['ghost'] })).toThrow(DomainError);
    expect(() => createSession(ashenCrown, { ...input, npcIds: ['ghost'] })).toThrow(DomainError);
    expect(() => createSession(ashenCrown, { ...input, characterIds: ['ghost'] })).toThrow(DomainError);
  });
});

describe('patchSession', () => {
  const s1 = ashenCrown.sessions[0];
  const get = (c: typeof ashenCrown) => c.sessions.find((s) => s.id === s1.id)!;

  it('replaces the summary and the title', () => {
    expect(get(patchSession(ashenCrown, s1.id, { summary: 'New', title: 'Renamed' }))).toMatchObject({ summary: 'New', title: 'Renamed' });
  });

  it('appends a note once, even when the request is retried', () => {
    const once = patchSession(ashenCrown, s1.id, { note: 'The bridge fell.' });
    expect(get(once).summary).toBe(`${s1.summary}\nThe bridge fell.`);
    expect(patchSession(once, s1.id, { note: 'The bridge fell.' })).toBe(once);
  });

  it('throws for an unknown session or a blank title', () => {
    expect(() => patchSession(ashenCrown, 'ghost', { summary: 'x' })).toThrow(DomainError);
    expect(() => patchSession(ashenCrown, s1.id, { title: ' ' })).toThrow(DomainError);
  });
});

describe('endSession', () => {
  const id = ashenCrown.sessions[0].id;

  it('sets endedAt and keeps the first timestamp on a repeat', () => {
    const ended = endSession(ashenCrown, id, '2026-11-26T10:00:00.000Z');
    expect(ended.sessions.find((s) => s.id === id)!.endedAt).toBe('2026-11-26T10:00:00.000Z');
    expect(endSession(ended, id, '2026-11-27T10:00:00.000Z')).toBe(ended);
  });

  it('does not lock editing', () => {
    const ended = endSession(ashenCrown, id, '2026-11-26T10:00:00.000Z');
    const next = patchSession(ended, id, { summary: 'Still editable' });
    expect(next.sessions.find((s) => s.id === id)).toMatchObject({ summary: 'Still editable', endedAt: '2026-11-26T10:00:00.000Z' });
  });

  it('throws for an unknown session', () => {
    expect(() => endSession(ashenCrown, 'ghost', '2026-11-26T10:00:00.000Z')).toThrow(DomainError);
  });
});

describe('playerSessions', () => {
  it('lists only attended sessions with exactly the safe fields', () => {
    const list = playerSessions(ashenCrown, 'pc-tamsin');
    const attended = ashenCrown.sessions.filter((s) => s.characterIds.includes('pc-tamsin'));
    expect(list.map((s) => s.id)).toEqual(attended.map((s) => s.id));
    expect(list.length).toBeLessThan(ashenCrown.sessions.length);
    for (const s of list) expect(Object.keys(s).sort()).toEqual(['id', 'number', 'playedOn', 'title']);
  });

  it('includes endedAt only when the session has ended', () => {
    const ended = endSession(ashenCrown, 'session-1', '2026-11-26T10:00:00.000Z');
    expect(playerSessions(ended, 'pc-kael').find((s) => s.id === 'session-1')).toHaveProperty('endedAt', '2026-11-26T10:00:00.000Z');
  });
});
