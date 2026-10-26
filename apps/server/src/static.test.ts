import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryCampaignRepo } from './campaigns/memoryCampaignRepo';
import { createMemoryUserRepo } from './users/memoryUserRepo';

const config = { jwtSecret: 'x'.repeat(32), bcryptRounds: 4, secureCookies: false };

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'qk-web-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Questkeeper</title>');
  writeFileSync(path.join(dir, 'assets', 'app-123.js'), 'console.log(1)');
  app = createApp({ users: createMemoryUserRepo(), campaigns: createMemoryCampaignRepo(), config, webDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('serving the web app', () => {
  it('serves index.html for the root and for client-side routes', async () => {
    for (const url of ['/', '/c/some-id/quests']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Questkeeper');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('caches hashed assets for a long time', async () => {
    const res = await request(app).get('/assets/app-123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('keeps unknown API routes as JSON 404s instead of the app shell', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('does not serve the web app when no directory is configured', async () => {
    const apiOnly = createApp({ users: createMemoryUserRepo(), campaigns: createMemoryCampaignRepo(), config });
    expect((await request(apiOnly).get('/')).status).toBe(404);
  });
});
