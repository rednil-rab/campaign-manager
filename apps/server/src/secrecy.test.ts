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

async function setup() {
  const reg = await request(app).post('/api/auth/register').send({ email: 'dm@example.com', password: 'correct horse' });
  const cookie = String(reg.headers['set-cookie']).split(';')[0];
  const created = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ name: 'Camp' });
  return { cookie, id: created.body.id as string };
}

const npc = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  name: 'Baron',
  role: '',
  location: '',
  disposition: 'neutral',
  description: '',
  ...over,
});

describe('secrecy fields', () => {
  it('stores knownToPlayers and secret on NPCs and quests', async () => {
    const { cookie, id } = await setup();
    const n = await request(app)
      .put(`/api/campaigns/${id}/npcs/n-1`)
      .set('Cookie', cookie)
      .send(npc({ knownToPlayers: true, secret: 'Is the cultist', extra: 'dropped' }));
    expect(n.body.npcs[0]).toMatchObject({ knownToPlayers: true, secret: 'Is the cultist' });
    expect(n.body.npcs[0]).not.toHaveProperty('extra');

    const q = await request(app)
      .put(`/api/campaigns/${id}/quests/q-1`)
      .set('Cookie', cookie)
      .send({ id: 'q-1', title: 'Find it', status: 'active', description: '', prerequisiteQuestIds: [], secret: 'It is a trap' });
    expect(q.body.quests[0]).toMatchObject({ secret: 'It is a trap' });
    expect(q.body.quests[0].knownToPlayers).toBeUndefined();
  });

  it('rejects invalid values', async () => {
    const { cookie, id } = await setup();
    const put = (body: object) => request(app).put(`/api/campaigns/${id}/npcs/n-1`).set('Cookie', cookie).send(body);
    expect((await put(npc({ knownToPlayers: 'yes' }))).status).toBe(400);
    expect((await put(npc({ secret: 'a'.repeat(5001) }))).status).toBe(400);
  });

  it('never leaks secrets or the event log through the player view', async () => {
    const { cookie, id } = await setup();
    await request(app).put(`/api/campaigns/${id}/npcs/n-1`).set('Cookie', cookie).send(npc({ secret: 'TOP SECRET' }));
    await request(app)
      .put(`/api/campaigns/${id}/characters/pc-1`)
      .set('Cookie', cookie)
      .send({ id: 'pc-1', name: 'Aria', stats: {}, inventory: [] });
    const share = await request(app).post(`/api/campaigns/${id}/characters/pc-1/share`).set('Cookie', cookie);
    const view = await request(app).get(`/api/play/${share.body.token}`);
    expect(JSON.stringify(view.body)).not.toContain('TOP SECRET');
  });
});

describe('player journal', () => {
  const quest = (over: Record<string, unknown> = {}) => ({
    id: 'q-1',
    title: 'Find the Crown',
    status: 'active',
    description: 'Somewhere cold',
    prerequisiteQuestIds: [],
    ...over,
  });

  async function setupJournal() {
    const { cookie, id } = await setup();
    const put = (kind: string, entityId: string, body: object) =>
      request(app).put(`/api/campaigns/${id}/${kind}/${entityId}`).set('Cookie', cookie).send(body);
    await put('characters', 'pc-1', { id: 'pc-1', name: 'Aria', stats: {}, inventory: [] });
    await put('npcs', 'n-1', npc({ knownToPlayers: true, secret: 'NPC SECRET' }));
    await put('npcs', 'n-2', npc({ id: 'n-2', name: 'Hidden Duke', secret: 'HIDDEN NPC SECRET' }));
    await put('quests', 'q-1', quest({ knownToPlayers: true, secret: 'QUEST SECRET', giverNpcId: 'n-2' }));
    await put('quests', 'q-2', quest({ id: 'q-2', title: 'Hidden Plot', secret: 'HIDDEN QUEST SECRET' }));
    const share = await request(app).post(`/api/campaigns/${id}/characters/pc-1/share`).set('Cookie', cookie);
    return { put, token: share.body.token as string };
  }

  it('shows revealed quests and npcs but never secrets or hidden records', async () => {
    const { token } = await setupJournal();
    const res = await request(app).get(`/api/play/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.npcs.map((n: { id: string }) => n.id)).toEqual(['n-1']);
    expect(res.body.quests.map((q: { id: string }) => q.id)).toEqual(['q-1']);
    expect(Object.keys(res.body).sort()).toEqual(['campaignName', 'character', 'npcs', 'quests']);
    const json = JSON.stringify(res.body);
    for (const text of ['SECRET', 'Hidden Duke', 'Hidden Plot']) expect(json).not.toContain(text);
  });

  it('removes an entry again when the DM un-reveals it', async () => {
    const { put, token } = await setupJournal();
    await put('npcs', 'n-1', npc({ knownToPlayers: false }));
    const res = await request(app).get(`/api/play/${token}`);
    expect(res.body.npcs).toEqual([]);
  });

  it('includes the journal in the response to a player edit', async () => {
    const { token } = await setupJournal();
    const res = await request(app).put(`/api/play/${token}`).send({ inventory: [], playerNotes: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.quests.map((q: { id: string }) => q.id)).toEqual(['q-1']);
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });

  it('returns no journal data for an unknown or revoked link', async () => {
    const res = await request(app).get(`/api/play/${'a'.repeat(43)}`);
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('quests');
  });
});
