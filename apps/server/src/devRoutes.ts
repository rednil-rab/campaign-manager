import { Router } from 'express';
import { mintAgentToken, AGENT_MODES, AGENT_TOKEN_TTL_SECONDS, type AgentMode } from './agent/token';
import { requireAuth } from './auth/session';
import type { CampaignRepo } from './campaigns/types';
import type { Config } from './config';
import { docsPage, openApiSpec } from './docs';

import { HttpError } from './errors';

/** Public API docs. The spec describes the API only; it holds nothing secret. */
export function docsRouter() {
  const router = Router();
  router.get('/docs', (_req, res) => {
    res.type('html').send(docsPage());
  });
  router.get('/docs/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  return router;
}

/** Development-only helper: a way to get an agent token without the terminal. */
export function devRouter(campaigns: CampaignRepo, config: Pick<Config, 'jwtSecret'>) {
  const router = Router();

  router.post('/dev/agent-token', requireAuth(config.jwtSecret), async (req, res) => {
    const { campaignId, mode, characterId } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof campaignId !== 'string') throw new HttpError(400, 'campaignId is required');
    if (!AGENT_MODES.includes(mode as AgentMode)) throw new HttpError(400, `mode must be one of ${AGENT_MODES.join(', ')}`);
    const stored = await campaigns.get(req.userId!, campaignId);
    if (!stored) throw new HttpError(404, 'Campaign not found');
    if (mode === 'player_action') {
      if (typeof characterId !== 'string' || !stored.campaign.characters.some((c) => c.id === characterId)) {
        throw new HttpError(400, 'player_action needs a characterId from this campaign');
      }
    }
    const token = mintAgentToken(config.jwtSecret, {
      ownerId: req.userId!,
      campaignId,
      characterId: mode === 'player_action' ? (characterId as string) : undefined,
      turnId: `dev-${Date.now()}`,
      mode: mode as AgentMode,
    });
    res.json({ token, expiresInSeconds: AGENT_TOKEN_TTL_SECONDS });
  });

  return router;
}
