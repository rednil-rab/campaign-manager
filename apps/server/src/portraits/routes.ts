import {
  setNpcPortraitVersion,
  setPortraitVersion,
  type Campaign,
} from '@questkeeper/domain';
import express, { Router, type Response } from 'express';
import { requireAuth } from '../auth/session';
import { mutateCampaign } from '../campaigns/service';
import type { CampaignRepo } from '../campaigns/types';
import type { CampaignUpdateHub } from '../campaigns/updates';
import type { Config } from '../config';
import { HttpError } from '../errors';
import type { PortraitGenerator } from './generator';
import { MAX_PORTRAITS_PER_CAMPAIGN, MAX_PORTRAITS_PER_OWNER, MAX_PORTRAIT_BYTES, sniffImage } from './image';
import type { PortraitKind, PortraitRepo, PortraitUsageRepo } from './types';

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

/** Route params; spelled out because the path is built from a template, so Express cannot infer them. */
type Params = { id: string; entityId: string };

/** What differs between the things that can have a portrait; everything else is shared. */
interface SubjectType {
  segment: 'characters' | 'npcs';
  kind: PortraitKind;
  label: string;
  exists: (campaign: Campaign, id: string) => boolean;
  setVersion: (campaign: Campaign, id: string, version: number | undefined) => Campaign;
}

const SUBJECT_TYPES: SubjectType[] = [
  {
    segment: 'characters',
    kind: 'character',
    label: 'Character',
    exists: (c, id) => c.characters.some((p) => p.id === id),
    setVersion: setPortraitVersion,
  },
  {
    segment: 'npcs',
    kind: 'npc',
    label: 'NPC',
    exists: (c, id) => c.npcs.some((n) => n.id === id),
    setVersion: setNpcPortraitVersion,
  },
];

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

  /** Replacing an existing portrait never counts against the quotas; only a new one does. */
  const assertRoomForNewPortrait = async (ownerId: string, campaignId: string) => {
    if ((await portraits.count(ownerId, campaignId)) >= limits.perCampaign) {
      throw new HttpError(400, `A campaign can have at most ${limits.perCampaign} portraits. Remove one first.`);
    }
    if ((await portraits.count(ownerId)) >= limits.perOwner) {
      throw new HttpError(400, `An account can have at most ${limits.perOwner} portraits. Remove one first.`);
    }
  };

  for (const type of SUBJECT_TYPES) {
    const path = `/:id/${type.segment}/:entityId/portrait`;
    const subject = (entityId: string) => ({ kind: type.kind, id: entityId });

    const requireSubject = async (ownerId: string, campaignId: string, entityId: string) => {
      const stored = await campaigns.get(ownerId, campaignId);
      if (!stored) throw new HttpError(404, 'Campaign not found');
      if (!type.exists(stored.campaign, entityId)) throw new HttpError(404, `${type.label} not found`);
    };

    router.get<Params>(path, async (req, res) => {
      const { id, entityId } = req.params;
      const portrait = await portraits.get(req.userId!, id, subject(entityId));
      if (!portrait) throw new HttpError(404, 'No portrait');
      setImageHeaders(res, portrait.contentType);
      res.setHeader('Cache-Control', 'private, no-cache');
      res.send(portrait.bytes);
    });

    router.put<Params>(path,
      express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_PORTRAIT_BYTES }),
      async (req, res) => {
        const { id, entityId } = req.params;
        const ownerId = req.userId!;
        await requireSubject(ownerId, id, entityId);
        const bytes: unknown = req.body;
        if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
          throw new HttpError(400, 'Send the image as the request body, as a JPEG, PNG or WebP');
        }
        const contentType = sniffImage(bytes);
        if (!contentType) throw new HttpError(400, 'The file must be a JPEG, PNG or WebP image');

        const previous = await portraits.get(ownerId, id, subject(entityId));
        if (!previous) await assertRoomForNewPortrait(ownerId, id);

        const version = await portraits.put(ownerId, id, subject(entityId), { contentType, bytes });
        try {
          res.json(await mutateCampaign(campaigns, ownerId, id, (c) => type.setVersion(c, entityId, version), updates));
        } catch (err) {
          // Put things back as they were: the old image if there was one, otherwise nothing.
          if (previous) await portraits.put(ownerId, id, subject(entityId), previous);
          else await portraits.delete(ownerId, id, subject(entityId));
          throw err;
        }
      },
    );

    router.delete<Params>(path, async (req, res) => {
      const { id, entityId } = req.params;
      await requireSubject(req.userId!, id, entityId);
      await portraits.delete(req.userId!, id, subject(entityId));
      res.json(await mutateCampaign(campaigns, req.userId!, id, (c) => type.setVersion(c, entityId, undefined), updates));
    });

    // Returns a preview only; the DM keeps it by uploading it, so there is one validation path.
    router.post<Params>(`${path}/generate`, async (req, res) => {
      const { id, entityId } = req.params;
      const ownerId = req.userId!;
      await requireSubject(ownerId, id, entityId);
      if (!generator) throw new HttpError(503, 'Portrait generation is not configured');
      const prompt = parsePrompt(req.body);
      // Refuse early so a generation is not spent on an image that could not be kept.
      if (!(await portraits.get(ownerId, id, subject(entityId)))) await assertRoomForNewPortrait(ownerId, id);

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
  }

  return router;
}
