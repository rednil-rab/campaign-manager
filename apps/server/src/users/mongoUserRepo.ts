import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { DuplicateEmailError, type User, type UserRepo } from './types';

interface UserDoc {
  _id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

const toUser = ({ _id, ...rest }: UserDoc): User => ({ id: _id, ...rest });

const DUPLICATE_KEY = 11000;

export async function createMongoUserRepo(db: Db): Promise<UserRepo> {
  const users = db.collection<UserDoc>('users');
  await users.createIndex({ email: 1 }, { unique: true });

  return {
    async create({ email, passwordHash }) {
      const doc: UserDoc = { _id: randomUUID(), email, passwordHash, createdAt: new Date() };
      try {
        await users.insertOne(doc);
      } catch (err) {
        if ((err as { code?: number }).code === DUPLICATE_KEY) throw new DuplicateEmailError();
        throw err;
      }
      return toUser(doc);
    },
    async findByEmail(email) {
      const doc = await users.findOne({ email });
      return doc ? toUser(doc) : null;
    },
    async findById(id) {
      const doc = await users.findOne({ _id: id });
      return doc ? toUser(doc) : null;
    },
  };
}
