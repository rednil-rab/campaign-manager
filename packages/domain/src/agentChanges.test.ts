import { describe, expect, it } from 'vitest';
import { DomainError } from './actions';
import {
  applyChange,
  approvePendingChange,
  MAX_PENDING,
  queueChange,
  rejectPendingChange,
  requiresApproval,
} from './agentChanges';
import { ashenCrown } from './ashenCrown';
import { rollDice } from './dice';
import { appendEvent } from './gameLog';
import { playerContext } from './playerView';
import type { AgentChange, Campaign } from './types';

const kael = ashenCrown.characters[0].id;
const add: AgentChange = { action: 'add_item', itemId: 'i-rope', name: 'Rope', quantity: 1, notes: '' };

describe('rollDice', () => {
  const fixed = (n: number) => (v: number) => Math.min(v - 1, n);

  it('rolls and totals with a modifier', () => {
    const r = rollDice('2d6+3', fixed(4)); // each die shows 5
    expect(r.rolls).toEqual([5, 5]);
    expect(r.total).toBe(13);
    expect(r.text).toBe('2d6+3 → 13 (5, 5, +3)');
  });

  it('accepts d20 and spaces, and handles negative modifiers', () => {
    expect(rollDice(' D20 - 2 ', fixed(0)).total).toBe(-1);
    expect(rollDice('d20', fixed(0)).rolls).toEqual([1]);
  });

  it('stays within each die', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollDice('1d6', (n) => Math.floor(Math.random() * n));
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.total).toBeLessThanOrEqual(6);
    }
  });

  it('rejects bad or excessive input', () => {
    for (const bad of ['', 'abc', '0d6', '21d6', 'd1', 'd1001', '1d6+', '1d6*2']) {
      expect(() => rollDice(bad, fixed(0))).toThrow(DomainError);
    }
  });
});

describe('requiresApproval', () => {
  it('holds deletes and quest endings only', () => {
    expect(requiresApproval({ action: 'remove_item', itemId: 'x' })).toBe(true);
    expect(requiresApproval({ action: 'set_quest_status', questId: 'q', status: 'completed' })).toBe(true);
    expect(requiresApproval({ action: 'set_quest_status', questId: 'q', status: 'failed' })).toBe(true);
    expect(requiresApproval({ action: 'set_quest_status', questId: 'q', status: 'dormant' })).toBe(false);
    expect(requiresApproval(add)).toBe(false);
    expect(requiresApproval({ action: 'reveal', type: 'npc', id: 'n' })).toBe(false);
  });
});

describe('applyChange', () => {
  it('adds an item idempotently and edits quantity and removal', () => {
    const once = applyChange(ashenCrown, add, kael);
    const twice = applyChange(once, add, kael);
    const inv = (c: typeof once) => c.characters.find((p) => p.id === kael)!.inventory;
    expect(inv(twice).filter((i) => i.id === 'i-rope')).toHaveLength(1);
    const more = applyChange(twice, { action: 'set_item_quantity', itemId: 'i-rope', quantity: 4 }, kael);
    expect(inv(more).find((i) => i.id === 'i-rope')?.quantity).toBe(4);
    const gone = applyChange(more, { action: 'remove_item', itemId: 'i-rope' }, kael);
    expect(inv(gone).some((i) => i.id === 'i-rope')).toBe(false);
  });

  it('validates items and the character', () => {
    expect(() => applyChange(ashenCrown, { ...add, quantity: -1 }, kael)).toThrow(DomainError);
    expect(() => applyChange(ashenCrown, add)).toThrow(DomainError);
    expect(() => applyChange(ashenCrown, add, 'ghost')).toThrow(DomainError);
    expect(() => applyChange(ashenCrown, { action: 'remove_item', itemId: 'nope' }, kael)).toThrow(DomainError);
  });

  it('keeps the DM notes and player notes when changing items', () => {
    const before = ashenCrown.characters.find((p) => p.id === kael)!;
    const after = applyChange(ashenCrown, add, kael).characters.find((p) => p.id === kael)!;
    expect(after.notes).toBe(before.notes);
    expect(after.playerNotes ?? '').toBe(before.playerNotes ?? '');
  });

  it('changes quest status, NPC disposition and reveals', () => {
    const quest = ashenCrown.quests[0];
    const npc = ashenCrown.npcs[0];
    expect(
      applyChange(ashenCrown, { action: 'set_quest_status', questId: quest.id, status: 'dormant' }).quests[0].status,
    ).toBe('dormant');
    expect(
      applyChange(ashenCrown, { action: 'set_npc_disposition', npcId: npc.id, disposition: 'hostile' }).npcs[0].disposition,
    ).toBe('hostile');
    expect(applyChange(ashenCrown, { action: 'reveal', type: 'npc', id: npc.id }).npcs[0].knownToPlayers).toBe(true);
    expect(() => applyChange(ashenCrown, { action: 'set_quest_status', questId: 'x', status: 'active' })).toThrow(DomainError);
  });

  it('appends a session note once', () => {
    const s = ashenCrown.sessions[0];
    const note = { action: 'add_session_note', sessionId: s.id, text: 'They found a key.' } as const;
    const once = applyChange(ashenCrown, note);
    expect(once.sessions[0].summary.endsWith('They found a key.')).toBe(true);
    expect(applyChange(once, note)).toBe(once);
    expect(() => applyChange(ashenCrown, { ...note, text: ' ' })).toThrow(DomainError);
  });
});

describe('pending changes', () => {
  const remove: AgentChange = { action: 'remove_item', itemId: 'i-rope' };
  const withRope = applyChange(ashenCrown, add, kael);
  const pending = { id: 'p-1', at: '2026-11-05T10:00:00.000Z', change: remove, characterId: kael };

  it('queues once, describes the change, and approves it', () => {
    const queued = queueChange(withRope, pending);
    expect(queueChange(queued, pending)).toBe(queued);
    expect(queued.pendingChanges).toHaveLength(1);
    expect(queued.pendingChanges![0].description).toContain('Rope');
    const done = approvePendingChange(queued, 'p-1');
    expect(done.pendingChanges).toEqual([]);
    expect(done.characters.find((p) => p.id === kael)!.inventory.some((i) => i.id === 'i-rope')).toBe(false);
  });

  it('rejects without applying', () => {
    const queued = queueChange(withRope, pending);
    const rejected = rejectPendingChange(queued, 'p-1');
    expect(rejected.pendingChanges).toEqual([]);
    expect(rejected.characters).toBe(queued.characters);
  });

  it('fails on unknown ids and caps the queue', () => {
    expect(() => approvePendingChange(withRope, 'nope')).toThrow(DomainError);
    expect(() => rejectPendingChange(withRope, 'nope')).toThrow(DomainError);
    let c = withRope;
    for (let i = 0; i < MAX_PENDING; i++) c = queueChange(c, { ...pending, id: `p-${i}` });
    expect(() => queueChange(c, { ...pending, id: 'one-too-many' })).toThrow(DomainError);
  });
});

describe('playerContext', () => {
  it('includes only revealed records, table events, and no secrets', () => {
    let c: Campaign = {
      ...ashenCrown,
      npcs: ashenCrown.npcs.map((n, i) => ({ ...n, secret: 'NPC SECRET', knownToPlayers: i === 0 })),
      quests: ashenCrown.quests.map((q, i) => ({ ...q, secret: 'QUEST SECRET', knownToPlayers: i === 0 })),
    };
    const at = '2026-11-05T10:00:00.000Z';
    c = appendEvent(c, { id: 'e1', at, kind: 'narration', text: 'Public', visibility: 'table', source: 'agent' });
    c = appendEvent(c, { id: 'e2', at, kind: 'note', text: 'Private', visibility: 'dm', source: 'agent' });
    const ctx = playerContext(c, kael)!;
    expect(ctx.npcs.map((n) => n.id)).toEqual([ashenCrown.npcs[0].id]);
    expect(ctx.quests.map((q) => q.id)).toEqual([ashenCrown.quests[0].id]);
    expect(ctx.events.map((e) => e.id)).toEqual(['e1']);
    const json = JSON.stringify(ctx);
    expect(json).not.toContain('NPC SECRET');
    expect(json).not.toContain('QUEST SECRET');
    expect(json).not.toContain('Private');
    expect(playerContext(c, 'ghost')).toBeUndefined();
  });
});
