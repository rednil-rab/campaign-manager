import { DomainError } from './actions';
import type { Campaign, GameEvent, Id } from './types';

export const MAX_EVENTS = 200;
export const MAX_EVENT_TEXT = 2000;

/** Adds an entry to the game log, dropping the oldest ones beyond MAX_EVENTS. */
export function appendEvent(c: Campaign, event: GameEvent): Campaign {
  if (!event.id) throw new DomainError('Event id is required');
  if (!event.text.trim()) throw new DomainError('Event text is required');
  if (event.text.length > MAX_EVENT_TEXT) throw new DomainError(`Event text must be at most ${MAX_EVENT_TEXT} characters`);
  if (Number.isNaN(Date.parse(event.at))) throw new DomainError('Event time must be a valid date');
  if (event.sessionId && !c.sessions.some((s) => s.id === event.sessionId)) {
    throw new DomainError(`Unknown session: ${event.sessionId}`);
  }
  if (event.characterId && !c.characters.some((p) => p.id === event.characterId)) {
    throw new DomainError(`Unknown character: ${event.characterId}`);
  }
  const events = c.events ?? [];
  if (events.some((e) => e.id === event.id)) return c; // retried request: already logged
  return { ...c, events: [...events, event].slice(-MAX_EVENTS) };
}

export type Revealable = 'npc' | 'quest';

/** Makes an NPC or quest known to players. The DM-only secret stays hidden. */
export function revealToPlayers(c: Campaign, type: Revealable, id: Id): Campaign {
  if (type === 'npc') {
    if (!c.npcs.some((n) => n.id === id)) throw new DomainError(`Unknown NPC: ${id}`);
    return { ...c, npcs: c.npcs.map((n) => (n.id === id ? { ...n, knownToPlayers: true } : n)) };
  }
  if (type === 'quest') {
    if (!c.quests.some((q) => q.id === id)) throw new DomainError(`Unknown quest: ${id}`);
    return { ...c, quests: c.quests.map((q) => (q.id === id ? { ...q, knownToPlayers: true } : q)) };
  }
  throw new DomainError('Only NPCs and quests can be revealed');
}

/** The log as players may see it: table entries only. */
export const tableEvents = (c: Campaign): GameEvent[] => (c.events ?? []).filter((e) => e.visibility === 'table');
