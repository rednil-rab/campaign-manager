import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryCampaignRepo } from './campaigns/memoryCampaignRepo';
import { mutateCampaign } from './campaigns/service';
import { HttpError } from './errors';
import { createMemoryShareRepo } from './shares/memoryShareRepo';
import { createMemoryUserRepo } from './users/memoryUserRepo';

const config = { jwtSecret: 'x'.repeat(32), bcryptRounds: 4, secureCookies: false };

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp({ users: createMemoryUserRepo(), campaigns: createMemoryCampaignRepo(), shares: createMemoryShareRepo(), config });
});

async function signUp(email: string): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'correct horse' });
  return String(res.headers['set-cookie']).split(';')[0];
}

const character = (over: Record<string, unknown> = {}) => ({
  id: 'pc-1',
  name: 'Aria',
  player: 'Sam',
  race: 'Elf',
  characterClass: 'Wizard',
  notes: '',
  stats: {},
  inventory: [],
  ...over,
});

describe('campaigns api', () => {
  it('requires a session', async () => {
    expect((await request(app).get('/api/campaigns')).status).toBe(401);
    expect((await request(app).post('/api/campaigns').send({ name: 'x' })).status).toBe(401);
  });

  it('creates, lists, renames and deletes a campaign', async () => {
    const cookie = await signUp('a@example.com');
    const created = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ name: 'Mine' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Mine');
    expect(created.body.characters).toEqual([]);
    const id = created.body.id as string;

    const list = await request(app).get('/api/campaigns').set('Cookie', cookie);
    expect(list.body.map((c: { id: string }) => c.id)).toEqual([id]);

    const renamed = await request(app).patch(`/api/campaigns/${id}`).set('Cookie', cookie).send({ name: 'Renamed' });
    expect(renamed.body.name).toBe('Renamed');
    expect(renamed.body.id).toBe(id);

    expect((await request(app).delete(`/api/campaigns/${id}`).set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).get('/api/campaigns').set('Cookie', cookie)).body).toEqual([]);
    expect((await request(app).delete(`/api/campaigns/${id}`).set('Cookie', cookie)).status).toBe(404);
  });

  it('creates a copy of the sample campaign with a fresh id', async () => {
    const cookie = await signUp('a@example.com');
    const one = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ sample: true });
    const two = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ sample: true });
    expect(one.body.name).toBe('The Ashen Crown');
    expect(one.body.characters.length).toBeGreaterThan(0);
    expect(one.body.id).not.toBe('ashen-crown');
    expect(one.body.id).not.toBe(two.body.id);
  });

  it('validates the campaign name', async () => {
    const cookie = await signUp('a@example.com');
    const post = (body: object) => request(app).post('/api/campaigns').set('Cookie', cookie).send(body);
    expect((await post({})).status).toBe(400);
    expect((await post({ name: '   ' })).status).toBe(400);
    expect((await post({ name: 'x'.repeat(81) })).status).toBe(400);
    expect((await post({ name: 42 })).status).toBe(400);
  });

  it("never exposes or changes another user's campaign", async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    const id = (await request(app).post('/api/campaigns').set('Cookie', alice).send({ name: 'Secret' })).body.id;

    expect((await request(app).get('/api/campaigns').set('Cookie', bob)).body).toEqual([]);
    expect((await request(app).patch(`/api/campaigns/${id}`).set('Cookie', bob).send({ name: 'Pwned' })).status).toBe(404);
    expect((await request(app).delete(`/api/campaigns/${id}`).set('Cookie', bob)).status).toBe(404);
    const put = await request(app).put(`/api/campaigns/${id}/characters/pc-1`).set('Cookie', bob).send(character());
    expect(put.status).toBe(404);

    const mine = await request(app).get('/api/campaigns').set('Cookie', alice);
    expect(mine.body[0].name).toBe('Secret');
    expect(mine.body[0].characters).toEqual([]);
  });
});

describe('characters api', () => {
  let cookie: string;
  let base: string;
  beforeEach(async () => {
    cookie = await signUp('a@example.com');
    const id = (await request(app).post('/api/campaigns').set('Cookie', cookie).send({ sample: true })).body.id;
    base = `/api/campaigns/${id}`;
  });

  const put = (id: string, body: unknown) => request(app).put(`${base}/characters/${id}`).set('Cookie', cookie).send(body as object);

  it('adds and updates a character, returning the updated campaign', async () => {
    const added = await put('pc-1', character());
    expect(added.status).toBe(200);
    expect(added.body.characters.find((p: { id: string }) => p.id === 'pc-1').name).toBe('Aria');

    const updated = await put('pc-1', character({ name: 'Aria the Bold', inventory: [{ id: 'i1', name: 'Rope', quantity: 2, notes: '' }] }));
    const stored = updated.body.characters.filter((p: { id: string }) => p.id === 'pc-1');
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Aria the Bold');
    expect(stored[0].inventory).toHaveLength(1);

    const list = await request(app).get('/api/campaigns').set('Cookie', cookie);
    expect(list.body[0].characters.some((p: { name: string }) => p.name === 'Aria the Bold')).toBe(true);
  });

  it('enforces domain rules with a 400 and the domain message', async () => {
    const unknownStat = await put('pc-1', character({ stats: { ghost: 1 } }));
    expect(unknownStat.status).toBe(400);
    expect(unknownStat.body.error).toMatch(/Unknown stat/);

    const unknownRace = await put('pc-1', character({ raceId: 'race-nope' }));
    expect(unknownRace.status).toBe(400);

    const badQuantity = await put('pc-1', character({ inventory: [{ id: 'i', name: 'Rope', quantity: 1.5, notes: '' }] }));
    expect(badQuantity.status).toBe(400);
  });

  it('rejects malformed bodies', async () => {
    expect((await put('pc-1', 'nope')).status).toBe(400);
    expect((await put('pc-1', character({ name: '   ' }))).status).toBe(400);
    expect((await put('pc-1', character({ name: 5 }))).status).toBe(400);
    expect((await put('pc-1', character({ stats: [] }))).status).toBe(400);
    expect((await put('pc-1', character({ stats: { str: '10' } }))).status).toBe(400);
    expect((await put('pc-1', character({ inventory: 'x' }))).status).toBe(400);
    expect((await put('pc-1', character({ notes: 'x'.repeat(5001) }))).status).toBe(400);
    expect((await put('other-id', character())).status).toBe(400);
  });

  it('ignores unexpected fields instead of storing them', async () => {
    const res = await put('pc-1', character({ isAdmin: true, __proto__: { polluted: true } }));
    expect(res.status).toBe(200);
    const stored = res.body.characters.find((p: { id: string }) => p.id === 'pc-1');
    expect(stored.isAdmin).toBeUndefined();
  });

  it('deleting a character also removes it from session attendance', async () => {
    const before = await request(app).get('/api/campaigns').set('Cookie', cookie);
    const kael = before.body[0].characters.find((p: { id: string }) => p.id === 'pc-kael');
    expect(before.body[0].sessions.some((s: { characterIds: string[] }) => s.characterIds.includes(kael.id))).toBe(true);

    const res = await request(app).delete(`${base}/characters/pc-kael`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.characters.some((p: { id: string }) => p.id === 'pc-kael')).toBe(false);
    expect(res.body.sessions.every((s: { characterIds: string[] }) => !s.characterIds.includes('pc-kael'))).toBe(true);
  });

  it('returns 404 for an unknown campaign', async () => {
    const res = await request(app).put('/api/campaigns/nope/characters/pc-1').set('Cookie', cookie).send(character());
    expect(res.status).toBe(404);
  });
});

describe('entity routes', () => {
  async function newCampaign() {
    const cookie = await signUp('a@example.com');
    const created = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ name: 'Mine' });
    const base = `/api/campaigns/${created.body.id}`;
    const put = (path: string, body: object) => request(app).put(`${base}${path}`).set('Cookie', cookie).send(body);
    const del = (path: string) => request(app).delete(`${base}${path}`).set('Cookie', cookie);
    return { cookie, base, put, del };
  }

  const npc = (over = {}) => ({ id: 'npc-1', name: 'Mara', role: '', location: '', disposition: 'ally', description: '', ...over });
  const quest = (over = {}) => ({
    id: 'q-1',
    title: 'Find the crown',
    status: 'active',
    description: '',
    prerequisiteQuestIds: [],
    ...over,
  });
  const session = (over = {}) => ({
    id: 's-1',
    number: 1,
    title: 'Start',
    playedOn: '2025-01-31',
    summary: '',
    questIds: [],
    npcIds: [],
    characterIds: [],
    ...over,
  });

  it('stores NPCs, quests and sessions that reference each other, and cascades deletes', async () => {
    const { put, del } = await newCampaign();
    expect((await put('/npcs/npc-1', npc())).status).toBe(200);
    expect((await put('/quests/q-1', quest({ giverNpcId: 'npc-1' }))).status).toBe(200);
    const withSession = await put('/sessions/s-1', session({ questIds: ['q-1'], npcIds: ['npc-1'] }));
    expect(withSession.body.sessions[0].questIds).toEqual(['q-1']);

    const afterNpc = await del('/npcs/npc-1');
    expect(afterNpc.body.quests[0].giverNpcId).toBeUndefined();
    expect(afterNpc.body.sessions[0].npcIds).toEqual([]);

    const afterQuest = await del('/quests/q-1');
    expect(afterQuest.body.quests).toEqual([]);
    expect(afterQuest.body.sessions[0].questIds).toEqual([]);

    expect((await del('/sessions/s-1')).body.sessions).toEqual([]);
  });

  it('rejects broken references and prerequisite cycles with 400', async () => {
    const { put } = await newCampaign();
    expect((await put('/quests/q-1', quest({ giverNpcId: 'ghost' }))).status).toBe(400);
    expect((await put('/sessions/s-1', session({ questIds: ['ghost'] }))).status).toBe(400);
    await put('/quests/q-1', quest());
    await put('/quests/q-2', quest({ id: 'q-2', prerequisiteQuestIds: ['q-1'] }));
    expect((await put('/quests/q-1', quest({ prerequisiteQuestIds: ['q-2'] }))).status).toBe(400);
  });

  it('validates the shape of the input', async () => {
    const { put } = await newCampaign();
    expect((await put('/quests/q-1', quest({ status: 'epic' }))).status).toBe(400);
    expect((await put('/npcs/npc-1', npc({ disposition: 'scary' }))).status).toBe(400);
    expect((await put('/sessions/s-1', session({ playedOn: 'tomorrow' }))).status).toBe(400);
    expect((await put('/sessions/s-1', session({ number: 1.5 }))).status).toBe(400);
    expect((await put('/quests/other', quest())).status).toBe(400);
    expect((await put('/npcs/npc-1', npc({ name: '  ' }))).status).toBe(400);
  });

  it('manages stats, races and classes and keeps characters consistent', async () => {
    const { put, del } = await newCampaign();
    await put('/stats/hp', { id: 'hp', name: 'HP' });
    await put('/races/elf', { id: 'elf', name: 'Elf' });
    await put('/classes/mage', { id: 'mage', name: 'Mage' });
    const withChar = await put('/characters/pc-1', character({ raceId: 'elf', classId: 'mage', stats: { hp: 7 } }));
    expect(withChar.status).toBe(200);

    expect((await put('/races/dup', { id: 'dup', name: 'elf' })).status).toBe(400);

    const noRace = await del('/races/elf');
    expect(noRace.body.characters[0].raceId).toBeUndefined();
    expect(noRace.body.characters[0].race).toBe('Elf');
    const noClass = await del('/classes/mage');
    expect(noClass.body.characters[0].characterClass).toBe('Mage');
    const noStat = await del('/stats/hp');
    expect(noStat.body.characters[0].stats).toEqual({});
  });

  it('does not let another user touch the campaign', async () => {
    const { base } = await newCampaign();
    const other = await signUp('b@example.com');
    const res = await request(app).put(`${base}/npcs/npc-1`).set('Cookie', other).send(npc());
    expect(res.status).toBe(404);
  });
});

describe('mutateCampaign concurrency', () => {
  it('re-applies the change when another write lands first, and gives up after repeated conflicts', async () => {
    const repo = createMemoryCampaignRepo();
    const base = (await repo.insert('u1', { id: 'c1', name: 'One', setting: '', tagline: '', statDefinitions: [], races: [], classes: [], sessions: [], quests: [], npcs: [], characters: [] })).campaign;
    expect(base.name).toBe('One');

    let interfered = false;
    const racing = {
      ...repo,
      async replace(...args: Parameters<typeof repo.replace>) {
        if (!interfered) {
          interfered = true;
          const cur = await repo.get('u1', 'c1');
          await repo.replace('u1', 'c1', cur!.version, { ...cur!.campaign, tagline: 'other writer' });
        }
        return repo.replace(...args);
      },
    };
    const result = await mutateCampaign(racing, 'u1', 'c1', (c) => ({ ...c, name: 'Two' }));
    expect(result.name).toBe('Two');
    expect(result.tagline).toBe('other writer');

    const alwaysConflicts = { ...repo, replace: async () => null };
    await expect(mutateCampaign(alwaysConflicts, 'u1', 'c1', (c) => c)).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<HttpError>);
  });
});
