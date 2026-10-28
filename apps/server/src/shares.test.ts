import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryCampaignRepo } from './campaigns/memoryCampaignRepo';
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

const character = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  player: 'Sam',
  race: 'Elf',
  characterClass: 'Wizard',
  notes: 'DM SECRET',
  stats: {},
  inventory: [],
  ...over,
});

async function setup() {
  const cookie = await signUp('dm@example.com');
  const created = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ name: 'Camp' });
  const id = created.body.id as string;
  for (const [cid, name] of [['pc-1', 'Aria'], ['pc-2', 'Borin']]) {
    await request(app).put(`/api/campaigns/${id}/characters/${cid}`).set('Cookie', cookie).send(character(cid, name));
  }
  await request(app)
    .put(`/api/campaigns/${id}/npcs/n-1`)
    .set('Cookie', cookie)
    .send({ id: 'n-1', name: 'Hidden Baron', role: '', disposition: 'neutral', description: '', notes: '' });
  const share = await request(app).post(`/api/campaigns/${id}/characters/pc-1/share`).set('Cookie', cookie);
  return { cookie, id, token: share.body.token as string, share };
}

describe('share links', () => {
  it('lets the DM create a link and list it', async () => {
    const { cookie, id, token, share } = await setup();
    expect(share.status).toBe(201);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const list = await request(app).get(`/api/campaigns/${id}/shares`).set('Cookie', cookie);
    expect(list.body).toEqual([{ characterId: 'pc-1', token }]);
  });

  it('requires a session and ownership to manage links', async () => {
    const { id } = await setup();
    expect((await request(app).post(`/api/campaigns/${id}/characters/pc-1/share`)).status).toBe(401);
    const other = await signUp('other@example.com');
    expect((await request(app).post(`/api/campaigns/${id}/characters/pc-1/share`).set('Cookie', other)).status).toBe(404);
    expect((await request(app).get(`/api/campaigns/${id}/shares`).set('Cookie', other)).status).toBe(404);
  });

  it('404s when the character does not exist', async () => {
    const { cookie, id } = await setup();
    expect((await request(app).post(`/api/campaigns/${id}/characters/ghost/share`).set('Cookie', cookie)).status).toBe(404);
  });

  it('shows the player only their own sheet, without DM notes', async () => {
    const { token } = await setup();
    const res = await request(app).get(`/api/play/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.character.name).toBe('Aria');
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('DM SECRET');
    expect(json).not.toContain('Borin');
    expect(json).not.toContain('Hidden Baron');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });

  it('rejects malformed and unknown tokens', async () => {
    await setup();
    expect((await request(app).get('/api/play/short')).status).toBe(404);
    expect((await request(app).get(`/api/play/${'a'.repeat(43)}`)).status).toBe(404);
    expect((await request(app).put(`/api/play/${'a'.repeat(43)}`).send({ inventory: [], playerNotes: '' })).status).toBe(404);
  });

  it('lets the player edit inventory and notes only', async () => {
    const { cookie, id, token } = await setup();
    const inventory = [{ id: 'i-1', name: 'Lantern', quantity: 2, notes: '' }];
    const res = await request(app).put(`/api/play/${token}`).send({ inventory, playerNotes: 'My notes', name: 'Hacked', notes: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.character.inventory).toEqual(inventory);
    expect(res.body.character.playerNotes).toBe('My notes');

    const campaigns = await request(app).get('/api/campaigns').set('Cookie', cookie);
    const pc = campaigns.body.find((c: { id: string }) => c.id === id).characters.find((p: { id: string }) => p.id === 'pc-1');
    expect(pc).toMatchObject({ name: 'Aria', notes: 'DM SECRET', playerNotes: 'My notes', inventory });
  });

  it('validates player input', async () => {
    const { token } = await setup();
    const bad = (body: unknown) => request(app).put(`/api/play/${token}`).send(body as object);
    expect((await bad({ inventory: 'nope', playerNotes: '' })).status).toBe(400);
    expect((await bad({ inventory: [{ id: 'i', name: 'x', quantity: -1, notes: '' }], playerNotes: '' })).status).toBe(400);
    expect((await bad({ inventory: [], playerNotes: 'a'.repeat(5001) })).status).toBe(400);
  });

  it('keeps player notes when the DM saves the character', async () => {
    const { cookie, id, token } = await setup();
    await request(app).put(`/api/play/${token}`).send({ inventory: [], playerNotes: 'Mine' });
    const current = (await request(app).get('/api/campaigns').set('Cookie', cookie)).body[0].characters[0];
    await request(app).put(`/api/campaigns/${id}/characters/pc-1`).set('Cookie', cookie).send({ ...current, name: 'Aria II' });
    const view = await request(app).get(`/api/play/${token}`);
    expect(view.body.character).toMatchObject({ name: 'Aria II', playerNotes: 'Mine' });
  });

  it('replaces the old link when regenerated', async () => {
    const { cookie, id, token } = await setup();
    const again = await request(app).post(`/api/campaigns/${id}/characters/pc-1/share`).set('Cookie', cookie);
    expect(again.body.token).not.toBe(token);
    expect((await request(app).get(`/api/play/${token}`)).status).toBe(404);
    expect((await request(app).get(`/api/play/${again.body.token}`)).status).toBe(200);
  });

  it('stops working once revoked', async () => {
    const { cookie, id, token } = await setup();
    expect((await request(app).delete(`/api/campaigns/${id}/characters/pc-1/share`).set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).get(`/api/play/${token}`)).status).toBe(404);
  });

  it('stops working when the character or campaign is deleted', async () => {
    const a = await setup();
    await request(app).delete(`/api/campaigns/${a.id}/characters/pc-1`).set('Cookie', a.cookie);
    expect((await request(app).get(`/api/play/${a.token}`)).status).toBe(404);
    const shares = await request(app).get(`/api/campaigns/${a.id}/shares`).set('Cookie', a.cookie);
    expect(shares.body).toEqual([]);

    const again = await request(app).post(`/api/campaigns/${a.id}/characters/pc-2/share`).set('Cookie', a.cookie);
    await request(app).delete(`/api/campaigns/${a.id}`).set('Cookie', a.cookie);
    expect((await request(app).get(`/api/play/${again.body.token}`)).status).toBe(404);
  });

  it('rate limits the public endpoint', async () => {
    let last = 0;
    for (let i = 0; i < 125; i++) last = (await request(app).get('/api/play/short')).status;
    expect(last).toBe(429);
  });
});
