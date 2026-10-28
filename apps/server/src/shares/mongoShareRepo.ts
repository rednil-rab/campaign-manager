import type { Db } from 'mongodb';
import type { ShareLink, ShareRepo } from './types';

export async function createMongoShareRepo(db: Db): Promise<ShareRepo> {
  const docs = db.collection<ShareLink>('shareLinks');
  await docs.createIndex({ token: 1 }, { unique: true });
  // One link per character; also serves lookups by campaign.
  await docs.createIndex({ campaignId: 1, characterId: 1 }, { unique: true });

  const toLink = ({ token, ownerId, campaignId, characterId, createdAt }: ShareLink): ShareLink => ({
    token,
    ownerId,
    campaignId,
    characterId,
    createdAt,
  });

  return {
    async upsert(link) {
      const createdAt = new Date();
      await docs.updateOne(
        { ownerId: link.ownerId, campaignId: link.campaignId, characterId: link.characterId },
        { $set: { token: link.token, createdAt } },
        { upsert: true },
      );
      return { ...link, createdAt };
    },
    async findByToken(token) {
      const doc = await docs.findOne({ token });
      return doc ? toLink(doc) : null;
    },
    async listForCampaign(ownerId, campaignId) {
      return (await docs.find({ ownerId, campaignId }).toArray()).map(toLink);
    },
    async deleteForCharacter(ownerId, campaignId, characterId) {
      await docs.deleteMany({ ownerId, campaignId, characterId });
    },
    async deleteForCampaign(ownerId, campaignId) {
      await docs.deleteMany({ ownerId, campaignId });
    },
  };
}
