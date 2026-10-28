import { playerView, updateCharacterByPlayer } from '@questkeeper/domain';
import { Router } from 'express';
import { parseInventory, parsePlayerNotes } from '../campaigns/parse';
import { mutateCampaign } from '../campaigns/service';
import type { CampaignRepo } from '../campaigns/types';
import { HttpError } from '../errors';
import { rateLimit } from '../rateLimit';
import { isShareToken } from './token';
import type { ShareRepo } from './types';

/** Public endpoints: the token in the URL is the only credential, and it only reaches one character. */
export function playRouter(campaigns: CampaignRepo, shares: ShareRepo) {
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

  router.put('/:token', async (req, res) => {
    const link = await resolve(req.params.token);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const inventory = parseInventory(body.inventory);
    const playerNotes = parsePlayerNotes(body.playerNotes);
    const campaign = await mutateCampaign(campaigns, link.ownerId, link.campaignId, (c) =>
      updateCharacterByPlayer(c, link.characterId, { inventory, playerNotes }),
    );
    const view = playerView(campaign, link.characterId);
    if (!view) throw notFound();
    res.json(view);
  });

  return router;
}
