import type { AgentChange, GameEventKind } from '@questkeeper/domain';
import { bad, DISPOSITIONS, isRecord, oneOf, QUEST_STATUSES, text } from '../campaigns/parse';

const requestId = (v: unknown) => text(v, 'id', 100, { required: true });
const refId = (v: unknown, field: string) => text(v, field, 100, { required: true });

function quantity(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return bad('quantity must be a whole number');
  return v;
}

/** Validates an agent change request. Domain rules (unknown ids, ranges) are enforced when it is applied. */
export function parseAgentChange(body: unknown): { id: string; change: AgentChange } {
  if (!isRecord(body)) return bad('Change must be an object');
  const id = requestId(body.id);
  const action = oneOf(body.action, 'action', [
    'add_item',
    'remove_item',
    'set_item_quantity',
    'set_quest_status',
    'set_npc_disposition',
    'reveal',
    'add_session_note',
  ] as const);

  switch (action) {
    case 'add_item':
      return {
        id,
        change: {
          action,
          itemId: refId(body.itemId, 'itemId'),
          name: text(body.name, 'name', 80, { required: true }),
          quantity: quantity(body.quantity),
          notes: text(body.notes ?? '', 'notes', 500),
        },
      };
    case 'remove_item':
      return { id, change: { action, itemId: refId(body.itemId, 'itemId') } };
    case 'set_item_quantity':
      return { id, change: { action, itemId: refId(body.itemId, 'itemId'), quantity: quantity(body.quantity) } };
    case 'set_quest_status':
      return {
        id,
        change: { action, questId: refId(body.questId, 'questId'), status: oneOf(body.status, 'status', QUEST_STATUSES) },
      };
    case 'set_npc_disposition':
      return {
        id,
        change: { action, npcId: refId(body.npcId, 'npcId'), disposition: oneOf(body.disposition, 'disposition', DISPOSITIONS) },
      };
    case 'reveal':
      return { id, change: { action, type: oneOf(body.type, 'type', ['npc', 'quest'] as const), id: refId(body.targetId, 'targetId') } };
    case 'add_session_note':
      return {
        id,
        change: { action, sessionId: refId(body.sessionId, 'sessionId'), text: text(body.text, 'text', 2000, { required: true }) },
      };
  }
}

const AGENT_EVENT_KINDS: readonly GameEventKind[] = ['narration', 'roll', 'note', 'reveal', 'change'];

export function parseAgentEvent(body: unknown) {
  if (!isRecord(body)) return bad('Event must be an object');
  return {
    id: requestId(body.id),
    kind: oneOf(body.kind, 'kind', AGENT_EVENT_KINDS),
    text: text(body.text, 'text', 2000, { required: true }),
    visibility: oneOf(body.visibility, 'visibility', ['table', 'dm'] as const),
    sessionId: body.sessionId === undefined ? undefined : refId(body.sessionId, 'sessionId'),
  };
}

export function parseRollRequest(body: unknown) {
  if (!isRecord(body)) return bad('Roll must be an object');
  return {
    id: requestId(body.id),
    dice: text(body.dice, 'dice', 20, { required: true }),
    reason: text(body.reason ?? '', 'reason', 200),
  };
}
