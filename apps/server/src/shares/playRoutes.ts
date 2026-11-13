import { playerView, updateCharacterByPlayer } from '@questkeeper/domain';
import { Router } from 'express';
import { parseInventory, parsePlayerNotes } from '../campaigns/parse';
import { mutateCampaign } from '../campaigns/service';
import type { CampaignRepo } from '../campaigns/types';
import { HttpError } from '../errors';
import { rateLimit } from '../rateLimit';
import type { CampaignUpdateHub } from '../campaigns/updates';
import { isShareToken } from './token';
import type { ShareRepo } from './types';

/** Public endpoints: the token in the URL is the only credential, and it only reaches one character. */
export function playRouter(campaigns: CampaignRepo, shares: ShareRepo, updates?: CampaignUpdateHub) {
  const router = Router();
  router.use(rateLimit({ windowMs: 60_000, max: 120 }));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    next();
  });

  const notFound = () => new HttpError(404, 'This link is not valid or has been revoked');

  const resolve = async (token: string) => {
    if (!isShareToken(token)) throw notFound();
    const link = await shares.findByToken(token);
    if (!link) throw notFound();
    return link;
  };

  router.get('/:token', async (req, res) => {
    const link = await resolve(req.params.token);
    const stored = await campaigns.get(link.ownerId, link.campaignId);
    const view = stored && playerView(stored.campaign, link.characterId);
    if (!view) throw notFound();
    res.json(view);
  });

  router.get('/:token/events', async (req, res) => {
    const token = req.params.token;
    const link = await resolve(token);
    const stored = await campaigns.get(link.ownerId, link.campaignId);
    if (!stored || !playerView(stored.campaign, link.characterId)) throw notFound();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: 'update' | 'revoked') => {
      res.write(`event: ${event}\ndata: {}\n\n`);
      if (event === 'revoked') res.end();
    };
    const unsubscribe = updates?.subscribe(link.campaignId, token, send);
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe?.();
    });
    const stillValid = await shares.findByToken(token);
    if (res.destroyed) return;
    if (!stillValid) {
      send('revoked');
      return;
    }
    send('update');
  });

  router.put('/:token', async (req, res) => {
    const link = await resolve(req.params.token);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const inventory = parseInventory(body.inventory);
    const playerNotes = parsePlayerNotes(body.playerNotes);
    const campaign = await mutateCampaign(campaigns, link.ownerId, link.campaignId, (c) =>
      updateCharacterByPlayer(c, link.characterId, { inventory, playerNotes }),
      updates,
    );
    const view = playerView(campaign, link.characterId);
    if (!view) throw notFound();
    res.json(view);
  });

  return router;
}
