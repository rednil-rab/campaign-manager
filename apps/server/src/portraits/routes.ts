import { setPortraitVersion } from '@questkeeper/domain';
import express, { Router, type Response } from 'express';
import { requireAuth } from '../auth/session';
import { mutateCampaign } from '../campaigns/service';
import type { CampaignRepo } from '../campaigns/types';
import type { CampaignUpdateHub } from '../campaigns/updates';
import type { Config } from '../config';
import { HttpError } from '../errors';
import type { PortraitGenerator } from './generator';
import { MAX_PORTRAITS_PER_CAMPAIGN, MAX_PORTRAITS_PER_OWNER, MAX_PORTRAIT_BYTES, sniffImage } from './image';
import type { PortraitRepo, PortraitUsageRepo } from './types';

const MAX_PROMPT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Counted under this owner id, so the shared limit uses the same atomic counter as the per-account one. */
const GLOBAL_USAGE_KEY = '*global*';

/** Headers that keep a stored image from ever being treated as anything but a picture. */
export function setImageHeaders(res: Response, contentType: string) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
}

function parsePrompt(body: unknown): string {
  const prompt = (body as { prompt?: unknown } | undefined)?.prompt;
  if (typeof prompt !== 'string' || prompt.trim() === '') throw new HttpError(400, 'Describe the character to generate');
  if (prompt.length > MAX_PROMPT) throw new HttpError(400, `The prompt can be at most ${MAX_PROMPT} characters`);
  return prompt.trim();
}

export interface PortraitsDeps {
  campaigns: CampaignRepo;
  portraits: PortraitRepo;
  usage: PortraitUsageRepo;
  generator?: PortraitGenerator;
  dailyLimit: number;
  globalDailyLimit: number;
  limits?: { perCampaign: number; perOwner: number };
  config: Pick<Config, 'jwtSecret'>;
  updates?: CampaignUpdateHub;
}

/** The DM's portrait endpoints. Everything is scoped to the signed-in owner. */
export function portraitsRouter({
  campaigns,
  portraits,
  usage,
  generator,
  dailyLimit,
  globalDailyLimit,
  limits = { perCampaign: MAX_PORTRAITS_PER_CAMPAIGN, perOwner: MAX_PORTRAITS_PER_OWNER },
  config,
  updates,
}: PortraitsDeps) {
  const router = Router();
  router.use(requireAuth(config.jwtSecret));
  const path = '/:id/characters/:characterId/portrait';

  const requireCharacter = async (ownerId: string, campaignId: string, characterId: string) => {
    const stored = await campaigns.get(ownerId, campaignId);
    if (!stored) throw new HttpError(404, 'Campaign not found');
    if (!stored.campaign.characters.some((p) => p.id === characterId)) throw new HttpError(404, 'Character not found');
  };

  router.get(path, async (req, res) => {
    const { id, characterId } = req.params;
    const portrait = await portraits.get(req.userId!, id, characterId);
    if (!portrait) throw new HttpError(404, 'No portrait');
    setImageHeaders(res, portrait.contentType);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.send(portrait.bytes);
  });

  router.put(
    path,
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_PORTRAIT_BYTES }),
    async (req, res) => {
      const { id, characterId } = req.params;
      const ownerId = req.userId!;
      await requireCharacter(ownerId, id, characterId);
      const bytes: unknown = req.body;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        throw new HttpError(400, 'Send the image as the request body, as a JPEG, PNG or WebP');
      }
      const contentType = sniffImage(bytes);
      if (!contentType) throw new HttpError(400, 'The file must be a JPEG, PNG or WebP image');

      // Replacing an existing portrait never counts against the quotas; only a new one does.
      const previous = await portraits.get(ownerId, id, characterId);
      if (!previous) {
        if ((await portraits.count(ownerId, id)) >= limits.perCampaign) {
          throw new HttpError(400, `A campaign can have at most ${limits.perCampaign} portraits. Remove one first.`);
        }
        if ((await portraits.count(ownerId)) >= limits.perOwner) {
          throw new HttpError(400, `An account can have at most ${limits.perOwner} portraits. Remove one first.`);
        }
      }

      const version = await portraits.put(ownerId, id, characterId, { contentType, bytes });
      try {
        res.json(await mutateCampaign(campaigns, ownerId, id, (c) => setPortraitVersion(c, characterId, version), updates));
      } catch (err) {
        // Put things back as they were: the old image if there was one, otherwise nothing.
        if (previous) await portraits.put(ownerId, id, characterId, previous);
        else await portraits.delete(ownerId, id, characterId);
        throw err;
      }
    },
  );

  router.delete(path, async (req, res) => {
    const { id, characterId } = req.params;
    await requireCharacter(req.userId!, id, characterId);
    await portraits.delete(req.userId!, id, characterId);
    res.json(await mutateCampaign(campaigns, req.userId!, id, (c) => setPortraitVersion(c, characterId, undefined), updates));
  });

  // Returns a preview only; the DM keeps it by uploading it, so there is one validation path.
  router.post(`${path}/generate`, async (req, res) => {
    const { id, characterId } = req.params;
    const ownerId = req.userId!;
    await requireCharacter(ownerId, id, characterId);
    if (!generator) throw new HttpError(503, 'Portrait generation is not configured');
    const prompt = parsePrompt(req.body);

    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (!(await usage.consume(ownerId, day, dailyLimit))) {
      const resetsAt = new Date(Math.floor(now / DAY_MS) * DAY_MS + DAY_MS).toISOString();
      throw new HttpError(429, `Daily portrait limit of ${dailyLimit} reached. It resets at ${resetsAt}.`);
    }
    if (!(await usage.consume(GLOBAL_USAGE_KEY, day, globalDailyLimit))) {
      await usage.release(ownerId, day);
      throw new HttpError(429, 'Portrait generation is temporarily unavailable. Try again tomorrow, or upload an image instead.');
    }
    try {
      const image = await generator.generate(prompt);
      if (image.bytes.length > MAX_PORTRAIT_BYTES) throw new HttpError(502, 'The generated image was too large');
      res.json({ contentType: image.contentType, data: image.bytes.toString('base64') });
    } catch (err) {
      await usage.release(ownerId, day);
      await usage.release(GLOBAL_USAGE_KEY, day);
      throw err;
    }
  });

  return router;
}
