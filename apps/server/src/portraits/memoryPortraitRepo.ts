import { portraitKey, type PortraitRepo, type PortraitSubject, type StoredPortrait } from './types';

/** In-memory repository used by tests. */
export function createMemoryPortraitRepo(): PortraitRepo {
  const items = new Map<string, StoredPortrait & { ownerId: string; campaignId: string }>();
  const own = (ownerId: string, campaignId: string, subject: PortraitSubject) => {
    const item = items.get(portraitKey(campaignId, subject));
    return item && item.ownerId === ownerId ? item : null;
  };

  return {
    async get(ownerId, campaignId, subject) {
      const item = own(ownerId, campaignId, subject);
      return item ? { contentType: item.contentType, bytes: item.bytes, version: item.version } : null;
    },
    async put(ownerId, campaignId, subject, image) {
      const key = portraitKey(campaignId, subject);
      const version = (items.get(key)?.version ?? 0) + 1;
      items.set(key, { ownerId, campaignId, ...image, version });
      return version;
    },
    async delete(ownerId, campaignId, subject) {
      if (!own(ownerId, campaignId, subject)) return false;
      return items.delete(portraitKey(campaignId, subject));
    },
    async deleteForCampaign(ownerId, campaignId) {
      for (const [k, item] of items) {
        if (item.ownerId === ownerId && item.campaignId === campaignId) items.delete(k);
      }
    },
    async count(ownerId, campaignId) {
      let n = 0;
      for (const item of items.values()) {
        if (item.ownerId === ownerId && (campaignId === undefined || item.campaignId === campaignId)) n++;
      }
      return n;
    },
  };
}
