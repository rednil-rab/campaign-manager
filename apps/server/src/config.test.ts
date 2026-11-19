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

  it('reads the optional portrait settings', () => {
    const config = loadConfig(valid);
    expect(config.openAiApiKey).toBeUndefined();
    expect(config.openAiImageModel).toBe('gpt-image-1-mini');
    expect(config.portraitDailyLimit).toBe(20);
    expect(config.portraitGlobalDailyLimit).toBe(100);
    const set = loadConfig({ ...valid, OPENAI_API_KEY: 'sk-test', PORTRAIT_DAILY_LIMIT: '5', PORTRAIT_GLOBAL_DAILY_LIMIT: '50', OPENAI_IMAGE_MODEL: 'gpt-image-2' });
    expect(set.openAiApiKey).toBe('sk-test');
    expect(set.openAiImageModel).toBe('gpt-image-2');
    expect(set.portraitDailyLimit).toBe(5);
    expect(set.portraitGlobalDailyLimit).toBe(50);
  });

  it('rejects an invalid daily limit', () => {
    expect(() => loadConfig({ ...valid, PORTRAIT_DAILY_LIMIT: '0' })).toThrow(/PORTRAIT_DAILY_LIMIT/);
    expect(() => loadConfig({ ...valid, PORTRAIT_DAILY_LIMIT: 'abc' })).toThrow(/PORTRAIT_DAILY_LIMIT/);
    expect(() => loadConfig({ ...valid, PORTRAIT_GLOBAL_DAILY_LIMIT: '0' })).toThrow(/PORTRAIT_GLOBAL_DAILY_LIMIT/);
  });
});
