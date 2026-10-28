import type {
  Campaign,
  InventoryItem,
  Npc,
  NpcDisposition,
  PlayerCharacter,
  Quest,
  QuestStatus,
  RuleOption,
  Session,
  Stats,
} from '@questkeeper/domain';
import { HttpError } from '../errors';

const bad = (message: string): never => {
  throw new HttpError(400, message);
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function text(v: unknown, field: string, max: number, { required = false } = {}): string {
  if (typeof v !== 'string') return bad(`${field} must be a string`);
  const trimmed = v.trim();
  if (required && !trimmed) return bad(`${field} is required`);
  if (v.length > max) return bad(`${field} must be at most ${max} characters`);
  return v;
}

function optionalId(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  return text(v, field, 100, { required: true });
}

const MAX_ITEMS = 200;

function parseItem(raw: unknown): InventoryItem {
  if (!isRecord(raw)) return bad('Inventory items must be objects');
  if (typeof raw.quantity !== 'number') return bad('Item quantity must be a number');
  return {
    id: text(raw.id, 'Item id', 100, { required: true }),
    name: text(raw.name, 'Item name', 80),
    quantity: raw.quantity,
    notes: text(raw.notes ?? '', 'Item notes', 500),
  };
}

export function parseInventory(raw: unknown): InventoryItem[] {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return bad(`inventory must be a list of at most ${MAX_ITEMS} items`);
  return raw.map(parseItem);
}

export function parsePlayerNotes(raw: unknown): string {
  return text(raw ?? '', 'playerNotes', 5000);
}

const MAX_STATS = 100;
const MAX_REFS = 500;

function parseStats(raw: unknown): Stats {
  const value = raw ?? {};
  if (!isRecord(value)) return bad('stats must be an object');
  const entries = Object.entries(value);
  if (entries.length > MAX_STATS) return bad(`stats can have at most ${MAX_STATS} entries`);
  const stats: Stats = {};
  for (const [id, v] of entries) {
    if (typeof v !== 'number') bad(`Stat ${id} must be a number`);
    stats[id] = v as number;
  }
  return stats;
}

function parseIdList(raw: unknown, field: string): string[] {
  const value = raw ?? [];
  if (!Array.isArray(value) || value.length > MAX_REFS) return bad(`${field} must be a list of at most ${MAX_REFS} ids`);
  return value.map((id) => text(id, field, 100, { required: true }));
}

function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    return bad(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return v as T;
}

const QUEST_STATUSES: readonly QuestStatus[] = ['active', 'dormant', 'completed', 'failed'];
const DISPOSITIONS: readonly NpcDisposition[] = ['ally', 'neutral', 'hostile', 'unknown'];

/**
 * Each parser validates the shape of untrusted input and copies only known fields.
 * Domain rules (unknown references, ranges, cycles) are enforced by the domain actions.
 */
export function parseQuest(body: unknown): Quest {
  if (!isRecord(body)) return bad('Quest must be an object');
  return {
    id: text(body.id, 'id', 100, { required: true }),
    title: text(body.title, 'title', 120, { required: true }),
    status: oneOf(body.status, 'status', QUEST_STATUSES),
    description: text(body.description ?? '', 'description', 5000),
    giverNpcId: optionalId(body.giverNpcId, 'giverNpcId'),
    prerequisiteQuestIds: parseIdList(body.prerequisiteQuestIds, 'prerequisiteQuestIds'),
  };
}

export function parseNpc(body: unknown): Npc {
  if (!isRecord(body)) return bad('NPC must be an object');
  const stats = body.stats === undefined || body.stats === null ? undefined : parseStats(body.stats);
  return {
    id: text(body.id, 'id', 100, { required: true }),
    name: text(body.name, 'name', 80, { required: true }),
    role: text(body.role ?? '', 'role', 80),
    location: text(body.location ?? '', 'location', 80),
    disposition: oneOf(body.disposition, 'disposition', DISPOSITIONS),
    description: text(body.description ?? '', 'description', 5000),
    ...(stats ? { stats } : {}),
  };
}

export function parseSession(body: unknown): Session {
  if (!isRecord(body)) return bad('Session must be an object');
  const playedOn = text(body.playedOn, 'playedOn', 10, { required: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn) || Number.isNaN(Date.parse(playedOn))) {
    return bad('playedOn must be a date (YYYY-MM-DD)');
  }
  const number = body.number;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1 || number > 100000) {
    return bad('number must be a positive whole number');
  }
  return {
    id: text(body.id, 'id', 100, { required: true }),
    number,
    title: text(body.title, 'title', 120, { required: true }),
    playedOn,
    summary: text(body.summary ?? '', 'summary', 20000),
    questIds: parseIdList(body.questIds, 'questIds'),
    npcIds: parseIdList(body.npcIds, 'npcIds'),
    characterIds: parseIdList(body.characterIds, 'characterIds'),
  };
}

/** Used for stat definitions, races and classes. */
export function parseRuleOption(body: unknown): RuleOption {
  if (!isRecord(body)) return bad('Value must be an object');
  return {
    id: text(body.id, 'id', 100, { required: true }),
    name: text(body.name, 'name', 40, { required: true }),
  };
}

export function parseCharacter(body: unknown): PlayerCharacter {
  if (!isRecord(body)) return bad('Character must be an object');

  const stats = parseStats(body.stats);

  const inventory = parseInventory(body.inventory ?? []);

  return {
    id: text(body.id, 'id', 100, { required: true }),
    name: text(body.name, 'name', 80, { required: true }),
    player: text(body.player ?? '', 'player', 80),
    raceId: optionalId(body.raceId, 'raceId'),
    race: text(body.race ?? '', 'race', 80),
    classId: optionalId(body.classId, 'classId'),
    characterClass: text(body.characterClass ?? '', 'characterClass', 80),
    notes: text(body.notes ?? '', 'notes', 5000),
    playerNotes: body.playerNotes === undefined ? undefined : parsePlayerNotes(body.playerNotes),
    stats,
    inventory,
  };
}

export function parseCampaignName(body: unknown): string {
  const name = isRecord(body) ? body.name : undefined;
  return text(name, 'name', 80, { required: true }).trim();
}

export const MAX_CAMPAIGN_BYTES = 1_000_000;

export const assertCampaignSize = (campaign: Campaign): void => {
  if (JSON.stringify(campaign).length > MAX_CAMPAIGN_BYTES) bad('Campaign is too large');
};
