import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { authRouter } from './auth/routes';
import { campaignsRouter } from './campaigns/routes';
import type { CampaignRepo } from './campaigns/types';
import type { Config } from './config';
import { HttpError } from './errors';
import { playRouter } from './shares/playRoutes';
import type { ShareRepo } from './shares/types';
import type { UserRepo } from './users/types';

export interface AppDeps {
  users: UserRepo;
  campaigns: CampaignRepo;
  shares: ShareRepo;
  config: Pick<Config, 'jwtSecret' | 'bcryptRounds' | 'secureCookies'>;
  /** Directory with the built web app. When set, it is served with a single-page-app fallback. */
  webDir?: string;
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

export function createApp({ users, campaigns, shares, config, webDir }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  // Behind the host's proxy, so req.secure and client addresses are correct.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter(users, config));
  app.use('/api/campaigns', campaignsRouter(campaigns, shares, config));
  app.use('/api/play', playRouter(campaigns, shares));
  app.use('/api', (_req, _res) => {
    throw new HttpError(404, 'Not found');
  });

  if (webDir) {
    // Built assets have hashed names; index.html must always be revalidated.
    app.use(
      express.static(webDir, {
        index: false,
        setHeaders: (res, filePath) => {
          res.setHeader(
            'Cache-Control',
            filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      }),
    );
    app.get('/{*splat}', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      // The player page URL holds a secret, so keep it out of referrers and search indexes.
      if (req.path.startsWith('/play/')) {
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Robots-Tag', 'noindex');
      }
      res.sendFile(path.join(webDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
