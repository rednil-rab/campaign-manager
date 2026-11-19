import type { Binary, Db } from 'mongodb';
import type { PortraitRepo } from './types';

interface PortraitDoc {
  _id: string;
  ownerId: string;
  campaignId: string;
  characterId: string;
  contentType: string;
  bytes: Binary | Buffer;
  version: number;
  updatedAt: Date;
}

export async function createMongoPortraitRepo(db: Db): Promise<PortraitRepo> {
  const docs = db.collection<PortraitDoc>('portraits');
  await docs.createIndex({ ownerId: 1, campaignId: 1 });
  const id = (campaignId: string, characterId: string) => `${campaignId}:${characterId}`;

  return {
    async get(ownerId, campaignId, characterId) {
      const doc = await docs.findOne({ _id: id(campaignId, characterId), ownerId });
      if (!doc) return null;
      const raw = doc.bytes as Binary;
      return { contentType: doc.contentType, bytes: Buffer.from(raw.buffer), version: doc.version };
    },
    async put(ownerId, campaignId, characterId, image) {
      const doc = await docs.findOneAndUpdate(
        { _id: id(campaignId, characterId), ownerId },
        {
          $set: {
            campaignId,
            characterId,
            contentType: image.contentType,
            bytes: image.bytes,
            updatedAt: new Date(),
          },
          $inc: { version: 1 },
        },
        { upsert: true, returnDocument: 'after' },
      );
      return doc!.version;
    },
    async delete(ownerId, campaignId, characterId) {
      return (await docs.deleteOne({ _id: id(campaignId, characterId), ownerId })).deletedCount === 1;
    },
    async deleteForCampaign(ownerId, campaignId) {
      await docs.deleteMany({ ownerId, campaignId });
    },
  };
}
