import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { authRouter } from './auth/routes';
import { campaignsRouter } from './campaigns/routes';
import type { CampaignRepo } from './campaigns/types';
import type { Config } from './config';
import { HttpError } from './errors';
import type { UserRepo } from './users/types';

export interface AppDeps {
  users: UserRepo;
  campaigns: CampaignRepo;
  config: Pick<Config, 'jwtSecret' | 'bcryptRounds' | 'secureCookies'>;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Malformed JSON bodies are the client's fault.
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};

export function createApp({ users, campaigns, config }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter(users, config));
  app.use('/api/campaigns', campaignsRouter(campaigns, config));
  app.use('/api', (_req, _res) => {
    throw new HttpError(404, 'Not found');
  });

  app.use(errorHandler);
  return app;
}
