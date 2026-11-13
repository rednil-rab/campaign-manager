import { randomInt } from 'node:crypto';
import {
  appendEvent,
  applyChange,
  describeChange,
  DomainError,
  playerContext,
  queueChange,
  requiresApproval,
  rollDice,
  type AgentChange,
  type Campaign,
} from '@questkeeper/domain';
import { Router } from 'express';
import { mutateCampaign } from '../campaigns/service';
import type { CampaignRepo } from '../campaigns/types';
import type { CampaignUpdateHub } from '../campaigns/updates';
import type { Config } from '../config';
import { HttpError } from '../errors';
import { parseAgentChange, parseAgentEvent, parseRollRequest } from './parse';
import { requireAgentToken } from './token';

type ChangeResult = { status: 'applied' | 'pending_approval' | 'rejected'; reason?: string };

const ITEM_ACTIONS: AgentChange['action'][] = ['add_item', 'remove_item', 'set_item_quantity'];

/** What the game-running agent calls back into. Every call is scoped by the short-lived token. */
export function agentRouter(
  campaigns: CampaignRepo,
  config: Pick<Config, 'jwtSecret'>,
  updates?: CampaignUpdateHub,
) {
  const router = Router();
  router.use(requireAgentToken(config.jwtSecret));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const load = async (ownerId: string, campaignId: string): Promise<Campaign> => {
    const stored = await campaigns.get(ownerId, campaignId);
    if (!stored) throw new HttpError(404, 'Campaign not found');
    return stored.campaign;
  };

  router.get('/context/player', async (req, res) => {
    const g = req.agent!;
    if (!g.characterId) throw new HttpError(400, 'This token is not for a character');
    const ctx = playerContext(await load(g.ownerId, g.campaignId), g.characterId);
    if (!ctx) throw new HttpError(404, 'Character not found');
    res.json(ctx);
  });

  router.get('/context/dm', async (req, res) => {
    const g = req.agent!;
    if (g.mode === 'player_action') throw new HttpError(403, 'Player turns cannot read DM context');
    res.json({ campaign: await load(g.ownerId, g.campaignId) });
  });

  router.post('/events', async (req, res) => {
    const g = req.agent!;
    const e = parseAgentEvent(req.body);
    await mutateCampaign(campaigns, g.ownerId, g.campaignId, (c) =>
      appendEvent(c, {
        // Prefixed with the turn, so one turn can never overwrite or suppress another turn's events.
        id: `${g.turnId}:${e.id}`,
        at: new Date().toISOString(),
        kind: e.kind,
        text: e.text,
        visibility: e.visibility,
        source: 'agent',
        sessionId: e.sessionId,
        characterId: g.characterId,
      }),
      updates,
    );
    res.status(201).json({ ok: true });
  });

  router.post('/roll', async (req, res) => {
    const g = req.agent!;
    const r = parseRollRequest(req.body);
    let roll;
    try {
      roll = rollDice(r.dice, randomInt);
    } catch (err) {
      if (err instanceof DomainError) throw new HttpError(400, err.message);
      throw err;
    }
    const eventId = `${g.turnId}:roll:${r.id}`;
    const text = r.reason ? `${r.reason}: ${roll.text}` : roll.text;
    let existing: string | undefined;
    await mutateCampaign(campaigns, g.ownerId, g.campaignId, (c) => {
      existing = c.events?.find((e) => e.id === eventId)?.text;
      if (existing) return c;
      return appendEvent(c, {
        id: eventId,
        at: new Date().toISOString(),
        kind: 'roll',
        text,
        visibility: 'table',
        source: 'agent',
        characterId: g.characterId,
      });
    }, updates);
    // A retried request gets the original result back instead of a new roll.
    if (existing) res.json({ repeated: true, text: existing });
    else res.json({ repeated: false, total: roll.total, rolls: roll.rolls, modifier: roll.modifier, text });
  });

  router.post('/changes', async (req, res) => {
    const g = req.agent!;
    const { id, change } = parseAgentChange(req.body);
    const changeId = `${g.turnId}:${id}`;
    let result: ChangeResult = { status: 'rejected', reason: 'Not processed' };

    await mutateCampaign(campaigns, g.ownerId, g.campaignId, (c) => {
      try {
        // Validate first, so nothing invalid can sit in the DM's queue.
        const next = applyChange(c, change, g.characterId);
        if (requiresApproval(change)) {
          result = { status: 'pending_approval' };
          return queueChange(c, { id: changeId, at: new Date().toISOString(), change, characterId: g.characterId });
        }
        result = { status: 'applied' };
        return appendEvent(next, {
          id: `${changeId}:log`,
          at: new Date().toISOString(),
          kind: 'change',
          text: describeChange(c, change, g.characterId),
          // Inventory changes are table news; anything else could give away unrevealed records.
          visibility: ITEM_ACTIONS.includes(change.action) ? 'table' : 'dm',
          source: 'agent',
          characterId: g.characterId,
        });
      } catch (err) {
        if (err instanceof DomainError) {
          result = { status: 'rejected', reason: err.message };
          return c;
        }
        throw err;
      }
    }, updates);

    res.json({ id, action: change.action, ...result });
  });

  return router;
}
