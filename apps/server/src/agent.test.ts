import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { mintAgentToken, type AgentMode } from './agent/token';
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
  const created = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ sample: true });
  const campaign = created.body;
  const ownerId = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[1], 'base64url').toString()).sub as string;
  const kael = campaign.characters[0].id as string;

  const tokenFor = (mode: AgentMode = 'player_action', over: { characterId?: string; turnId?: string; campaignId?: string } = {}) =>
    mintAgentToken(config.jwtSecret, {
      ownerId,
      campaignId: over.campaignId ?? campaign.id,
      characterId: 'characterId' in over ? over.characterId : mode === 'player_action' ? kael : undefined,
      turnId: over.turnId ?? 'turn-1',
      mode,
    });
  const as = (token: string) => ({
    get: (url: string) => request(app).get(`/api/agent/v1${url}`).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: object) => request(app).post(`/api/agent/v1${url}`).set('Authorization', `Bearer ${token}`).send(body),
  });
  const reload = async () => (await request(app).get('/api/campaigns').set('Cookie', cookie)).body[0];
  return { cookie, campaign, ownerId, kael, tokenFor, as, reload };
}

const addRope = { id: 'c1', action: 'add_item', itemId: 'i-rope', name: 'Rope', quantity: 1 };

describe('agent auth', () => {
  it('rejects missing, malformed, expired and foreign tokens', async () => {
    const { campaign, ownerId, kael } = await setup();
    const get = (auth?: string) => {
      const r = request(app).get('/api/agent/v1/context/player');
      return (auth ? r.set('Authorization', auth) : r);
    };
    expect((await get()).status).toBe(401);
    expect((await get('Bearer nope')).status).toBe(401);
    const expired = jwt.sign({ own: ownerId, cid: campaign.id, tid: 't', mode: 'player_action', chr: kael }, config.jwtSecret, {
      audience: 'questkeeper-agent',
      expiresIn: -10,
    });
    expect((await get(`Bearer ${expired}`)).status).toBe(401);
    // Signed with the raw session secret instead of the derived agent key.
    const wrongKey = jwt.sign({ own: ownerId, cid: campaign.id, tid: 't', mode: 'player_action', chr: kael }, config.jwtSecret, {
      audience: 'questkeeper-agent',
    });
    expect((await get(`Bearer ${wrongKey}`)).status).toBe(401);
  });

  it('keeps agent tokens and session cookies apart', async () => {
    const { tokenFor } = await setup();
    const res = await request(app).get('/api/campaigns').set('Cookie', `qk_session=${tokenFor()}`);
    expect(res.status).toBe(401);
  });

  it('is scoped to the campaign in the token', async () => {
    const { tokenFor, as } = await setup();
    expect((await as(tokenFor('player_action', { campaignId: 'someone-elses' })).get('/context/player')).status).toBe(404);
  });
});

describe('agent context', () => {
  it('gives players only revealed records and no secrets', async () => {
    const { cookie, campaign, tokenFor, as } = await setup();
    const npc = campaign.npcs[0];
    await request(app).put(`/api/campaigns/${campaign.id}/npcs/${npc.id}`).set('Cookie', cookie).send({ ...npc, secret: 'NPC SECRET' });
    const hidden = await as(tokenFor()).get('/context/player');
    expect(hidden.status).toBe(200);
    expect(hidden.body.npcs).toEqual([]);
    await as(tokenFor()).post('/changes', { id: 'r1', action: 'reveal', type: 'npc', targetId: npc.id });
    const shown = await as(tokenFor()).get('/context/player');
    expect(shown.body.npcs.map((n: { id: string }) => n.id)).toEqual([npc.id]);
    expect(JSON.stringify(shown.body)).not.toContain('NPC SECRET');
    expect(shown.headers['cache-control']).toBe('no-store');
  });

  it('limits DM context to non-player modes', async () => {
    const { tokenFor, as } = await setup();
    expect((await as(tokenFor('player_action')).get('/context/dm')).status).toBe(403);
    const dm = await as(tokenFor('recap')).get('/context/dm');
    expect(dm.status).toBe(200);
    expect(dm.body.campaign.name).toBe('The Ashen Crown');
    expect((await as(tokenFor('recap')).get('/context/player')).status).toBe(400);
  });
});

describe('agent events and rolls', () => {
  it('logs events once per turn id and hides DM entries from players', async () => {
    const { tokenFor, as, reload } = await setup();
    const body = { id: 'e1', kind: 'narration', text: 'The door creaks.', visibility: 'table' };
    expect((await as(tokenFor()).post('/events', body)).status).toBe(201);
    await as(tokenFor()).post('/events', body);
    await as(tokenFor('player_action', { turnId: 'turn-2' })).post('/events', body);
    await as(tokenFor()).post('/events', { id: 'e2', kind: 'note', text: 'Baron is lying', visibility: 'dm' });
    const campaign = await reload();
    expect(campaign.events.map((e: { id: string }) => e.id)).toEqual(['turn-1:e1', 'turn-2:e1', 'turn-1:e2']);
    expect(campaign.events[0]).toMatchObject({ source: 'agent', visibility: 'table' });
    const ctx = await as(tokenFor()).get('/context/player');
    expect(ctx.body.events.map((e: { text: string }) => e.text)).not.toContain('Baron is lying');
  });

  it('validates events', async () => {
    const { tokenFor, as } = await setup();
    const post = (b: object) => as(tokenFor()).post('/events', b);
    expect((await post({ id: 'e', kind: 'action', text: 'x', visibility: 'table' })).status).toBe(400);
    expect((await post({ id: 'e', kind: 'note', text: '', visibility: 'table' })).status).toBe(400);
    expect((await post({ id: 'e', kind: 'note', text: 'x', visibility: 'everyone' })).status).toBe(400);
    expect((await post({ kind: 'note', text: 'x', visibility: 'dm' })).status).toBe(400);
  });

  it('rolls on the server, logs it, and replays a retried request', async () => {
    const { tokenFor, as, reload } = await setup();
    const first = await as(tokenFor()).post('/roll', { id: 'r1', dice: '2d6+1', reason: 'Perception' });
    expect(first.status).toBe(200);
    expect(first.body.rolls).toHaveLength(2);
    expect(first.body.total).toBe(first.body.rolls[0] + first.body.rolls[1] + 1);
    const again = await as(tokenFor()).post('/roll', { id: 'r1', dice: '2d6+1', reason: 'Perception' });
    expect(again.body).toEqual({ repeated: true, text: first.body.text });
    expect((await reload()).events).toHaveLength(1);
    expect((await as(tokenFor()).post('/roll', { id: 'r2', dice: '99d6' })).status).toBe(400);
  });
});

describe('agent changes', () => {
  it('applies item changes to the acting character only and logs them', async () => {
    const { tokenFor, as, reload, kael } = await setup();
    const res = await as(tokenFor()).post('/changes', addRope);
    expect(res.body).toEqual({ id: 'c1', action: 'add_item', status: 'applied' });
    const campaign = await reload();
    const mine = campaign.characters.find((p: { id: string }) => p.id === kael);
    expect(mine.inventory.some((i: { id: string }) => i.id === 'i-rope')).toBe(true);
    const others = campaign.characters.filter((p: { id: string }) => p.id !== kael);
    expect(others.every((p: { inventory: { id: string }[] }) => !p.inventory.some((i) => i.id === 'i-rope'))).toBe(true);
    expect(campaign.events.at(-1)).toMatchObject({ kind: 'change', visibility: 'table', source: 'agent' });
    // Retrying does not double the item.
    await as(tokenFor()).post('/changes', addRope);
    const after = (await reload()).characters.find((p: { id: string }) => p.id === kael);
    expect(after.inventory.filter((i: { id: string }) => i.id === 'i-rope')).toHaveLength(1);
  });

  it('rejects item changes without a character and invalid changes without failing', async () => {
    const { tokenFor, as } = await setup();
    const noChar = await as(tokenFor('dm_turn')).post('/changes', addRope);
    expect(noChar.status).toBe(200);
    expect(noChar.body.status).toBe('rejected');
    const bad = await as(tokenFor()).post('/changes', { ...addRope, id: 'c2', quantity: -3 });
    expect(bad.body.status).toBe('rejected');
    expect(bad.body.reason).toBeTruthy();
    expect((await as(tokenFor()).post('/changes', { id: 'c3', action: 'delete_campaign' })).status).toBe(400);
    expect((await as(tokenFor()).post('/changes', { action: 'reveal', type: 'npc', targetId: 'x' })).status).toBe(400);
  });

  it('holds deletes and quest endings for the DM, who can approve or reject them', async () => {
    const { cookie, campaign, tokenFor, as, reload, kael } = await setup();
    await as(tokenFor()).post('/changes', addRope);
    const remove = await as(tokenFor()).post('/changes', { id: 'c2', action: 'remove_item', itemId: 'i-rope' });
    expect(remove.body.status).toBe('pending_approval');
    const quest = campaign.quests[0];
    const end = await as(tokenFor()).post('/changes', { id: 'c3', action: 'set_quest_status', questId: quest.id, status: 'completed' });
    expect(end.body.status).toBe('pending_approval');

    // Nothing has happened yet.
    let state = await reload();
    expect(state.quests[0].status).toBe(quest.status);
    expect(state.pendingChanges).toHaveLength(2);
    const list = await request(app).get(`/api/campaigns/${campaign.id}/pending`).set('Cookie', cookie);
    expect(list.body.map((p: { id: string }) => p.id)).toEqual(['turn-1:c2', 'turn-1:c3']);

    const approved = await request(app).post(`/api/campaigns/${campaign.id}/pending/turn-1:c2/approve`).set('Cookie', cookie);
    expect(approved.status).toBe(200);
    const inventory = approved.body.characters.find((p: { id: string }) => p.id === kael).inventory;
    expect(inventory.some((i: { id: string }) => i.id === 'i-rope')).toBe(false);

    const rejected = await request(app).post(`/api/campaigns/${campaign.id}/pending/turn-1:c3/reject`).set('Cookie', cookie);
    expect(rejected.body.pendingChanges).toEqual([]);
    state = await reload();
    expect(state.quests[0].status).toBe(quest.status);
    expect((await request(app).post(`/api/campaigns/${campaign.id}/pending/turn-1:c3/reject`).set('Cookie', cookie)).status).toBe(400);
  });

  it('keeps the pending list owner-only', async () => {
    const { campaign } = await setup();
    expect((await request(app).get(`/api/campaigns/${campaign.id}/pending`)).status).toBe(401);
    const reg = await request(app).post('/api/auth/register').send({ email: 'other@example.com', password: 'correct horse' });
    const other = String(reg.headers['set-cookie']).split(';')[0];
    expect((await request(app).get(`/api/campaigns/${campaign.id}/pending`).set('Cookie', other)).status).toBe(404);
  });

  it('hides non-inventory changes from the table log', async () => {
    const { campaign, tokenFor, as, reload } = await setup();
    await as(tokenFor()).post('/changes', { id: 'c1', action: 'set_npc_disposition', npcId: campaign.npcs[0].id, disposition: 'hostile' });
    expect((await reload()).events.at(-1)).toMatchObject({ kind: 'change', visibility: 'dm' });
  });
});
