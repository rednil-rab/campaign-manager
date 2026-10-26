import { isCampaign, sanitizeCampaign } from './integrity';
import type { Campaign, Id } from './types';

export interface Library {
  campaigns: Record<Id, Campaign>;
  /** Display order of campaign ids. */
  order: Id[];
  activeCampaignId: Id | null;
}

export const emptyCampaign = (id: Id, name: string): Campaign => ({
  id,
  name,
  setting: '',
  tagline: '',
  statDefinitions: [],
  races: [],
  classes: [],
  sessions: [],
  quests: [],
  npcs: [],
  characters: [],
});

export const libraryOf = (...campaigns: Campaign[]): Library => ({
  campaigns: Object.fromEntries(campaigns.map((c) => [c.id, c])),
  order: campaigns.map((c) => c.id),
  activeCampaignId: campaigns[0]?.id ?? null,
});

export function addCampaign(lib: Library, campaign: Campaign): Library {
  return {
    campaigns: { ...lib.campaigns, [campaign.id]: campaign },
    order: [...lib.order, campaign.id],
    activeCampaignId: campaign.id,
  };
}

export function renameCampaign(lib: Library, id: Id, name: string): Library {
  const existing = lib.campaigns[id];
  if (!existing) return lib;
  return { ...lib, campaigns: { ...lib.campaigns, [id]: { ...existing, name } } };
}

export function removeCampaign(lib: Library, id: Id): Library {
  if (!lib.campaigns[id]) return lib;
  const { [id]: _removed, ...campaigns } = lib.campaigns;
  const order = lib.order.filter((x) => x !== id);
  return {
    campaigns,
    order,
    activeCampaignId: lib.activeCampaignId === id ? (order[0] ?? null) : lib.activeCampaignId,
  };
}

export function setActiveCampaign(lib: Library, id: Id): Library {
  return lib.campaigns[id] ? { ...lib, activeCampaignId: id } : lib;
}

/**
 * Turns persisted data (v1: a single `campaign`, v2: a library) into a valid
 * Library, or null if it is unusable.
 */
export function parseStoredLibrary(persisted: unknown): Library | null {
  if (!persisted || typeof persisted !== 'object') return null;
  const p = persisted as Record<string, unknown>;

  if (isCampaign(p.campaign)) return libraryOf(sanitizeCampaign(p.campaign));

  if (p.campaigns && typeof p.campaigns === 'object' && Array.isArray(p.order)) {
    const raw = p.campaigns as Record<string, unknown>;
    const campaigns: Record<Id, Campaign> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (isCampaign(value) && value.id === id) campaigns[id] = sanitizeCampaign(value);
    }
    const order = (p.order as unknown[]).filter(
      (id): id is Id => typeof id === 'string' && id in campaigns,
    );
    for (const id of Object.keys(campaigns)) if (!order.includes(id)) order.push(id);
    const active =
      typeof p.activeCampaignId === 'string' && p.activeCampaignId in campaigns
        ? p.activeCampaignId
        : (order[0] ?? null);
    return { campaigns, order, activeCampaignId: active };
  }

  return null;
}
