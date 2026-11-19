export interface Config {
  port: number;
  mongoUri: string;
  mongoDb: string;
  jwtSecret: string;
  bcryptRounds: number;
  secureCookies: boolean;
  /** Absent when portrait generation is not configured; uploads still work. */
  openAiApiKey?: string;
  openAiImageModel: string;
  portraitDailyLimit: number;
  /** Shared by all accounts, so many sign-ups cannot multiply the spend on the image provider. */
  portraitGlobalDailyLimit: number;
}

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable ${key}`);
  return value;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jwtSecret = required(env, 'JWT_SECRET');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error('PORT must be a positive integer');

  const portraitDailyLimit = Number(env.PORTRAIT_DAILY_LIMIT ?? 20);
  if (!Number.isInteger(portraitDailyLimit) || portraitDailyLimit <= 0) {
    throw new Error('PORTRAIT_DAILY_LIMIT must be a positive integer');
  }
  const portraitGlobalDailyLimit = Number(env.PORTRAIT_GLOBAL_DAILY_LIMIT ?? 100);
  if (!Number.isInteger(portraitGlobalDailyLimit) || portraitGlobalDailyLimit <= 0) {
    throw new Error('PORTRAIT_GLOBAL_DAILY_LIMIT must be a positive integer');
  }

  return {
    port,
    mongoUri: required(env, 'MONGODB_URI'),
    mongoDb: env.MONGODB_DB ?? 'questkeeper',
    jwtSecret,
    bcryptRounds: 12,
    secureCookies: env.NODE_ENV === 'production',
    openAiApiKey: env.OPENAI_API_KEY || undefined,
    openAiImageModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini',
    portraitDailyLimit,
    portraitGlobalDailyLimit,
  };
}
