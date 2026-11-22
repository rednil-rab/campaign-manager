export interface StoredPortrait {
  contentType: string;
  bytes: Buffer;
  /** Increases on every write; used to bust caches. */
  version: number;
}

export type PortraitKind = 'character' | 'npc';

/** What a portrait belongs to. Character and NPC ids are separate namespaces, so the kind is part of the identity. */
export interface PortraitSubject {
  kind: PortraitKind;
  id: string;
}

/**
 * Storage key. Characters keep the original format so existing documents need no migration; NPCs are prefixed.
 * Campaign ids are server-generated UUIDs, so a character key (which starts with a UUID) can never equal an
 * NPC key (which starts with "npc:"), whatever ids the client picks.
 */
export const portraitKey = (campaignId: string, { kind, id }: PortraitSubject): string =>
  kind === 'npc' ? `npc:${campaignId}:${id}` : `${campaignId}:${id}`;

/** Every method is scoped to an owner, so one user can never reach another's portraits. */
export interface PortraitRepo {
  get(ownerId: string, campaignId: string, subject: PortraitSubject): Promise<StoredPortrait | null>;
  /** Stores or replaces the portrait and returns its new version. */
  put(
    ownerId: string,
    campaignId: string,
    subject: PortraitSubject,
    image: { contentType: string; bytes: Buffer },
  ): Promise<number>;
  delete(ownerId: string, campaignId: string, subject: PortraitSubject): Promise<boolean>;
  deleteForCampaign(ownerId: string, campaignId: string): Promise<void>;
  /** How many portraits of any kind the owner has, optionally within one campaign. Used for storage quotas. */
  count(ownerId: string, campaignId?: string): Promise<number>;
}

/** Counts portrait generations per owner and day, so spend on the image provider stays bounded. */
export interface PortraitUsageRepo {
  /** Takes one unit for the day; false when the limit is already reached. */
  consume(ownerId: string, day: string, limit: number): Promise<boolean>;
  /** Gives one unit back, for example when the provider failed. */
  release(ownerId: string, day: string): Promise<void>;
}
