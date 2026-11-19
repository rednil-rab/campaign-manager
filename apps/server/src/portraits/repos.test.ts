import { describe, expect, it } from 'vitest';
import { createMemoryPortraitRepo } from './memoryPortraitRepo';
import { createMemoryPortraitUsageRepo } from './memoryPortraitUsageRepo';

const image = (n: number) => ({ contentType: 'image/png', bytes: Buffer.from([n]) });

describe('memory portrait repo', () => {
  it('round-trips an image and bumps the version on replace', async () => {
    const repo = createMemoryPortraitRepo();
    const v1 = await repo.put('o1', 'c1', 'pc1', image(1));
    const v2 = await repo.put('o1', 'c1', 'pc1', image(2));
    expect(v2).toBeGreaterThan(v1);
    const stored = await repo.get('o1', 'c1', 'pc1');
    expect(stored?.bytes).toEqual(Buffer.from([2]));
    expect(stored?.contentType).toBe('image/png');
    expect(stored?.version).toBe(v2);
  });

  it('never lets another owner read or delete a portrait', async () => {
    const repo = createMemoryPortraitRepo();
    await repo.put('o1', 'c1', 'pc1', image(1));
    expect(await repo.get('o2', 'c1', 'pc1')).toBeNull();
    expect(await repo.delete('o2', 'c1', 'pc1')).toBe(false);
    expect(await repo.get('o1', 'c1', 'pc1')).not.toBeNull();
    expect(await repo.delete('o1', 'c1', 'pc1')).toBe(true);
    expect(await repo.get('o1', 'c1', 'pc1')).toBeNull();
  });

  it('deleteForCampaign removes only that campaign for that owner', async () => {
    const repo = createMemoryPortraitRepo();
    await repo.put('o1', 'c1', 'pc1', image(1));
    await repo.put('o1', 'c2', 'pc1', image(2));
    await repo.put('o2', 'c1', 'pc1', image(3));
    await repo.deleteForCampaign('o1', 'c1');
    expect(await repo.get('o1', 'c1', 'pc1')).toBeNull();
    expect(await repo.get('o1', 'c2', 'pc1')).not.toBeNull();
    expect(await repo.get('o2', 'c1', 'pc1')).not.toBeNull();
  });
});

describe('memory portrait usage repo', () => {
  it('allows exactly the limit, then refuses, and release frees one', async () => {
    const usage = createMemoryPortraitUsageRepo();
    expect(await usage.consume('o1', '2026-11-19', 2)).toBe(true);
    expect(await usage.consume('o1', '2026-11-19', 2)).toBe(true);
    expect(await usage.consume('o1', '2026-11-19', 2)).toBe(false);
    await usage.release('o1', '2026-11-19');
    expect(await usage.consume('o1', '2026-11-19', 2)).toBe(true);
  });

  it('counts days and owners independently', async () => {
    const usage = createMemoryPortraitUsageRepo();
    expect(await usage.consume('o1', '2026-11-19', 1)).toBe(true);
    expect(await usage.consume('o2', '2026-11-19', 1)).toBe(true);
    expect(await usage.consume('o1', '2026-11-20', 1)).toBe(true);
    expect(await usage.consume('o1', '2026-11-19', 1)).toBe(false);
  });
});
