import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const valid = { JWT_SECRET: 'x'.repeat(32), MONGODB_URI: 'mongodb://localhost:27017' };

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(valid);
    expect(config.port).toBe(3000);
    expect(config.mongoDb).toBe('questkeeper');
    expect(config.secureCookies).toBe(false);
  });

  it('uses secure cookies in production', () => {
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).secureCookies).toBe(true);
  });

  it('requires a strong secret and a Mongo URI', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'short' })).toThrow(/32/);
    expect(() => loadConfig({ ...valid, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...valid, MONGODB_URI: undefined })).toThrow(/MONGODB_URI/);
  });

  it('rejects a bad port', () => {
    expect(() => loadConfig({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });
});
