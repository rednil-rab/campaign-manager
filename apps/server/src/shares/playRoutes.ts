import { playerPage, playerView, updateCharacterByPlayer } from '@questkeeper/domain';
import { Router } from 'express';
import { parseInventory, parsePlayerNotes } from '../campaigns/parse';
import { mutateCampaign } from '../campaigns/service';
import type { CampaignRepo } from '../campaigns/types';
import { HttpError } from '../errors';
import { rateLimit } from '../rateLimit';
import { setImageHeaders } from '../portraits/routes';
import type { PortraitRepo } from '../portraits/types';
import type { CampaignUpdateHub } from '../campaigns/updates';
import { isShareToken } from './token';
import type { ShareRepo } from './types';

/** Public endpoints: the token in the URL is the only credential, and it only reaches one character. */
export function playRouter(
  campaigns: CampaignRepo,
  shares: ShareRepo,
  portraits: PortraitRepo,
  updates?: CampaignUpdateHub,
) {
  const router = Router();
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

  // Portrait images get their own, larger budget: a table of players often shares one IP, and every revealed NPC portrait is a request, so counting them against the page's limit would break the Journal.
  const imageLimit = rateLimit({ windowMs: 60_000, max: 600 });

  router.get<{ token: string }>('/:token/portrait', imageLimit, async (req, res) => {
    const link = await resolve(req.params.token);
    const portrait = await portraits.get(link.ownerId, link.campaignId, { kind: 'character', id: link.characterId });
    if (!portrait) throw notFound();
    setImageHeaders(res, portrait.contentType);
    res.send(portrait.bytes);
  });

  router.get<{ token: string; npcId: string }>('/:token/npcs/:npcId/portrait', imageLimit, async (req, res) => {
    const link = await resolve(req.params.token);
    const stored = await campaigns.get(link.ownerId, link.campaignId);
    if (!stored || !stored.campaign.characters.some((p) => p.id === link.characterId)) throw notFound();
    const npc = stored.campaign.npcs.find((n) => n.id === req.params.npcId);
    // Checked on every request and failing closed. A hidden NPC, a nonexistent NPC and an NPC without a portrait
    // all get the same answer, so a player cannot tell which NPCs exist or have a face the DM has not shown them.
    if (!npc || npc.knownToPlayers !== true || npc.portraitVersion === undefined) throw new HttpError(404, 'No portrait');
    const portrait = await portraits.get(link.ownerId, link.campaignId, { kind: 'npc', id: npc.id });
    if (!portrait) throw new HttpError(404, 'No portrait');
    setImageHeaders(res, portrait.contentType);
    res.send(portrait.bytes);
  });

  router.use(rateLimit({ windowMs: 60_000, max: 120 }));

  router.get('/:token', async (req, res) => {
    const link = await resolve(req.params.token);
    const stored = await campaigns.get(link.ownerId, link.campaignId);
    const view = stored && playerPage(stored.campaign, link.characterId);
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
    const view = playerPage(campaign, link.characterId);
    if (!view) throw notFound();
    res.json(view);
  });

  return router;
}
