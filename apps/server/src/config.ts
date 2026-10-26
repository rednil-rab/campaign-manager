export interface Config {
  port: number;
  mongoUri: string;
  mongoDb: string;
  jwtSecret: string;
  bcryptRounds: number;
  secureCookies: boolean;
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

  return {
    port,
    mongoUri: required(env, 'MONGODB_URI'),
    mongoDb: env.MONGODB_DB ?? 'questkeeper',
    jwtSecret,
    bcryptRounds: 12,
    secureCookies: env.NODE_ENV === 'production',
  };
}
