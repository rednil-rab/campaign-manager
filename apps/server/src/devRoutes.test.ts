import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryCampaignRepo } from './campaigns/memoryCampaignRepo';
import { createMemoryShareRepo } from './shares/memoryShareRepo';
import { createMemoryUserRepo } from './users/memoryUserRepo';

const config = { jwtSecret: 'x'.repeat(32), bcryptRounds: 4, secureCookies: false };
const build = (devTools: boolean) =>
  createApp({ users: createMemoryUserRepo(), campaigns: createMemoryCampaignRepo(), shares: createMemoryShareRepo(), config, devTools });

describe('dev tools', () => {
  it('keep token minting off unless enabled, while the docs stay public', async () => {
    const app = build(false);
    expect((await request(app).get('/api/docs')).status).toBe(200);
    expect((await request(app).get('/api/docs/openapi.json')).status).toBe(200);
    expect((await request(app).post('/api/dev/agent-token').send({})).status).toBe(404);
  });

  it('serve the docs and mint a token that the agent API accepts', async () => {
    const app = build(true);
    expect((await request(app).get('/api/docs')).status).toBe(200);
    const spec = await request(app).get('/api/docs/openapi.json');
    expect(spec.body.openapi).toBe('3.0.3');

    expect((await request(app).post('/api/dev/agent-token').send({})).status).toBe(401);

    const reg = await request(app).post('/api/auth/register').send({ email: 'dm@example.com', password: 'correct horse' });
    const cookie = String(reg.headers['set-cookie']).split(';')[0];
    const campaign = (await request(app).post('/api/campaigns').set('Cookie', cookie).send({ sample: true })).body;

    const noChar = await request(app).post('/api/dev/agent-token').set('Cookie', cookie).send({ campaignId: campaign.id, mode: 'player_action' });
    expect(noChar.status).toBe(400);
    const other = await request(app).post('/api/dev/agent-token').set('Cookie', cookie).send({ campaignId: 'nope', mode: 'recap' });
    expect(other.status).toBe(404);

    const minted = await request(app)
      .post('/api/dev/agent-token')
      .set('Cookie', cookie)
      .send({ campaignId: campaign.id, mode: 'player_action', characterId: campaign.characters[0].id });
    expect(minted.status).toBe(200);
    const ctx = await request(app).get('/api/agent/v1/context/player').set('Authorization', `Bearer ${minted.body.token}`);
    expect(ctx.status).toBe(200);
  });
});
