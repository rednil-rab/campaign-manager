import type { PortraitRepo, StoredPortrait } from './types';

/** In-memory repository used by tests. */
export function createMemoryPortraitRepo(): PortraitRepo {
  const items = new Map<string, StoredPortrait & { ownerId: string; campaignId: string }>();
  const key = (campaignId: string, characterId: string) => `${campaignId}:${characterId}`;
  const own = (ownerId: string, campaignId: string, characterId: string) => {
    const item = items.get(key(campaignId, characterId));
    return item && item.ownerId === ownerId ? item : null;
  };

  return {
    async get(ownerId, campaignId, characterId) {
      const item = own(ownerId, campaignId, characterId);
      return item ? { contentType: item.contentType, bytes: item.bytes, version: item.version } : null;
    },
    async put(ownerId, campaignId, characterId, image) {
      const version = (items.get(key(campaignId, characterId))?.version ?? 0) + 1;
      items.set(key(campaignId, characterId), { ownerId, campaignId, ...image, version });
      return version;
    },
    async delete(ownerId, campaignId, characterId) {
      if (!own(ownerId, campaignId, characterId)) return false;
      return items.delete(key(campaignId, characterId));
    },
    async deleteForCampaign(ownerId, campaignId) {
      for (const [k, item] of items) {
        if (item.ownerId === ownerId && item.campaignId === campaignId) items.delete(k);
      }
    },
  };
}
