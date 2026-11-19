export interface StoredPortrait {
  contentType: string;
  bytes: Buffer;
  /** Increases on every write; used to bust caches. */
  version: number;
}

/** Every method is scoped to an owner, so one user can never reach another's portraits. */
export interface PortraitRepo {
  get(ownerId: string, campaignId: string, characterId: string): Promise<StoredPortrait | null>;
  /** Stores or replaces the portrait and returns its new version. */
  put(
    ownerId: string,
    campaignId: string,
    characterId: string,
    image: { contentType: string; bytes: Buffer },
  ): Promise<number>;
  delete(ownerId: string, campaignId: string, characterId: string): Promise<boolean>;
  deleteForCampaign(ownerId: string, campaignId: string): Promise<void>;
  /** How many portraits the owner has, optionally within one campaign. Used for storage quotas. */
  count(ownerId: string, campaignId?: string): Promise<number>;
}

/** Counts portrait generations per owner and day, so spend on the image provider stays bounded. */
export interface PortraitUsageRepo {
  /** Takes one unit for the day; false when the limit is already reached. */
  consume(ownerId: string, day: string, limit: number): Promise<boolean>;
  /** Gives one unit back, for example when the provider failed. */
  release(ownerId: string, day: string): Promise<void>;
}
