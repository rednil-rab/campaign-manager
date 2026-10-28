export interface ShareLink {
  /** Unguessable secret that is the whole credential in the player's URL. */
  token: string;
  ownerId: string;
  campaignId: string;
  characterId: string;
  createdAt: Date;
}

export interface ShareRepo {
  /** Creates the link for a character, replacing any earlier one (which stops working). */
  upsert(link: Omit<ShareLink, 'createdAt'>): Promise<ShareLink>;
  findByToken(token: string): Promise<ShareLink | null>;
  listForCampaign(ownerId: string, campaignId: string): Promise<ShareLink[]>;
  deleteForCharacter(ownerId: string, campaignId: string, characterId: string): Promise<void>;
  deleteForCampaign(ownerId: string, campaignId: string): Promise<void>;
}
