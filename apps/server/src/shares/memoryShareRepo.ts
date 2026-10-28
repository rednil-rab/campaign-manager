import type { ShareLink, ShareRepo } from './types';

/** In-memory repository used by tests. */
export function createMemoryShareRepo(): ShareRepo {
  const links = new Map<string, ShareLink>();
  const sameCharacter = (l: ShareLink, ownerId: string, campaignId: string, characterId: string) =>
    l.ownerId === ownerId && l.campaignId === campaignId && l.characterId === characterId;

  return {
    async upsert(link) {
      for (const [token, l] of links) {
        if (sameCharacter(l, link.ownerId, link.campaignId, link.characterId)) links.delete(token);
      }
      const stored: ShareLink = { ...link, createdAt: new Date() };
      links.set(link.token, stored);
      return { ...stored };
    },
    async findByToken(token) {
      const l = links.get(token);
      return l ? { ...l } : null;
    },
    async listForCampaign(ownerId, campaignId) {
      return [...links.values()].filter((l) => l.ownerId === ownerId && l.campaignId === campaignId).map((l) => ({ ...l }));
    },
    async deleteForCharacter(ownerId, campaignId, characterId) {
      for (const [token, l] of links) {
        if (sameCharacter(l, ownerId, campaignId, characterId)) links.delete(token);
      }
    },
    async deleteForCampaign(ownerId, campaignId) {
      for (const [token, l] of links) {
        if (l.ownerId === ownerId && l.campaignId === campaignId) links.delete(token);
      }
    },
  };
}
