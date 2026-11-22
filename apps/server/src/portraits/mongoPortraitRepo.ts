import type { Binary, Db } from 'mongodb';
import { portraitKey, type PortraitKind, type PortraitRepo } from './types';

interface PortraitDoc {
  _id: string;
  ownerId: string;
  campaignId: string;
  /** Holds the character id for character portraits (as before) and the NPC id for NPC portraits. */
  characterId: string;
  /** Absent on documents written before NPC portraits existed, which means 'character'. */
  kind?: PortraitKind;
  contentType: string;
  bytes: Binary | Buffer;
  version: number;
  updatedAt: Date;
}

export async function createMongoPortraitRepo(db: Db): Promise<PortraitRepo> {
  const docs = db.collection<PortraitDoc>('portraits');
  await docs.createIndex({ ownerId: 1, campaignId: 1 });

  return {
    async get(ownerId, campaignId, subject) {
      const doc = await docs.findOne({ _id: portraitKey(campaignId, subject), ownerId });
      if (!doc) return null;
      const raw = doc.bytes as Binary;
      return { contentType: doc.contentType, bytes: Buffer.from(raw.buffer), version: doc.version };
    },
    async put(ownerId, campaignId, subject, image) {
      const doc = await docs.findOneAndUpdate(
        { _id: portraitKey(campaignId, subject), ownerId },
        {
          $set: {
            campaignId,
            characterId: subject.id,
            kind: subject.kind,
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
    async delete(ownerId, campaignId, subject) {
      return (await docs.deleteOne({ _id: portraitKey(campaignId, subject), ownerId })).deletedCount === 1;
    },
    async deleteForCampaign(ownerId, campaignId) {
      await docs.deleteMany({ ownerId, campaignId });
    },
    async count(ownerId, campaignId) {
      return docs.countDocuments(campaignId === undefined ? { ownerId } : { ownerId, campaignId });
    },
  };
}
