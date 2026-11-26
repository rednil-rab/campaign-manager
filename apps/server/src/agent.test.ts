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
    patch: (url: string, body: object) => request(app).patch(`/api/agent/v1${url}`).set('Authorization', `Bearer ${token}`).send(body),
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

describe('agent characters', () => {
  const change = { id: 'p1', stats: { hp: 12 }, conditions: ['poisoned'], inventory: { upsert: [{ id: 'i-lamp', name: 'Lamp', quantity: 1, notes: '' }] } };

  it('lets DM and recap tokens read every character, with the DM notes', async () => {
    const { campaign, tokenFor, as } = await setup();
    for (const mode of ['dm_turn', 'recap'] as const) {
      const list = await as(tokenFor(mode)).get('/characters');
      expect(list.status).toBe(200);
      expect(list.body.map((p: { id: string }) => p.id)).toEqual(campaign.characters.map((p: { id: string }) => p.id));
      expect(Object.keys(list.body[0]).sort()).toEqual(['characterClass', 'id', 'name', 'player', 'race']);
      const one = await as(tokenFor(mode)).get(`/characters/${campaign.characters[1].id}`);
      expect(one.body.id).toBe(campaign.characters[1].id);
      expect(one.body).toHaveProperty('notes');
    }
    expect((await as(tokenFor('dm_turn')).get('/characters/ghost')).status).toBe(404);
  });

  it('limits a player token to its own character', async () => {
    const { campaign, kael, tokenFor, as } = await setup();
    const other = campaign.characters[1].id;
    const list = await as(tokenFor()).get('/characters');
    expect(list.body.map((p: { id: string }) => p.id)).toEqual([kael]);
    const own = await as(tokenFor()).get(`/characters/${kael}`);
    expect(own.status).toBe(200);
    expect(own.body).not.toHaveProperty('notes');
    expect(own.body).toHaveProperty('conditions');
    expect((await as(tokenFor()).get(`/characters/${other}`)).status).toBe(403);
    expect((await as(tokenFor()).patch(`/characters/${other}`, change)).status).toBe(403);
  });

  it('updates stats, conditions and inventory directly, and logs one DM-only event per request', async () => {
    const { kael, tokenFor, as, reload } = await setup();
    const res = await as(tokenFor('dm_turn')).patch(`/characters/${kael}`, change);
    expect(res.status).toBe(200);
    expect(res.body.stats.hp).toBe(12);
    expect(res.body.conditions).toEqual(['poisoned']);
    await as(tokenFor('dm_turn')).patch(`/characters/${kael}`, change);
    const stored = (await reload()).characters.find((p: { id: string }) => p.id === kael);
    expect(stored.inventory.filter((i: { id: string }) => i.id === 'i-lamp')).toHaveLength(1);
    const logged = (await reload()).events.filter((e: { id: string }) => e.id === 'audit:turn-1:p1');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ kind: 'change', visibility: 'dm', source: 'agent', characterId: kael });
    await as(tokenFor('dm_turn')).patch(`/characters/${kael}`, { id: 'p2', inventory: { remove: ['i-lamp'] }, notes: 'DM only' });
    const after = (await reload()).characters.find((p: { id: string }) => p.id === kael);
    expect(after.inventory.some((i: { id: string }) => i.id === 'i-lamp')).toBe(false);
    expect(after.notes).toBe('DM only');
  });

  it('lets a player token update its own sheet but not the DM notes', async () => {
    const { kael, tokenFor, as } = await setup();
    const ok = await as(tokenFor()).patch(`/characters/${kael}`, { id: 'p1', conditions: ['prone'], playerNotes: 'Hi' });
    expect(ok.status).toBe(200);
    expect(ok.body).not.toHaveProperty('notes');
    expect(ok.body).toMatchObject({ conditions: ['prone'], playerNotes: 'Hi' });
    expect((await as(tokenFor()).patch(`/characters/${kael}`, { id: 'p2', notes: 'sneaky' })).status).toBe(403);
  });

  it('keeps recap tokens read-only and rejects bad input without changing anything', async () => {
    const { kael, tokenFor, as, reload } = await setup();
    const before = await reload();
    expect((await as(tokenFor('recap')).patch(`/characters/${kael}`, change)).status).toBe(403);
    const dm = as(tokenFor('dm_turn'));
    expect((await dm.patch(`/characters/${kael}`, { id: 'p1' })).status).toBe(400);
    expect((await dm.patch(`/characters/${kael}`, { id: 'p1', stats: { ghost: 1 } })).status).toBe(400);
    expect((await dm.patch(`/characters/${kael}`, { id: 'p1', stats: { hp: 2.5 } })).status).toBe(400);
    expect((await dm.patch(`/characters/${kael}`, { id: 'p1', conditions: Array.from({ length: 21 }, (_, i) => `c${i}`) })).status).toBe(400);
    expect((await dm.patch('/characters/ghost', change)).status).toBe(404);
    expect(await reload()).toEqual(before);
    expect((await request(app).get('/api/agent/v1/characters')).status).toBe(401);
  });

  it('keeps a client-chosen event id from suppressing the DM audit entry', async () => {
    const { kael, tokenFor, as, reload } = await setup();
    await as(tokenFor()).post('/events', { id: 'p1:log', kind: 'note', text: 'squatting', visibility: 'table' });
    await as(tokenFor('dm_turn')).patch(`/characters/${kael}`, { id: 'p1', conditions: ['prone'] });
    const audit = (await reload()).events.filter((e: { kind: string; source: string; text: string }) => e.kind === 'change' && e.text.startsWith('Agent updated'));
    expect(audit).toHaveLength(1);
  });
});

describe('agent records secrecy and conflicts', () => {
  it('never puts DM notes or session summaries into a player-bound response', async () => {
    const { campaign, cookie, kael, tokenFor, as } = await setup();
    const base = `/api/campaigns/${campaign.id}`;
    const pc = campaign.characters[0];
    await request(app).put(`${base}/characters/${kael}`).set('Cookie', cookie).send({ ...pc, notes: 'DM-NOTE-MARKER' });
    const s = campaign.sessions[0];
    await request(app).put(`${base}/sessions/${s.id}`).set('Cookie', cookie).send({ ...s, summary: 'SUMMARY-MARKER' });
    await as(tokenFor('dm_turn')).patch(`/characters/${campaign.characters[1].id}`, { id: 'x1', notes: 'OTHER-NOTE-MARKER' });

    const player = as(tokenFor());
    const bodies = [
      await player.get('/characters'),
      await player.get(`/characters/${kael}`),
      await player.patch(`/characters/${kael}`, { id: 'x2', conditions: ['prone'] }),
      await player.get('/sessions'),
      await player.get(`/sessions/${s.id}`),
      await player.get('/context/player'),
    ];
    for (const r of bodies) expect(r.status).toBe(200);
    const json = JSON.stringify(bodies.map((r) => r.body));
    for (const marker of ['DM-NOTE-MARKER', 'SUMMARY-MARKER', 'OTHER-NOTE-MARKER']) expect(json).not.toContain(marker);
  });

  it('answers 409 when the save keeps conflicting', async () => {
    const campaigns = createMemoryCampaignRepo();
    let conflict = false;
    const conflicting = { ...campaigns, replace: async (...args: Parameters<typeof campaigns.replace>) => (conflict ? null : campaigns.replace(...args)) };
    const conflictApp = createApp({ users: createMemoryUserRepo(), campaigns: conflicting, shares: createMemoryShareRepo(), config });
    const reg = await request(conflictApp).post('/api/auth/register').send({ email: 'dm@example.com', password: 'correct horse' });
    const cookie = String(reg.headers['set-cookie']).split(';')[0];
    const created = (await request(conflictApp).post('/api/campaigns').set('Cookie', cookie).send({ sample: true })).body;
    const ownerId = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[1], 'base64url').toString()).sub as string;
    const token = mintAgentToken(config.jwtSecret, { ownerId, campaignId: created.id, turnId: 't', mode: 'dm_turn' });
    conflict = true;
    const res = await request(conflictApp)
      .patch(`/api/agent/v1/characters/${created.characters[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'p1', conditions: ['prone'] });
    expect(res.status).toBe(409);
  });
});

describe('agent sessions', () => {
  const create = { id: 's-new', title: 'Into the marsh', playedOn: '2026-11-26' };

  it('lets DM and recap tokens read full sessions', async () => {
    const { campaign, tokenFor, as } = await setup();
    for (const mode of ['dm_turn', 'recap'] as const) {
      const list = await as(tokenFor(mode)).get('/sessions');
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(campaign.sessions.length);
      expect(list.body[0]).toHaveProperty('summary');
      const one = await as(tokenFor(mode)).get(`/sessions/${campaign.sessions[0].id}`);
      expect(one.body.id).toBe(campaign.sessions[0].id);
    }
    expect((await as(tokenFor('dm_turn')).get('/sessions/ghost')).status).toBe(404);
  });

  it('shows a player token only the sessions its character attended, without the summary', async () => {
    const { tokenFor, as } = await setup();
    await as(tokenFor('dm_turn')).post('/sessions', create);
    const list = await as(tokenFor()).get('/sessions');
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body.map((s: { id: string }) => s.id)).not.toContain('s-new');
    for (const s of list.body) expect(Object.keys(s).sort()).toEqual(['id', 'number', 'playedOn', 'title']);
    expect((await as(tokenFor()).get('/sessions/s-new')).status).toBe(404);
    const own = await as(tokenFor()).get(`/sessions/${list.body[0].id}`);
    expect(own.status).toBe(200);
    expect(own.body).not.toHaveProperty('summary');
  });

  it('creates a numbered session once, even when the request is retried', async () => {
    const { campaign, tokenFor, as, reload } = await setup();
    const first = await as(tokenFor('dm_turn')).post('/sessions', create);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ id: 's-new', number: campaign.sessions.length + 1, summary: '' });
    const again = await as(tokenFor('dm_turn')).post('/sessions', create);
    expect(again.status).toBe(200);
    const stored = (await reload()).sessions;
    expect(stored.filter((s: { id: string }) => s.id === 's-new')).toHaveLength(1);
    const today = await as(tokenFor('dm_turn')).post('/sessions', { id: 's-today', title: 'Today' });
    expect(today.body.playedOn).toBe(new Date().toISOString().slice(0, 10));
  });

  it('rejects bad session input and non-DM writers', async () => {
    const { campaign, tokenFor, as } = await setup();
    const dm = as(tokenFor('dm_turn'));
    expect((await dm.post('/sessions', { ...create, playedOn: 'tomorrow' })).status).toBe(400);
    expect((await dm.post('/sessions', { ...create, questIds: ['ghost'] })).status).toBe(400);
    expect((await dm.post('/sessions', { id: 's-x' })).status).toBe(400);
    for (const mode of ['recap', 'player_action'] as const) {
      const w = as(tokenFor(mode));
      expect((await w.post('/sessions', create)).status).toBe(403);
      expect((await w.patch(`/sessions/${campaign.sessions[0].id}`, { id: 'u1', summary: 'x' })).status).toBe(403);
      expect((await w.post(`/sessions/${campaign.sessions[0].id}/end`, {})).status).toBe(403);
    }
  });

  it('replaces the summary, appends a note once, and logs a DM-only event', async () => {
    const { campaign, tokenFor, as, reload } = await setup();
    const id = campaign.sessions[0].id;
    const dm = as(tokenFor('dm_turn'));
    const replaced = await dm.patch(`/sessions/${id}`, { id: 'u1', summary: 'Fresh', title: 'Renamed' });
    expect(replaced.body).toMatchObject({ summary: 'Fresh', title: 'Renamed' });
    await dm.patch(`/sessions/${id}`, { id: 'u2', note: 'The bridge fell.' });
    await dm.patch(`/sessions/${id}`, { id: 'u2', note: 'The bridge fell.' });
    const stored = (await reload()).sessions.find((s: { id: string }) => s.id === id);
    expect(stored.summary).toBe('Fresh\nThe bridge fell.');
    const events = (await reload()).events.filter((e: { id: string }) => e.id.startsWith('audit:turn-1:u'));
    expect(events.map((e: { id: string }) => e.id)).toEqual(['audit:turn-1:u1', 'audit:turn-1:u2']);
    expect(events[0]).toMatchObject({ kind: 'change', visibility: 'dm', source: 'agent' });
    expect((await dm.patch(`/sessions/${id}`, { id: 'u3' })).status).toBe(400);
    expect((await dm.patch('/sessions/ghost', { id: 'u3', summary: 'x' })).status).toBe(404);
  });

  it('ends a session once and still allows edits afterwards', async () => {
    const { campaign, tokenFor, as, reload } = await setup();
    const id = campaign.sessions[0].id;
    const dm = as(tokenFor('dm_turn'));
    const ended = await dm.post(`/sessions/${id}/end`, {});
    expect(ended.status).toBe(200);
    expect(typeof ended.body.endedAt).toBe('string');
    const again = await dm.post(`/sessions/${id}/end`, {});
    expect(again.body.endedAt).toBe(ended.body.endedAt);
    expect((await dm.patch(`/sessions/${id}`, { id: 'u1', summary: 'Late edit' })).status).toBe(200);
    expect((await reload()).sessions.find((s: { id: string }) => s.id === id)).toMatchObject({ summary: 'Late edit', endedAt: ended.body.endedAt });
    expect((await dm.post('/sessions/ghost/end', {})).status).toBe(404);
  });
});
