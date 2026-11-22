import { describe, expect, it } from 'vitest';
import { createMemoryPortraitRepo } from './memoryPortraitRepo';
import { createMemoryPortraitUsageRepo } from './memoryPortraitUsageRepo';
import { portraitKey, type PortraitSubject } from './types';

const ch = (id: string): PortraitSubject => ({ kind: 'character', id });
const npc = (id: string): PortraitSubject => ({ kind: 'npc', id });
const image = (n: number) => ({ contentType: 'image/png', bytes: Buffer.from([n]) });

describe('memory portrait repo', () => {
  it('round-trips an image and bumps the version on replace', async () => {
    const repo = createMemoryPortraitRepo();
    const v1 = await repo.put('o1', 'c1', ch('pc1'), image(1));
    const v2 = await repo.put('o1', 'c1', ch('pc1'), image(2));
    expect(v2).toBeGreaterThan(v1);
    const stored = await repo.get('o1', 'c1', ch('pc1'));
    expect(stored?.bytes).toEqual(Buffer.from([2]));
    expect(stored?.contentType).toBe('image/png');
    expect(stored?.version).toBe(v2);
  });

  it('never lets another owner read or delete a portrait', async () => {
    const repo = createMemoryPortraitRepo();
    await repo.put('o1', 'c1', ch('pc1'), image(1));
    expect(await repo.get('o2', 'c1', ch('pc1'))).toBeNull();
    expect(await repo.delete('o2', 'c1', ch('pc1'))).toBe(false);
    expect(await repo.get('o1', 'c1', ch('pc1'))).not.toBeNull();
    expect(await repo.delete('o1', 'c1', ch('pc1'))).toBe(true);
    expect(await repo.get('o1', 'c1', ch('pc1'))).toBeNull();
  });

  it('deleteForCampaign removes only that campaign for that owner', async () => {
    const repo = createMemoryPortraitRepo();
    await repo.put('o1', 'c1', ch('pc1'), image(1));
    await repo.put('o1', 'c2', ch('pc1'), image(2));
    await repo.put('o2', 'c1', ch('pc1'), image(3));
    await repo.deleteForCampaign('o1', 'c1');
    expect(await repo.get('o1', 'c1', ch('pc1'))).toBeNull();
    expect(await repo.get('o1', 'c2', ch('pc1'))).not.toBeNull();
    expect(await repo.get('o2', 'c1', ch('pc1'))).not.toBeNull();
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

describe('portrait kinds', () => {
  it('keeps a character and an npc with the same id separate', async () => {
    const repo = createMemoryPortraitRepo();
    await repo.put('o1', 'c1', ch('x'), image(1));
    await repo.put('o1', 'c1', npc('x'), image(2));
    expect((await repo.get('o1', 'c1', ch('x')))?.bytes).toEqual(Buffer.from([1]));
    expect((await repo.get('o1', 'c1', npc('x')))?.bytes).toEqual(Buffer.from([2]));
    expect(await repo.delete('o1', 'c1', npc('x'))).toBe(true);
    expect(await repo.get('o1', 'c1', npc('x'))).toBeNull();
    expect(await repo.get('o1', 'c1', ch('x'))).not.toBeNull();
  });

  it('counts and deletes both kinds together', async () => {
    const repo = createMemoryPortraitRepo();
    await repo.put('o1', 'c1', ch('a'), image(1));
    await repo.put('o1', 'c1', npc('a'), image(2));
    await repo.put('o1', 'c2', npc('b'), image(3));
    expect(await repo.count('o1', 'c1')).toBe(2);
    expect(await repo.count('o1')).toBe(3);
    await repo.deleteForCampaign('o1', 'c1');
    expect(await repo.count('o1')).toBe(1);
  });

  it('never lets another owner reach an npc portrait', async () => {
    const repo = createMemoryPortraitRepo();
    await repo.put('o1', 'c1', npc('a'), image(1));
    expect(await repo.get('o2', 'c1', npc('a'))).toBeNull();
    expect(await repo.delete('o2', 'c1', npc('a'))).toBe(false);
  });
});

describe('portraitKey', () => {
  it('keeps the legacy format for characters and prefixes npcs', () => {
    expect(portraitKey('c1', ch('x'))).toBe('c1:x');
    expect(portraitKey('c1', npc('x'))).toBe('npc:c1:x');
  });

  it('never gives an npc and a character the same key, whatever the ids are', () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(portraitKey(uuid, ch(`npc:${uuid}:x`))).not.toBe(portraitKey(uuid, npc('x')));
    expect(portraitKey(uuid, ch('x'))).not.toBe(portraitKey(uuid, npc('x')));
  });
});
