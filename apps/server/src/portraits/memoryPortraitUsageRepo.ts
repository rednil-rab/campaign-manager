import type { PortraitUsageRepo } from './types';

/** In-memory counter used by tests. */
export function createMemoryPortraitUsageRepo(): PortraitUsageRepo {
  const counts = new Map<string, number>();
  const key = (ownerId: string, day: string) => `${ownerId}:${day}`;

  return {
    async consume(ownerId, day, limit) {
      const used = counts.get(key(ownerId, day)) ?? 0;
      if (used >= limit) return false;
      counts.set(key(ownerId, day), used + 1);
      return true;
    },
    async release(ownerId, day) {
      const used = counts.get(key(ownerId, day)) ?? 0;
      if (used > 0) counts.set(key(ownerId, day), used - 1);
    },
  };
}
