import type { Campaign, InventoryItem, PlayerCharacter } from '@questkeeper/domain';
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

/**
 * Validates the shape of untrusted input and copies only known fields.
 * Domain rules (unknown stats, ranges, unknown race ids) are enforced by `upsertCharacter`.
 */
export function parseCharacter(body: unknown): PlayerCharacter {
  if (!isRecord(body)) return bad('Character must be an object');

  const stats: Record<string, number> = {};
  if (!isRecord(body.stats ?? {})) bad('stats must be an object');
  for (const [id, value] of Object.entries((body.stats ?? {}) as Record<string, unknown>)) {
    if (typeof value !== 'number') bad(`Stat ${id} must be a number`);
    stats[id] = value as number;
  }

  const rawItems = body.inventory ?? [];
  if (!Array.isArray(rawItems) || rawItems.length > MAX_ITEMS) return bad(`inventory must be a list of at most ${MAX_ITEMS} items`);

  return {
    id: text(body.id, 'id', 100, { required: true }),
    name: text(body.name, 'name', 80, { required: true }),
    player: text(body.player ?? '', 'player', 80),
    raceId: optionalId(body.raceId, 'raceId'),
    race: text(body.race ?? '', 'race', 80),
    classId: optionalId(body.classId, 'classId'),
    characterClass: text(body.characterClass ?? '', 'characterClass', 80),
    notes: text(body.notes ?? '', 'notes', 5000),
    stats,
    inventory: rawItems.map(parseItem),
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
