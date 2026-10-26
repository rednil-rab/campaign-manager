import type { Campaign } from '@questkeeper/domain';
import type { Db } from 'mongodb';
import type { CampaignRepo, StoredCampaign } from './types';

interface CampaignDoc {
  _id: string;
  ownerId: string;
  version: number;
  createdAt: Date;
  campaign: Campaign;
}

const toStored = ({ campaign, version }: CampaignDoc): StoredCampaign => ({ campaign, version });

export async function createMongoCampaignRepo(db: Db): Promise<CampaignRepo> {
  const docs = db.collection<CampaignDoc>('campaigns');
  await docs.createIndex({ ownerId: 1, createdAt: 1 });

  return {
    async list(ownerId) {
      return (await docs.find({ ownerId }).sort({ createdAt: 1 }).toArray()).map(toStored);
    },
    async get(ownerId, id) {
      const doc = await docs.findOne({ _id: id, ownerId });
      return doc ? toStored(doc) : null;
    },
    async insert(ownerId, campaign) {
      const doc: CampaignDoc = { _id: campaign.id, ownerId, version: 1, createdAt: new Date(), campaign };
      await docs.insertOne(doc);
      return toStored(doc);
    },
    async replace(ownerId, id, expectedVersion, campaign) {
      const doc = await docs.findOneAndUpdate(
        { _id: id, ownerId, version: expectedVersion },
        { $set: { campaign }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      return doc ? toStored(doc) : null;
    },
    async delete(ownerId, id) {
      return (await docs.deleteOne({ _id: id, ownerId })).deletedCount === 1;
    },
  };
}
