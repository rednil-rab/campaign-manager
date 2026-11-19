import type { Db } from 'mongodb';
import type { PortraitUsageRepo } from './types';

interface UsageDoc {
  _id: string;
  ownerId: string;
  count: number;
  expireAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createMongoPortraitUsageRepo(db: Db): Promise<PortraitUsageRepo> {
  const docs = db.collection<UsageDoc>('portraitUsage');
  await docs.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
  const id = (ownerId: string, day: string) => `${ownerId}:${day}`;

  return {
    async consume(ownerId, day, limit) {
      // The filter only matches while under the limit, so concurrent calls cannot exceed it.
      // At the limit the upsert collides on _id, which is reported as a duplicate-key error.
      try {
        await docs.updateOne(
          { _id: id(ownerId, day), count: { $lt: limit } },
          {
            $inc: { count: 1 },
            $setOnInsert: { ownerId, expireAt: new Date(Date.parse(`${day}T00:00:00Z`) + 2 * DAY_MS) },
          },
          { upsert: true },
        );
        return true;
      } catch (err) {
        if ((err as { code?: number }).code === 11000) return false;
        throw err;
      }
    },
    async release(ownerId, day) {
      await docs.updateOne({ _id: id(ownerId, day), count: { $gt: 0 } }, { $inc: { count: -1 } });
    },
  };
}
