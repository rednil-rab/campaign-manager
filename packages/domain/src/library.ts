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
