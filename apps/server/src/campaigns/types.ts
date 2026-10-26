import type { Campaign } from '@questkeeper/domain';

export interface StoredCampaign {
  campaign: Campaign;
  /** Incremented on every write; used for optimistic concurrency. */
  version: number;
}

/** Every method is scoped to an owner, so one user can never reach another's campaigns. */
export interface CampaignRepo {
  list(ownerId: string): Promise<StoredCampaign[]>;
  get(ownerId: string, id: string): Promise<StoredCampaign | null>;
  insert(ownerId: string, campaign: Campaign): Promise<StoredCampaign>;
  /** Writes only if the stored version still equals `expectedVersion`; returns null otherwise. */
  replace(ownerId: string, id: string, expectedVersion: number, campaign: Campaign): Promise<StoredCampaign | null>;
  delete(ownerId: string, id: string): Promise<boolean>;
}
