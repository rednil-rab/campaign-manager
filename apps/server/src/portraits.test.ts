import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryCampaignRepo } from './campaigns/memoryCampaignRepo';
import { HttpError } from './errors';
import { MAX_PORTRAIT_BYTES } from './portraits/image';
import type { PortraitGenerator } from './portraits/generator';
import { createMemoryShareRepo } from './shares/memoryShareRepo';
import { createMemoryUserRepo } from './users/memoryUserRepo';

const config = { jwtSecret: 'x'.repeat(32), bcryptRounds: 4, secureCookies: false };

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function makeApp(opts: { generator?: PortraitGenerator; limit?: number } = {}) {
  const app = createApp({
    users: createMemoryUserRepo(),
    campaigns: createMemoryCampaignRepo(),
    shares: createMemoryShareRepo(),
    config,
    portraitGenerator: opts.generator,
    portraitDailyLimit: opts.limit ?? 20,
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

  return { app, signUp, setup, upload, share, versionOf };
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
