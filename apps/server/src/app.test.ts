import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryCampaignRepo } from './campaigns/memoryCampaignRepo';
import { createMemoryShareRepo } from './shares/memoryShareRepo';
import { createMemoryUserRepo } from './users/memoryUserRepo';

const config = { jwtSecret: 'x'.repeat(32), bcryptRounds: 4, secureCookies: false };
const credentials = { email: 'Dana@Example.com', password: 'correct horse' };

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp({ users: createMemoryUserRepo(), campaigns: createMemoryCampaignRepo(), shares: createMemoryShareRepo(), config });
});

const cookieOf = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.map((c) => c.split(';')[0]).join('; ');
};

describe('health and routing', () => {
  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 404 JSON for unknown api routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
  });
});

describe('auth', () => {
  it('registers, normalizes the email and signs the user in with an httpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('dana@example.com');
    expect(res.body.passwordHash).toBeUndefined();
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    const me = await request(app).get('/api/auth/me').set('Cookie', cookieOf(res));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('dana@example.com');
  });

  it('rejects duplicate registration regardless of email case', async () => {
    await request(app).post('/api/auth/register').send(credentials);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, email: 'DANA@example.com' });
    expect(res.status).toBe(409);
  });

  it('validates credentials', async () => {
    const post = (body: unknown) => request(app).post('/api/auth/register').send(body as object);
    expect((await post({ email: 'nope', password: 'longenough' })).status).toBe(400);
    expect((await post({ email: 'a@b.co', password: 'short' })).status).toBe(400);
    expect((await post({ email: 'a@b.co', password: 'x'.repeat(73) })).status).toBe(400);
    expect((await post({ email: ['a@b.co'], password: 'longenough' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it('logs in with the right password and rejects the wrong one with the same message as an unknown user', async () => {
    await request(app).post('/api/auth/register').send(credentials);
    const ok = await request(app).post('/api/auth/login').send(credentials);
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toContain('qk_session=');

    const wrong = await request(app).post('/api/auth/login').send({ ...credentials, password: 'wrong password' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'who@example.com', password: 'whatever1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('requires a valid session for /me', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const forged = await request(app).get('/api/auth/me').set('Cookie', 'qk_session=not-a-jwt');
    expect(forged.status).toBe(401);
  });

  it('rejects a token signed with another secret', async () => {
    const other = createApp({
      users: createMemoryUserRepo(),
      campaigns: createMemoryCampaignRepo(), shares: createMemoryShareRepo(),
      config: { ...config, jwtSecret: 'y'.repeat(32) },
    });
    const registered = await request(other).post('/api/auth/register').send(credentials);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookieOf(registered));
    expect(res.status).toBe(401);
  });

  it('logout clears the cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain('qk_session=;');
  });
});
