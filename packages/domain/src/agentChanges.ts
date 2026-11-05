import { DomainError, updateCharacterByPlayer, upsertNpc, upsertQuest, upsertSession } from './actions';
import { revealToPlayers } from './gameLog';
import type { AgentChange, Campaign, Id, PendingChange } from './types';

export const MAX_PENDING = 100;

/** Deletes and ending a quest are never applied automatically. */
export function requiresApproval(change: AgentChange): boolean {
  if (change.action === 'remove_item') return true;
  return change.action === 'set_quest_status' && (change.status === 'completed' || change.status === 'failed');
}

function character(c: Campaign, characterId: Id | undefined) {
  if (!characterId) throw new DomainError('This change needs a character');
  const p = c.characters.find((x) => x.id === characterId);
  if (!p) throw new DomainError(`Unknown character: ${characterId}`);
  return p;
}

/** Applies a change through the regular domain actions, so every rule and reference check still holds. */
export function applyChange(c: Campaign, change: AgentChange, characterId?: Id): Campaign {
  switch (change.action) {
    case 'add_item':
    case 'remove_item':
    case 'set_item_quantity': {
      const p = character(c, characterId);
      const others = p.inventory.filter((i) => i.id !== change.itemId);
      const current = p.inventory.find((i) => i.id === change.itemId);
      let inventory = p.inventory;
      if (change.action === 'add_item') {
        // Upsert by id, so a retried request never doubles the item.
        const item = { id: change.itemId, name: change.name, quantity: change.quantity, notes: change.notes };
        inventory = current ? p.inventory.map((i) => (i.id === item.id ? item : i)) : [...p.inventory, item];
      } else {
        if (!current) throw new DomainError(`Unknown item: ${change.itemId}`);
        inventory =
          change.action === 'remove_item'
            ? others
            : p.inventory.map((i) => (i.id === current.id ? { ...i, quantity: change.quantity } : i));
      }
      return updateCharacterByPlayer(c, p.id, { inventory, playerNotes: p.playerNotes ?? '' });
    }
    case 'set_quest_status': {
      const q = c.quests.find((x) => x.id === change.questId);
      if (!q) throw new DomainError(`Unknown quest: ${change.questId}`);
      return upsertQuest(c, { ...q, status: change.status });
    }
    case 'set_npc_disposition': {
      const n = c.npcs.find((x) => x.id === change.npcId);
      if (!n) throw new DomainError(`Unknown NPC: ${change.npcId}`);
      return upsertNpc(c, { ...n, disposition: change.disposition });
    }
    case 'reveal':
      return revealToPlayers(c, change.type, change.id);
    case 'add_session_note': {
      const s = c.sessions.find((x) => x.id === change.sessionId);
      if (!s) throw new DomainError(`Unknown session: ${change.sessionId}`);
      const text = change.text.trim();
      if (!text) throw new DomainError('Note text is required');
      if (s.summary.endsWith(text)) return c; // retried request: already added
      return upsertSession(c, { ...s, summary: s.summary ? `${s.summary}\n${text}` : text });
    }
  }
}

/** A short, readable line for the log and the DM's approval list. */
export function describeChange(c: Campaign, change: AgentChange, characterId?: Id): string {
  const who = c.characters.find((p) => p.id === characterId)?.name ?? 'the character';
  const item = (id: Id) => c.characters.find((p) => p.id === characterId)?.inventory.find((i) => i.id === id)?.name ?? 'an item';
  switch (change.action) {
    case 'add_item':
      return `${who} gains ${change.name} ×${change.quantity}`;
    case 'remove_item':
      return `${who} loses ${item(change.itemId)}`;
    case 'set_item_quantity':
      return `${who} now has ${item(change.itemId)} ×${change.quantity}`;
    case 'set_quest_status':
      return `Quest "${c.quests.find((q) => q.id === change.questId)?.title ?? change.questId}" becomes ${change.status}`;
    case 'set_npc_disposition':
      return `${c.npcs.find((n) => n.id === change.npcId)?.name ?? change.npcId} becomes ${change.disposition}`;
    case 'reveal': {
      const name =
        change.type === 'npc'
          ? c.npcs.find((n) => n.id === change.id)?.name
          : c.quests.find((q) => q.id === change.id)?.title;
      return `Reveal ${change.type} "${name ?? change.id}" to the players`;
    }
    case 'add_session_note':
      return `Add a note to session ${c.sessions.find((s) => s.id === change.sessionId)?.number ?? change.sessionId}`;
  }
}

/** Holds a change for the DM. Queuing the same id twice is a no-op. */
export function queueChange(
  c: Campaign,
  pending: { id: Id; at: string; change: AgentChange; characterId?: Id },
): Campaign {
  const queue = c.pendingChanges ?? [];
  if (queue.some((p) => p.id === pending.id)) return c;
  if (queue.length >= MAX_PENDING) throw new DomainError('Too many changes are waiting for the DM');
  const entry: PendingChange = { ...pending, description: describeChange(c, pending.change, pending.characterId) };
  return { ...c, pendingChanges: [...queue, entry] };
}

const findPending = (c: Campaign, id: Id): PendingChange => {
  const found = (c.pendingChanges ?? []).find((p) => p.id === id);
  if (!found) throw new DomainError('That change is no longer waiting for approval');
  return found;
};

export function approvePendingChange(c: Campaign, id: Id): Campaign {
  const pending = findPending(c, id);
  const applied = applyChange(c, pending.change, pending.characterId);
  return { ...applied, pendingChanges: (applied.pendingChanges ?? []).filter((p) => p.id !== id) };
}

export function rejectPendingChange(c: Campaign, id: Id): Campaign {
  findPending(c, id);
  return { ...c, pendingChanges: (c.pendingChanges ?? []).filter((p) => p.id !== id) };
}
