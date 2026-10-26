import type { Campaign } from '@questkeeper/domain';
import type { CampaignRepo, StoredCampaign } from './types';

interface Entry extends StoredCampaign {
  ownerId: string;
}

/** In-memory repository used by tests. */
export function createMemoryCampaignRepo(): CampaignRepo {
  const entries = new Map<string, Entry>();
  const out = ({ campaign, version }: Entry): StoredCampaign => ({ campaign: structuredClone(campaign), version });
  const owned = (ownerId: string, id: string) => {
    const e = entries.get(id);
    return e && e.ownerId === ownerId ? e : undefined;
  };

  return {
    async list(ownerId) {
      return [...entries.values()].filter((e) => e.ownerId === ownerId).map(out);
    },
    async get(ownerId, id) {
      const e = owned(ownerId, id);
      return e ? out(e) : null;
    },
    async insert(ownerId, campaign: Campaign) {
      const e: Entry = { ownerId, campaign: structuredClone(campaign), version: 1 };
      entries.set(campaign.id, e);
      return out(e);
    },
    async replace(ownerId, id, expectedVersion, campaign) {
      const e = owned(ownerId, id);
      if (!e || e.version !== expectedVersion) return null;
      const next: Entry = { ownerId, campaign: structuredClone(campaign), version: e.version + 1 };
      entries.set(id, next);
      return out(next);
    },
    async delete(ownerId, id) {
      return owned(ownerId, id) ? entries.delete(id) : false;
    },
  };
}
