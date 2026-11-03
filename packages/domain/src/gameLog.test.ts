import { describe, expect, it } from 'vitest';
import { DomainError } from './actions';
import { ashenCrown } from './ashenCrown';
import { appendEvent, MAX_EVENTS, revealToPlayers, tableEvents } from './gameLog';
import type { GameEvent } from './types';

const event = (over: Partial<GameEvent> = {}): GameEvent => ({
  id: 'e-1',
  at: '2026-11-03T12:00:00.000Z',
  kind: 'narration',
  text: 'The door creaks open.',
  visibility: 'table',
  source: 'agent',
  ...over,
});

describe('appendEvent', () => {
  it('appends without mutating the input', () => {
    const next = appendEvent(ashenCrown, event());
    expect(next.events).toHaveLength(1);
    expect(ashenCrown.events).toBeUndefined();
  });

  it('is idempotent for a repeated event id', () => {
    const once = appendEvent(ashenCrown, event());
    expect(appendEvent(once, event())).toBe(once);
  });

  it('keeps only the newest MAX_EVENTS', () => {
    let c = ashenCrown;
    for (let i = 0; i < MAX_EVENTS + 5; i++) c = appendEvent(c, event({ id: `e-${i}` }));
    expect(c.events).toHaveLength(MAX_EVENTS);
    expect(c.events![0].id).toBe('e-5');
  });

  it('validates its input and references', () => {
    expect(() => appendEvent(ashenCrown, event({ text: '  ' }))).toThrow(DomainError);
    expect(() => appendEvent(ashenCrown, event({ at: 'nope' }))).toThrow(DomainError);
    expect(() => appendEvent(ashenCrown, event({ sessionId: 'ghost' }))).toThrow(DomainError);
    expect(() => appendEvent(ashenCrown, event({ characterId: 'ghost' }))).toThrow(DomainError);
  });
});

describe('tableEvents', () => {
  it('hides DM-only entries', () => {
    const c = appendEvent(appendEvent(ashenCrown, event()), event({ id: 'e-2', visibility: 'dm', text: 'secret' }));
    expect(tableEvents(c).map((e) => e.id)).toEqual(['e-1']);
  });
});

describe('revealToPlayers', () => {
  it('marks an NPC or quest as known and nothing else', () => {
    const npc = revealToPlayers(ashenCrown, 'npc', 'npc-mirelle');
    expect(npc.npcs.find((n) => n.id === 'npc-mirelle')?.knownToPlayers).toBe(true);
    expect(npc.npcs.filter((n) => n.knownToPlayers)).toHaveLength(1);
    const quest = revealToPlayers(ashenCrown, 'quest', ashenCrown.quests[0].id);
    expect(quest.quests[0].knownToPlayers).toBe(true);
  });

  it('rejects unknown records and types', () => {
    expect(() => revealToPlayers(ashenCrown, 'npc', 'ghost')).toThrow(DomainError);
    expect(() => revealToPlayers(ashenCrown, 'quest', 'ghost')).toThrow(DomainError);
    expect(() => revealToPlayers(ashenCrown, 'item' as never, 'x')).toThrow(DomainError);
  });
});
