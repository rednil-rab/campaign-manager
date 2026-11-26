import { DomainError, upsertCharacter, upsertSession } from './actions';
import type { Campaign, Id, InventoryItem, PlayerCharacter, Session, Stats } from './types';

export interface CharacterPatch {
  stats?: Stats;
  conditions?: string[];
  inventory?: { upsert?: InventoryItem[]; remove?: Id[] };
  playerNotes?: string;
  /** The DM-only notes. */
  notes?: string;
}

/** Applies an agent's partial update through `upsertCharacter`, so every stat, inventory and condition rule still holds. */
export function patchCharacter(c: Campaign, id: Id, patch: CharacterPatch): Campaign {
  const p = c.characters.find((x) => x.id === id);
  if (!p) throw new DomainError('Character not found');
  let inventory = p.inventory;
  if (patch.inventory?.remove) {
    const removed = new Set(patch.inventory.remove);
    inventory = inventory.filter((i) => !removed.has(i.id));
  }
  for (const item of patch.inventory?.upsert ?? []) {
    inventory = inventory.some((i) => i.id === item.id)
      ? inventory.map((i) => (i.id === item.id ? item : i))
      : [...inventory, item];
  }
  const next: PlayerCharacter = {
    ...p,
    stats: { ...p.stats, ...patch.stats },
    inventory,
    ...(patch.conditions ? { conditions: patch.conditions } : {}),
    ...(patch.playerNotes === undefined ? {} : { playerNotes: patch.playerNotes }),
    ...(patch.notes === undefined ? {} : { notes: patch.notes }),
  };
  return upsertCharacter(c, next);
}

export interface NewSession {
  id: Id;
  title: string;
  playedOn: string;
  summary?: string;
  questIds?: Id[];
  npcIds?: Id[];
  characterIds?: Id[];
}

/** Creates a session numbered after the highest existing one. An id that already exists is a retried request and changes nothing. */
export function createSession(c: Campaign, input: NewSession): Campaign {
  if (c.sessions.some((s) => s.id === input.id)) return c;
  if (!input.title.trim()) throw new DomainError('A session needs a title');
  return upsertSession(c, {
    id: input.id,
    number: Math.max(0, ...c.sessions.map((s) => s.number)) + 1,
    title: input.title,
    playedOn: input.playedOn,
    summary: input.summary ?? '',
    questIds: input.questIds ?? [],
    npcIds: input.npcIds ?? [],
    characterIds: input.characterIds ?? [],
  });
}

export interface SessionPatch {
  title?: string;
  summary?: string;
  /** A line appended to the summary. */
  note?: string;
}

export function patchSession(c: Campaign, id: Id, patch: SessionPatch): Campaign {
  const s = c.sessions.find((x) => x.id === id);
  if (!s) throw new DomainError(`Unknown session: ${id}`);
  if (patch.title !== undefined && !patch.title.trim()) throw new DomainError('A session needs a title');
  let summary = patch.summary ?? s.summary;
  if (patch.note !== undefined) {
    const note = patch.note.trim();
    if (!note) throw new DomainError('Note text is required');
    // Retried request: already added.
    if (!summary.endsWith(note)) summary = summary ? `${summary}\n${note}` : note;
  }
  if (summary === s.summary && (patch.title === undefined || patch.title === s.title)) return c;
  return upsertSession(c, { ...s, title: patch.title ?? s.title, summary });
}

/** Marks a session as ended. Ending locks nothing, and a session that already ended keeps its first timestamp. */
export function endSession(c: Campaign, id: Id, at: string): Campaign {
  const s = c.sessions.find((x) => x.id === id);
  if (!s) throw new DomainError(`Unknown session: ${id}`);
  if (s.endedAt) return c;
  return upsertSession(c, { ...s, endedAt: at });
}

export interface PlayerSessionView {
  id: Id;
  number: number;
  title: string;
  playedOn: string;
  endedAt?: string;
}

/** The sessions a player character attended, with no summary and no links to other records. */
export function playerSessions(c: Campaign, characterId: Id): PlayerSessionView[] {
  return c.sessions
    .filter((s: Session) => s.characterIds.includes(characterId))
    .map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      playedOn: s.playedOn,
      ...(s.endedAt ? { endedAt: s.endedAt } : {}),
    }));
}
