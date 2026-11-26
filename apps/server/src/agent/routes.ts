import { randomInt } from 'node:crypto';
import {
  appendEvent,
  applyChange,
  createSession,
  describeChange,
  DomainError,
  endSession,
  patchCharacter,
  patchSession,
  playerContext,
  playerSessions,
  playerView,
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
import { parseAgentChange, parseAgentEvent, parseCharacterPatch, parseRollRequest, parseSessionCreate, parseSessionPatch } from './parse';
import { requireAgentToken, type AgentGrant } from './token';

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

  /** A player turn may only touch its own character; the other modes are not bound to one. */
  const guardCharacter = (g: AgentGrant, characterId: string) => {
    if (g.mode === 'player_action' && g.characterId !== characterId) {
      throw new HttpError(403, 'This token is for a different character');
    }
  };

  /** The full record for the DM modes; for a player turn, only what the player may see. */
  const characterFor = (g: AgentGrant, c: Campaign, characterId: string) => {
    const p = c.characters.find((x) => x.id === characterId);
    if (!p) throw new HttpError(404, 'Character not found');
    return g.mode === 'player_action' ? playerView(c, characterId)!.character : p;
  };

  router.get('/characters', async (req, res) => {
    const g = req.agent!;
    const c = await load(g.ownerId, g.campaignId);
    res.json(
      c.characters
        .filter((p) => g.mode !== 'player_action' || p.id === g.characterId)
        .map((p) => ({ id: p.id, name: p.name, player: p.player, race: p.race, characterClass: p.characterClass })),
    );
  });

  router.get('/characters/:id', async (req, res) => {
    const g = req.agent!;
    const id = String(req.params.id);
    guardCharacter(g, id);
    res.json(characterFor(g, await load(g.ownerId, g.campaignId), id));
  });

  router.patch('/characters/:id', async (req, res) => {
    const g = req.agent!;
    const characterId = String(req.params.id);
    if (g.mode === 'recap') throw new HttpError(403, 'Recap tokens are read-only');
    guardCharacter(g, characterId);
    const { id, patch } = parseCharacterPatch(req.body);
    if (g.mode === 'player_action' && patch.notes !== undefined) {
      throw new HttpError(403, 'Player turns cannot change the DM notes');
    }
    const saved = await mutateCampaign(campaigns, g.ownerId, g.campaignId, (c) => {
      if (!c.characters.some((p) => p.id === characterId)) throw new HttpError(404, 'Character not found');
      const changed = Object.keys(patch).join(', ');
      return appendEvent(patchCharacter(c, characterId, patch), {
        id: `audit:${g.turnId}:${id}`,
        at: new Date().toISOString(),
        kind: 'change',
        text: `Agent updated ${c.characters.find((p) => p.id === characterId)!.name}: ${changed}`,
        visibility: 'dm',
        source: 'agent',
        characterId,
      });
    }, updates);
    res.json(characterFor(g, saved, characterId));
  });

  /** Session writes belong to the DM's own turn. */
  const requireDm = (g: AgentGrant) => {
    if (g.mode !== 'dm_turn') throw new HttpError(403, 'Only DM turns can change sessions');
  };

  const sessionFor = (g: AgentGrant, c: Campaign, sessionId: string) => {
    const s = c.sessions.find((x) => x.id === sessionId);
    // A player turn gets the same 404 for a session it did not attend as for one that does not exist.
    if (!s || (g.mode === 'player_action' && !s.characterIds.includes(g.characterId ?? ''))) {
      throw new HttpError(404, 'Session not found');
    }
    return g.mode === 'player_action' ? playerSessions(c, g.characterId!).find((x) => x.id === sessionId)! : s;
  };

  router.get('/sessions', async (req, res) => {
    const g = req.agent!;
    const c = await load(g.ownerId, g.campaignId);
    res.json(g.mode === 'player_action' ? playerSessions(c, g.characterId ?? '') : c.sessions);
  });

  router.get('/sessions/:id', async (req, res) => {
    const g = req.agent!;
    res.json(sessionFor(g, await load(g.ownerId, g.campaignId), String(req.params.id)));
  });

  /** Applies a session change and logs it for the DM, in one save. */
  const changeSession = async (
    g: AgentGrant,
    sessionId: string,
    requestId: string,
    describe: string,
    apply: (c: Campaign) => Campaign,
  ) =>
    mutateCampaign(campaigns, g.ownerId, g.campaignId, (c) => {
      if (!c.sessions.some((s) => s.id === sessionId)) throw new HttpError(404, 'Session not found');
      return appendEvent(apply(c), {
        id: `audit:${g.turnId}:${requestId}`,
        at: new Date().toISOString(),
        kind: 'change',
        text: describe,
        visibility: 'dm',
        source: 'agent',
        sessionId,
      });
    }, updates);

  router.post('/sessions', async (req, res) => {
    const g = req.agent!;
    requireDm(g);
    const input = parseSessionCreate(req.body);
    const existed = (await load(g.ownerId, g.campaignId)).sessions.some((s) => s.id === input.id);
    const saved = await mutateCampaign(campaigns, g.ownerId, g.campaignId, (c) =>
      appendEvent(createSession(c, input), {
        id: `audit:${g.turnId}:session:${input.id}`,
        at: new Date().toISOString(),
        kind: 'change',
        text: `Agent created session: ${input.title}`,
        visibility: 'dm',
        source: 'agent',
        sessionId: input.id,
      }),
    updates);
    res.status(existed ? 200 : 201).json(saved.sessions.find((s) => s.id === input.id));
  });

  router.patch('/sessions/:id', async (req, res) => {
    const g = req.agent!;
    requireDm(g);
    const sessionId = String(req.params.id);
    const { id, patch } = parseSessionPatch(req.body);
    const saved = await changeSession(g, sessionId, id, `Agent updated session: ${Object.keys(patch).join(', ')}`, (c) =>
      patchSession(c, sessionId, patch),
    );
    res.json(saved.sessions.find((s) => s.id === sessionId));
  });

  router.post('/sessions/:id/end', async (req, res) => {
    const g = req.agent!;
    requireDm(g);
    const sessionId = String(req.params.id);
    const saved = await changeSession(g, sessionId, `end:${sessionId}`, 'Agent ended the session', (c) =>
      endSession(c, sessionId, new Date().toISOString()),
    );
    res.json(saved.sessions.find((s) => s.id === sessionId));
  });

  return router;
}
