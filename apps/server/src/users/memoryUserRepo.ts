import { randomUUID } from 'node:crypto';
import { DuplicateEmailError, type User, type UserRepo } from './types';

/** In-memory repository used by tests. */
export function createMemoryUserRepo(): UserRepo {
  const users = new Map<string, User>();
  return {
    async create({ email, passwordHash }) {
      if ([...users.values()].some((u) => u.email === email)) throw new DuplicateEmailError();
      const user: User = { id: randomUUID(), email, passwordHash, createdAt: new Date() };
      users.set(user.id, user);
      return user;
    },
    async findByEmail(email) {
      return [...users.values()].find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
  };
}
