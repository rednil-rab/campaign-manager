import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryCampaignRepo } from './campaigns/memoryCampaignRepo';
import { HttpError } from './errors';
import { MAX_PORTRAIT_BYTES } from './portraits/image';
import type { PortraitGenerator } from './portraits/generator';
import { createMemoryShareRepo } from './shares/memoryShareRepo';
import { mintAgentToken } from './agent/token';
import { createMemoryUserRepo } from './users/memoryUserRepo';

const config = { jwtSecret: 'x'.repeat(32), bcryptRounds: 4, secureCookies: false };

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function makeApp(opts: { generator?: PortraitGenerator; limit?: number; globalLimit?: number; limits?: { perCampaign: number; perOwner: number } } = {}) {
  const store = createMemoryCampaignRepo();
  // Lets a test make saving the campaign fail, to exercise the cleanup after a failed upload.
  const failing = { on: false };
  const campaigns = { ...store, replace: async (...args: Parameters<typeof store.replace>) => (failing.on ? null : store.replace(...args)) };
  const app = createApp({
    users: createMemoryUserRepo(),
    campaigns,
    shares: createMemoryShareRepo(),
    config,
    portraitGenerator: opts.generator,
    portraitDailyLimit: opts.limit ?? 20,
    portraitGlobalDailyLimit: opts.globalLimit,
    portraitLimits: opts.limits,
  });

  const signUp = async (email: string) => {
    const res = await request(app).post('/api/auth/register').send({ email, password: 'correct horse' });
    return String(res.headers['set-cookie']).split(';')[0];
  };

  const setup = async (email = 'dm@example.com') => {
    const cookie = await signUp(email);
    const created = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ name: 'Camp' });
    const id = created.body.id as string;
    for (const [cid, name] of [['pc-1', 'Aria'], ['pc-2', 'Borin']]) {
      await request(app)
        .put(`/api/campaigns/${id}/characters/${cid}`)
        .set('Cookie', cookie)
        .send({ id: cid, name, notes: 'DM SECRET', stats: {}, inventory: [] });
    }
    const url = (cid = 'pc-1') => `/api/campaigns/${id}/characters/${cid}/portrait`;
    return { cookie, id, url };
  };

  const upload = (cookie: string, url: string, bytes: Buffer, type = 'image/png') =>
    request(app).put(url).set('Cookie', cookie).set('Content-Type', type).send(bytes);

  const share = async (cookie: string, id: string, cid = 'pc-1') =>
    (await request(app).post(`/api/campaigns/${id}/characters/${cid}/share`).set('Cookie', cookie)).body.token as string;

  const versionOf = (campaign: { characters: { id: string; portraitVersion?: number }[] }, cid = 'pc-1') =>
    campaign.characters.find((c) => c.id === cid)?.portraitVersion;

  return { app, signUp, setup, upload, share, versionOf, failing };
}

const fakeGenerator = (impl?: () => Promise<{ contentType: string; bytes: Buffer }>): PortraitGenerator => ({
  generate: impl ?? (async () => ({ contentType: 'image/webp', bytes: webp })),
});

describe('portrait upload and view', () => {
  it('accepts jpeg, png and webp and records the version on the character', async () => {
    const { setup, upload, versionOf } = makeApp();
    const { cookie, url } = await setup();
    for (const [bytes, type] of [[jpeg, 'image/jpeg'], [png, 'image/png'], [webp, 'image/webp']] as const) {
      const res = await upload(cookie, url(), bytes, type);
      expect(res.status).toBe(200);
      expect(versionOf(res.body)).toBeGreaterThan(0);
    }
  });

  it('rejects bytes that are not an image even when the header lies, and stores nothing', async () => {
    const { app, setup, upload } = makeApp();
    const { cookie, url } = await setup();
    expect((await upload(cookie, url(), svg, 'image/png')).status).toBe(400);
    expect((await upload(cookie, url(), Buffer.from('<html></html>'), 'image/jpeg')).status).toBe(400);
    expect((await upload(cookie, url(), png, 'text/plain')).status).toBe(400);
    expect((await request(app).get(url()).set('Cookie', cookie)).status).toBe(404);
  });

  it('rejects an image over the size limit', async () => {
    const { setup, upload } = makeApp();
    const { cookie, url } = await setup();
    const big = Buffer.concat([png, Buffer.alloc(MAX_PORTRAIT_BYTES)]);
    expect((await upload(cookie, url(), big)).status).toBe(413);
  });

  it('serves the image with its sniffed type and safe headers', async () => {
    const { app, setup, upload } = makeApp();
    const { cookie, url } = await setup();
    await upload(cookie, url(), jpeg, 'image/png');
    const res = await request(app).get(url()).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.body).toEqual(jpeg);
  });

  it('answers 404 when there is no portrait or no such character', async () => {
    const { app, setup, upload } = makeApp();
    const { cookie, url } = await setup();
    expect((await request(app).get(url()).set('Cookie', cookie)).status).toBe(404);
    expect((await upload(cookie, url('ghost'), png)).status).toBe(404);
  });

  it('bumps the version when the portrait is replaced', async () => {
    const { setup, upload, versionOf } = makeApp();
    const { cookie, url } = await setup();
    const first = versionOf((await upload(cookie, url(), png)).body)!;
    const second = versionOf((await upload(cookie, url(), jpeg, 'image/jpeg')).body)!;
    expect(second).toBeGreaterThan(first);
  });

  it('removes the portrait and clears the version', async () => {
    const { app, setup, upload, versionOf } = makeApp();
    const { cookie, url } = await setup();
    await upload(cookie, url(), png);
    const res = await request(app).delete(url()).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(versionOf(res.body)).toBeUndefined();
    expect((await request(app).get(url()).set('Cookie', cookie)).status).toBe(404);
  });

  it('ignores a portraitVersion sent by the client when the DM saves the character', async () => {
    const { app, setup, upload, versionOf } = makeApp();
    const { cookie, id, url } = await setup();
    const real = versionOf((await upload(cookie, url(), png)).body);
    const res = await request(app)
      .put(`/api/campaigns/${id}/characters/pc-1`)
      .set('Cookie', cookie)
      .send({ id: 'pc-1', name: 'Aria', stats: {}, inventory: [], portraitVersion: 999 });
    expect(versionOf(res.body)).toBe(real);
  });
});

describe('portrait access control', () => {
  it('requires a session on every portrait route', async () => {
    const { app, setup } = makeApp({ generator: fakeGenerator() });
    const { url } = await setup();
    expect((await request(app).get(url())).status).toBe(401);
    expect((await request(app).put(url()).set('Content-Type', 'image/png').send(png)).status).toBe(401);
    expect((await request(app).delete(url())).status).toBe(401);
    expect((await request(app).post(`${url()}/generate`).send({ prompt: 'x' })).status).toBe(401);
  });

  it("never lets another user read, replace, delete or generate for someone's character", async () => {
    const { app, setup, signUp, upload } = makeApp({ generator: fakeGenerator() });
    const { cookie, url } = await setup();
    await upload(cookie, url(), png);
    const other = await signUp('other@example.com');
    expect((await request(app).get(url()).set('Cookie', other)).status).toBe(404);
    expect((await upload(other, url(), jpeg, 'image/jpeg')).status).toBe(404);
    expect((await request(app).delete(url()).set('Cookie', other)).status).toBe(404);
    expect((await request(app).post(`${url()}/generate`).set('Cookie', other).send({ prompt: 'x' })).status).toBe(404);
    const mine = await request(app).get(url()).set('Cookie', cookie);
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual(png);
  });

  it('removes the portrait when the character or the campaign is deleted', async () => {
    const { app, setup, upload } = makeApp();
    const { cookie, id, url } = await setup();
    await upload(cookie, url('pc-1'), png);
    await upload(cookie, url('pc-2'), png);
    await request(app).delete(`/api/campaigns/${id}/characters/pc-1`).set('Cookie', cookie);
    expect((await request(app).get(url('pc-1')).set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).get(url('pc-2')).set('Cookie', cookie)).status).toBe(200);
    await request(app).delete(`/api/campaigns/${id}`).set('Cookie', cookie);
    expect((await request(app).get(url('pc-2')).set('Cookie', cookie)).status).toBe(404);
  });
});

describe('portrait generation', () => {
  it('returns a preview and saves nothing', async () => {
    const { app, setup } = makeApp({ generator: fakeGenerator() });
    const { cookie, url } = await setup();
    const res = await request(app).post(`${url()}/generate`).set('Cookie', cookie).send({ prompt: 'a dwarf' });
    expect(res.status).toBe(200);
    expect(res.body.contentType).toBe('image/webp');
    expect(Buffer.from(res.body.data, 'base64')).toEqual(webp);
    expect((await request(app).get(url()).set('Cookie', cookie)).status).toBe(404);
  });

  it('validates the prompt', async () => {
    const { app, setup } = makeApp({ generator: fakeGenerator() });
    const { cookie, url } = await setup();
    for (const prompt of [undefined, '', '   ', 5, 'x'.repeat(1001)]) {
      const res = await request(app).post(`${url()}/generate`).set('Cookie', cookie).send({ prompt });
      expect(res.status).toBe(400);
    }
  });

  it('enforces the daily limit but still allows uploads', async () => {
    const { app, setup, upload } = makeApp({ generator: fakeGenerator(), limit: 2 });
    const { cookie, url } = await setup();
    const gen = () => request(app).post(`${url()}/generate`).set('Cookie', cookie).send({ prompt: 'x' });
    expect((await gen()).status).toBe(200);
    expect((await gen()).status).toBe(200);
    const third = await gen();
    expect(third.status).toBe(429);
    expect(third.body.error).toMatch(/limit/i);
    expect((await upload(cookie, url(), png)).status).toBe(200);
  });

  it('gives the unit back when the provider fails, so failures do not use up the limit', async () => {
    let fail = true;
    const generator = fakeGenerator(async () => {
      if (fail) throw new HttpError(502, 'provider down');
      return { contentType: 'image/webp', bytes: webp };
    });
    const { app, setup } = makeApp({ generator, limit: 1 });
    const { cookie, url } = await setup();
    const gen = () => request(app).post(`${url()}/generate`).set('Cookie', cookie).send({ prompt: 'x' });
    expect((await gen()).status).toBe(502);
    fail = false;
    expect((await gen()).status).toBe(200);
  });

  it('passes a provider refusal through as 422', async () => {
    const generator = fakeGenerator(async () => {
      throw new HttpError(422, 'refused');
    });
    const { app, setup } = makeApp({ generator });
    const { cookie, url } = await setup();
    expect((await request(app).post(`${url()}/generate`).set('Cookie', cookie).send({ prompt: 'x' })).status).toBe(422);
  });

  it('answers 503 when generation is not configured', async () => {
    const { app, setup } = makeApp();
    const { cookie, url } = await setup();
    const res = await request(app).post(`${url()}/generate`).set('Cookie', cookie).send({ prompt: 'x' });
    expect(res.status).toBe(503);
  });
});

describe('player portrait', () => {
  it("serves only that character's portrait through the share link", async () => {
    const { app, setup, upload, share } = makeApp();
    const { cookie, id, url } = await setup();
    await upload(cookie, url('pc-1'), png);
    const token = await share(cookie, id, 'pc-1');
    const res = await request(app).get(`/api/play/${token}/portrait`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.body).toEqual(png);
  });

  it('does not show another character the portrait', async () => {
    const { app, setup, upload, share } = makeApp();
    const { cookie, id, url } = await setup();
    await upload(cookie, url('pc-1'), png);
    const otherToken = await share(cookie, id, 'pc-2');
    expect((await request(app).get(`/api/play/${otherToken}/portrait`)).status).toBe(404);
  });

  it('answers 404 for invalid and revoked links and for characters without a portrait', async () => {
    const { app, setup, upload, share } = makeApp();
    const { cookie, id, url } = await setup();
    const noPortrait = await share(cookie, id, 'pc-2');
    expect((await request(app).get(`/api/play/${noPortrait}/portrait`)).status).toBe(404);
    expect((await request(app).get(`/api/play/${'a'.repeat(43)}/portrait`)).status).toBe(404);
    expect((await request(app).get('/api/play/short/portrait')).status).toBe(404);
    await upload(cookie, url('pc-1'), png);
    const token = await share(cookie, id, 'pc-1');
    await request(app).delete(`/api/campaigns/${id}/characters/pc-1/share`).set('Cookie', cookie);
    expect((await request(app).get(`/api/play/${token}/portrait`)).status).toBe(404);
  });

  it('includes the portrait version in the player view', async () => {
    const { app, setup, upload, share, versionOf } = makeApp();
    const { cookie, id, url } = await setup();
    const version = versionOf((await upload(cookie, url('pc-1'), png)).body);
    const token = await share(cookie, id, 'pc-1');
    const view = await request(app).get(`/api/play/${token}`);
    expect(view.body.character.portraitVersion).toBe(version);
    expect(JSON.stringify(view.body)).not.toContain('DM SECRET');
  });
});

describe('portrait spend and storage limits', () => {
  it('shares one global daily limit across accounts', async () => {
    const { app, setup } = makeApp({ generator: fakeGenerator(), globalLimit: 2 });
    const a = await setup('a@example.com');
    const b = await setup('b@example.com');
    const gen = (who: typeof a) => request(app).post(`${who.url()}/generate`).set('Cookie', who.cookie).send({ prompt: 'x' });
    expect((await gen(a)).status).toBe(200);
    expect((await gen(b)).status).toBe(200);
    const blocked = await gen(a);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/temporarily unavailable/i);
  });

  it('does not use up the account limit when the global limit refuses', async () => {
    const { app, setup } = makeApp({ generator: fakeGenerator(), globalLimit: 1, limit: 1 });
    const a = await setup('a@example.com');
    const b = await setup('b@example.com');
    const gen = (who: typeof a) => request(app).post(`${who.url()}/generate`).set('Cookie', who.cookie).send({ prompt: 'x' });
    expect((await gen(b)).status).toBe(200);
    for (let i = 0; i < 2; i++) expect((await gen(a)).body.error).toMatch(/temporarily unavailable/i);
  });

  it('gives the global unit back when the provider fails', async () => {
    let fail = true;
    const generator = fakeGenerator(async () => {
      if (fail) throw new HttpError(502, 'provider down');
      return { contentType: 'image/webp', bytes: webp };
    });
    const { app, setup } = makeApp({ generator, globalLimit: 1 });
    const { cookie, url } = await setup();
    const gen = () => request(app).post(`${url()}/generate`).set('Cookie', cookie).send({ prompt: 'x' });
    expect((await gen()).status).toBe(502);
    fail = false;
    expect((await gen()).status).toBe(200);
  });

  it('limits portraits per campaign but still allows replacing and re-adding after a removal', async () => {
    const { app, setup, upload } = makeApp({ limits: { perCampaign: 1, perOwner: 10 } });
    const { cookie, url } = await setup();
    expect((await upload(cookie, url('pc-1'), png)).status).toBe(200);
    const full = await upload(cookie, url('pc-2'), png);
    expect(full.status).toBe(400);
    expect(full.body.error).toMatch(/at most 1 portrait/i);
    expect((await upload(cookie, url('pc-1'), jpeg, 'image/jpeg')).status).toBe(200);
    await request(app).delete(url('pc-1')).set('Cookie', cookie);
    expect((await upload(cookie, url('pc-2'), png)).status).toBe(200);
  });

  it('limits portraits per account across campaigns', async () => {
    const { app, setup, upload } = makeApp({ limits: { perCampaign: 10, perOwner: 1 } });
    const first = await setup();
    expect((await upload(first.cookie, first.url('pc-1'), png)).status).toBe(200);
    const created = await request(app).post('/api/campaigns').set('Cookie', first.cookie).send({ name: 'Second' });
    await request(app)
      .put(`/api/campaigns/${created.body.id}/characters/pc-9`)
      .set('Cookie', first.cookie)
      .send({ id: 'pc-9', name: 'Cora', stats: {}, inventory: [] });
    const res = await upload(first.cookie, `/api/campaigns/${created.body.id}/characters/pc-9/portrait`, png);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most 1 portrait/i);
    const other = await setup('other@example.com');
    expect((await upload(other.cookie, other.url('pc-1'), png)).status).toBe(200);
  });
});

describe('portrait upload cleanup', () => {
  it('keeps the previous image when saving the campaign fails during a replace', async () => {
    const { app, setup, upload, versionOf, failing } = makeApp();
    const { cookie, id, url } = await setup();
    const version = versionOf((await upload(cookie, url(), png)).body);
    failing.on = true;
    expect((await upload(cookie, url(), jpeg, 'image/jpeg')).status).toBe(409);
    failing.on = false;
    const res = await request(app).get(url()).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(png);
    const campaign = await request(app).get('/api/campaigns').set('Cookie', cookie);
    expect(versionOf(campaign.body.find((c: { id: string }) => c.id === id))).toBe(version);
  });

  it('stores nothing when the very first upload cannot be saved to the campaign', async () => {
    const { app, setup, upload, failing } = makeApp();
    const { cookie, url } = await setup();
    failing.on = true;
    expect((await upload(cookie, url(), png)).status).toBe(409);
    failing.on = false;
    expect((await request(app).get(url()).set('Cookie', cookie)).status).toBe(404);
  });
});

describe('portrait generation and quotas', () => {
  it('refuses to generate for a new portrait when the quota is full, without using a generation', async () => {
    const { app, setup, upload } = makeApp({ generator: fakeGenerator(), limits: { perCampaign: 1, perOwner: 10 }, limit: 1 });
    const { cookie, url } = await setup();
    await upload(cookie, url('pc-1'), png);
    const gen = (cid: string) => request(app).post(`${url(cid)}/generate`).set('Cookie', cookie).send({ prompt: 'x' });
    const refused = await gen('pc-2');
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/at most 1 portrait/i);
    expect((await gen('pc-1')).status).toBe(200);
  });
});

const npcBody = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `NPC ${id}`,
  role: 'Innkeeper',
  location: 'Mill',
  disposition: 'neutral',
  description: 'Friendly.',
  ...over,
});

describe('npc portraits', () => {
  async function setupNpcs(app: ReturnType<typeof makeApp>, email = 'dm@example.com') {
    const { cookie, id, url } = await app.setup(email);
    for (const nid of ['n-1', 'n-2']) {
      await request(app.app).put(`/api/campaigns/${id}/npcs/${nid}`).set('Cookie', cookie).send(npcBody(nid));
    }
    const npcUrl = (nid = 'n-1') => `/api/campaigns/${id}/npcs/${nid}/portrait`;
    const npcVersion = (campaign: { npcs: { id: string; portraitVersion?: number }[] }, nid = 'n-1') =>
      campaign.npcs.find((n) => n.id === nid)?.portraitVersion;
    return { cookie, id, url, npcUrl, npcVersion };
  }

  it('accepts jpeg, png and webp and records the version on the npc', async () => {
    const m = makeApp();
    const { cookie, npcUrl, npcVersion } = await setupNpcs(m);
    for (const [bytes, type] of [[jpeg, 'image/jpeg'], [png, 'image/png'], [webp, 'image/webp']] as const) {
      const res = await m.upload(cookie, npcUrl(), bytes, type);
      expect(res.status).toBe(200);
      expect(npcVersion(res.body)).toBeGreaterThan(0);
    }
  });

  it('rejects a lying content type, svg and oversize images and stores nothing', async () => {
    const m = makeApp();
    const { cookie, npcUrl } = await setupNpcs(m);
    expect((await m.upload(cookie, npcUrl(), svg, 'image/png')).status).toBe(400);
    expect((await m.upload(cookie, npcUrl(), Buffer.from('<html></html>'), 'image/jpeg')).status).toBe(400);
    expect((await m.upload(cookie, npcUrl(), Buffer.concat([png, Buffer.alloc(MAX_PORTRAIT_BYTES)]))).status).toBe(413);
    expect((await request(m.app).get(npcUrl()).set('Cookie', cookie)).status).toBe(404);
  });

  it('serves the sniffed type with safe headers, replaces and removes', async () => {
    const m = makeApp();
    const { cookie, npcUrl, npcVersion } = await setupNpcs(m);
    const first = npcVersion((await m.upload(cookie, npcUrl(), png)).body)!;
    const second = npcVersion((await m.upload(cookie, npcUrl(), jpeg, 'image/jpeg')).body)!;
    expect(second).toBeGreaterThan(first);
    const res = await request(m.app).get(npcUrl()).set('Cookie', cookie);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.headers['cache-control']).toBe('private, no-cache');
    const removed = await request(m.app).delete(npcUrl()).set('Cookie', cookie);
    expect(removed.status).toBe(200);
    expect(npcVersion(removed.body)).toBeUndefined();
    expect((await request(m.app).get(npcUrl()).set('Cookie', cookie)).status).toBe(404);
  });

  it('answers 404 for an unknown npc and 401 without a session', async () => {
    const m = makeApp({ generator: fakeGenerator() });
    const { cookie, npcUrl } = await setupNpcs(m);
    expect((await m.upload(cookie, npcUrl('ghost'), png)).status).toBe(404);
    expect((await request(m.app).get(npcUrl())).status).toBe(401);
    expect((await request(m.app).put(npcUrl()).set('Content-Type', 'image/png').send(png)).status).toBe(401);
    expect((await request(m.app).delete(npcUrl())).status).toBe(401);
    expect((await request(m.app).post(`${npcUrl()}/generate`).send({ prompt: 'x' })).status).toBe(401);
  });

  it("never lets another user read, replace, delete or generate for someone's npc", async () => {
    const m = makeApp({ generator: fakeGenerator() });
    const { cookie, npcUrl } = await setupNpcs(m);
    await m.upload(cookie, npcUrl(), png);
    const other = await m.signUp('other@example.com');
    expect((await request(m.app).get(npcUrl()).set('Cookie', other)).status).toBe(404);
    expect((await m.upload(other, npcUrl(), jpeg, 'image/jpeg')).status).toBe(404);
    expect((await request(m.app).delete(npcUrl()).set('Cookie', other)).status).toBe(404);
    expect((await request(m.app).post(`${npcUrl()}/generate`).set('Cookie', other).send({ prompt: 'x' })).status).toBe(404);
    expect((await request(m.app).get(npcUrl()).set('Cookie', cookie)).body).toEqual(png);
  });

  it('generates a preview without saving, and shares the daily and global caps with characters', async () => {
    const m = makeApp({ generator: fakeGenerator(), limit: 2, globalLimit: 10 });
    const { cookie, url, npcUrl } = await setupNpcs(m);
    const gen = (u: string) => request(m.app).post(`${u}/generate`).set('Cookie', cookie).send({ prompt: 'a baker' });
    const first = await gen(npcUrl());
    expect(first.status).toBe(200);
    expect(Buffer.from(first.body.data, 'base64')).toEqual(webp);
    expect((await request(m.app).get(npcUrl()).set('Cookie', cookie)).status).toBe(404);
    expect((await gen(url())).status).toBe(200);
    expect((await gen(npcUrl())).status).toBe(429);
  });

  it('validates the prompt, passes refusals through and answers 503 without a key', async () => {
    const refusing = fakeGenerator(async () => {
      throw new HttpError(422, 'refused');
    });
    const m = makeApp({ generator: refusing });
    const { cookie, npcUrl } = await setupNpcs(m);
    const gen = (prompt: unknown) => request(m.app).post(`${npcUrl()}/generate`).set('Cookie', cookie).send({ prompt });
    expect((await gen('')).status).toBe(400);
    expect((await gen('x'.repeat(1001))).status).toBe(400);
    expect((await gen('a baker')).status).toBe(422);
    const bare = makeApp();
    const b = await setupNpcs(bare, 'bare@example.com');
    const res = await request(bare.app).post(`${b.npcUrl()}/generate`).set('Cookie', b.cookie).send({ prompt: 'x' });
    expect(res.status).toBe(503);
  });

  it('returns the generation units when the provider fails', async () => {
    let fail = true;
    const generator = fakeGenerator(async () => {
      if (fail) throw new HttpError(502, 'down');
      return { contentType: 'image/webp', bytes: webp };
    });
    const m = makeApp({ generator, limit: 1, globalLimit: 1 });
    const { cookie, npcUrl } = await setupNpcs(m);
    const gen = () => request(m.app).post(`${npcUrl()}/generate`).set('Cookie', cookie).send({ prompt: 'x' });
    expect((await gen()).status).toBe(502);
    fail = false;
    expect((await gen()).status).toBe(200);
  });

  it('shares one quota between characters and npcs, and replacing never counts', async () => {
    const m = makeApp({ generator: fakeGenerator(), limits: { perCampaign: 1, perOwner: 10 } });
    const { cookie, url, npcUrl } = await setupNpcs(m);
    expect((await m.upload(cookie, url('pc-1'), png)).status).toBe(200);
    const refused = await m.upload(cookie, npcUrl('n-1'), png);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/at most 1 portrait/i);
    const gen = await request(m.app).post(`${npcUrl('n-1')}/generate`).set('Cookie', cookie).send({ prompt: 'x' });
    expect(gen.status).toBe(400);
    expect((await m.upload(cookie, url('pc-1'), jpeg, 'image/jpeg')).status).toBe(200);
    await request(m.app).delete(url('pc-1')).set('Cookie', cookie);
    expect((await m.upload(cookie, npcUrl('n-1'), png)).status).toBe(200);
    expect((await m.upload(cookie, npcUrl('n-1'), jpeg, 'image/jpeg')).status).toBe(200);
  });

  it('keeps a character and an npc with the same id separate', async () => {
    const m = makeApp();
    const { app, cookie, id } = { ...(await setupNpcs(m)), app: m.app };
    await request(app).put(`/api/campaigns/${id}/npcs/pc-1`).set('Cookie', cookie).send(npcBody('pc-1'));
    await m.upload(cookie, `/api/campaigns/${id}/characters/pc-1/portrait`, png);
    await m.upload(cookie, `/api/campaigns/${id}/npcs/pc-1/portrait`, jpeg, 'image/jpeg');
    expect((await request(app).get(`/api/campaigns/${id}/characters/pc-1/portrait`).set('Cookie', cookie)).body).toEqual(png);
    expect((await request(app).get(`/api/campaigns/${id}/npcs/pc-1/portrait`).set('Cookie', cookie)).body).toEqual(jpeg);
    await request(app).delete(`/api/campaigns/${id}/npcs/pc-1/portrait`).set('Cookie', cookie);
    expect((await request(app).get(`/api/campaigns/${id}/characters/pc-1/portrait`).set('Cookie', cookie)).status).toBe(200);
  });

  it('ignores a portraitVersion sent by the client when the DM saves the npc', async () => {
    const m = makeApp();
    const { cookie, id, npcUrl, npcVersion } = await setupNpcs(m);
    const real = npcVersion((await m.upload(cookie, npcUrl(), png)).body);
    const res = await request(m.app)
      .put(`/api/campaigns/${id}/npcs/n-1`)
      .set('Cookie', cookie)
      .send(npcBody('n-1', { portraitVersion: 999, name: 'Renamed' }));
    expect(npcVersion(res.body)).toBe(real);
  });

  it('keeps the previous image when saving the campaign fails during a replace', async () => {
    const m = makeApp();
    const { cookie, id, npcUrl, npcVersion } = await setupNpcs(m);
    const version = npcVersion((await m.upload(cookie, npcUrl(), png)).body);
    m.failing.on = true;
    expect((await m.upload(cookie, npcUrl(), jpeg, 'image/jpeg')).status).toBe(409);
    m.failing.on = false;
    expect((await request(m.app).get(npcUrl()).set('Cookie', cookie)).body).toEqual(png);
    const campaigns = await request(m.app).get('/api/campaigns').set('Cookie', cookie);
    expect(npcVersion(campaigns.body.find((c: { id: string }) => c.id === id))).toBe(version);
  });

  it('removes the portrait when the npc or the campaign is deleted, and a reused id inherits nothing', async () => {
    const m = makeApp();
    const { cookie, id, npcUrl } = await setupNpcs(m);
    await m.upload(cookie, npcUrl('n-1'), png);
    await m.upload(cookie, npcUrl('n-2'), png);
    await request(m.app).delete(`/api/campaigns/${id}/npcs/n-1`).set('Cookie', cookie);
    await request(m.app).put(`/api/campaigns/${id}/npcs/n-1`).set('Cookie', cookie).send(npcBody('n-1'));
    expect((await request(m.app).get(npcUrl('n-1')).set('Cookie', cookie)).status).toBe(404);
    expect((await request(m.app).get(npcUrl('n-2')).set('Cookie', cookie)).status).toBe(200);
    await request(m.app).delete(`/api/campaigns/${id}`).set('Cookie', cookie);
    expect((await request(m.app).get(npcUrl('n-2')).set('Cookie', cookie)).status).toBe(404);
  });
});

describe('player npc portrait', () => {
  async function setupPlayer() {
    const m = makeApp();
    const { cookie, id } = await m.setup();
    const putNpc = (nid: string, over: Record<string, unknown> = {}) =>
      request(m.app).put(`/api/campaigns/${id}/npcs/${nid}`).set('Cookie', cookie).send(npcBody(nid, over));
    // n-1 revealed with a portrait, n-2 hidden with a portrait, n-3 revealed without one.
    await putNpc('n-1', { knownToPlayers: true, secret: 'NPC SECRET' });
    await putNpc('n-2', { secret: 'HIDDEN SECRET' });
    await putNpc('n-3', { knownToPlayers: true });
    const npcUrl = (nid: string) => `/api/campaigns/${id}/npcs/${nid}/portrait`;
    await m.upload(cookie, npcUrl('n-1'), png);
    await m.upload(cookie, npcUrl('n-2'), jpeg, 'image/jpeg');
    const token = await m.share(cookie, id, 'pc-1');
    const play = (nid: string, tok = token) => request(m.app).get(`/api/play/${tok}/npcs/${nid}/portrait`);
    const page = async (tok = token) => (await request(m.app).get(`/api/play/${tok}`)).body;
    return { ...m, app: m.app, cookie, id, putNpc, npcUrl, token, play, page };
  }

  it('serves a revealed npc portrait with safe, uncacheable headers', async () => {
    const { play } = await setupPlayer();
    const res = await play('n-1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.body).toEqual(png);
  });

  it('makes a hidden npc, a nonexistent npc and a portrait-less npc indistinguishable', async () => {
    const { play } = await setupPlayer();
    const responses = await Promise.all(['n-2', 'ghost', 'n-3'].map((nid) => play(nid)));
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'No portrait' });
    }
  });

  it('blocks the image as soon as the npc is un-revealed and restores it when revealed again', async () => {
    const { app, play, putNpc, cookie, npcUrl } = await setupPlayer();
    expect((await play('n-1')).status).toBe(200);
    await putNpc('n-1', { knownToPlayers: false });
    const hidden = await play('n-1');
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual({ error: 'No portrait' });
    expect((await request(app).get(npcUrl('n-1')).set('Cookie', cookie)).status).toBe(200);
    await putNpc('n-1', { knownToPlayers: true });
    const back = await play('n-1');
    expect(back.status).toBe(200);
    expect(back.body).toEqual(png);
  });

  it("only reads inside the token's own campaign", async () => {
    const { app, play, cookie, upload } = await setupPlayer();
    const other = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ name: 'Other' });
    for (const nid of ['n-1', 'b-only']) {
      await request(app)
        .put(`/api/campaigns/${other.body.id}/npcs/${nid}`)
        .set('Cookie', cookie)
        .send(npcBody(nid, { knownToPlayers: true }));
      await upload(cookie, `/api/campaigns/${other.body.id}/npcs/${nid}/portrait`, jpeg, 'image/jpeg');
    }
    expect((await play('b-only')).status).toBe(404);
    expect((await play('n-1')).body).toEqual(png);
  });

  it('answers 404 for invalid, malformed and revoked links', async () => {
    const { app, play, cookie, id, token } = await setupPlayer();
    expect((await play('n-1', 'a'.repeat(43))).status).toBe(404);
    expect((await play('n-1', 'short')).status).toBe(404);
    await request(app).delete(`/api/campaigns/${id}/characters/pc-1/share`).set('Cookie', cookie);
    expect((await play('n-1', token)).status).toBe(404);
  });

  it('lists portraitVersion only on revealed npcs and never mentions a hidden one', async () => {
    const { page, putNpc, npcUrl, cookie, app } = await setupPlayer();
    const body = await page();
    expect(body.npcs.map((n: { id: string }) => n.id).sort()).toEqual(['n-1', 'n-3']);
    expect(typeof body.npcs.find((n: { id: string }) => n.id === 'n-1').portraitVersion).toBe('number');
    expect(body.npcs.find((n: { id: string }) => n.id === 'n-3')).not.toHaveProperty('portraitVersion');
    const json = JSON.stringify(body);
    for (const text of ['n-2', 'NPC n-2', 'SECRET']) expect(json).not.toContain(text);
    await putNpc('n-1', { knownToPlayers: false });
    expect((await page()).npcs.map((n: { id: string }) => n.id)).toEqual(['n-3']);
    expect((await request(app).get(npcUrl('n-1')).set('Cookie', cookie)).status).toBe(200);
  });

  it('includes the same journal in the response to a player edit', async () => {
    const { app, token } = await setupPlayer();
    const res = await request(app).put(`/api/play/${token}`).send({ inventory: [], playerNotes: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.npcs.map((n: { id: string }) => n.id).sort()).toEqual(['n-1', 'n-3']);
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });

  it('keeps portraitVersion out of what the game agent receives', async () => {
    const { app, cookie, id } = await setupPlayer();
    const ownerId = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[1], 'base64url').toString()).sub as string;
    const agent = mintAgentToken(config.jwtSecret, { ownerId, campaignId: id, characterId: 'pc-1', turnId: 't1', mode: 'player_action' });
    const res = await request(app).get('/api/agent/v1/context/player').set('Authorization', `Bearer ${agent}`);
    expect(res.status).toBe(200);
    expect(res.body.npcs.map((n: { id: string }) => n.id).sort()).toEqual(['n-1', 'n-3']);
    expect(JSON.stringify(res.body)).not.toContain('portraitVersion');
  });
});

describe('player image rate limit', () => {
  async function setupImages() {
    const m = makeApp();
    const { cookie, id, url } = await m.setup();
    await request(m.app)
      .put(`/api/campaigns/${id}/npcs/n-1`)
      .set('Cookie', cookie)
      .send(npcBody('n-1', { knownToPlayers: true }));
    await m.upload(cookie, `/api/campaigns/${id}/npcs/n-1/portrait`, png);
    await m.upload(cookie, url('pc-1'), png);
    const token = await m.share(cookie, id, 'pc-1');
    return { app: m.app, token };
  }

  it('keeps portrait images available after the page requests have used up their own limit', async () => {
    const { app, token } = await setupImages();
    let last = 200;
    for (let i = 0; i < 125 && last !== 429; i++) last = (await request(app).get(`/api/play/${token}`)).status;
    expect(last).toBe(429);
    expect((await request(app).get(`/api/play/${token}/portrait`)).status).toBe(200);
    expect((await request(app).get(`/api/play/${token}/npcs/n-1/portrait`)).status).toBe(200);
  });

  it('does not let image requests use up the limit of the page requests', async () => {
    const { app, token } = await setupImages();
    for (let i = 0; i < 130; i++) await request(app).get(`/api/play/${token}/npcs/n-1/portrait`);
    expect((await request(app).get(`/api/play/${token}`)).status).toBe(200);
  });

  it('still limits abusive image requests', async () => {
    const { app, token } = await setupImages();
    let limited = false;
    for (let i = 0; i < 620 && !limited; i++) limited = (await request(app).get(`/api/play/${token}/portrait`)).status === 429;
    expect(limited).toBe(true);
  });
});
