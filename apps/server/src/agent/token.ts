import { createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../errors';

export type AgentMode = 'player_action' | 'recap' | 'dm_turn';
export const AGENT_MODES: readonly AgentMode[] = ['player_action', 'recap', 'dm_turn'];

export const AGENT_TOKEN_TTL_SECONDS = 5 * 60;

export interface AgentGrant {
  ownerId: string;
  campaignId: string;
  /** Set for player turns: the only character the agent may act for. */
  characterId?: string;
  turnId: string;
  mode: AgentMode;
}

declare module 'express-serve-static-core' {
  interface Request {
    agent?: AgentGrant;
  }
}

// A key derived for this purpose, so an agent token can never pass as a session cookie (and vice versa).
const signingKey = (secret: string) => createHmac('sha256', secret).update('questkeeper-agent-callback-v1').digest();

/** A short-lived token that lets the agent act on one campaign, for one turn. */
export const mintAgentToken = (secret: string, grant: AgentGrant): string =>
  jwt.sign(
    { own: grant.ownerId, cid: grant.campaignId, chr: grant.characterId, tid: grant.turnId, mode: grant.mode },
    signingKey(secret),
    { audience: 'questkeeper-agent', expiresIn: AGENT_TOKEN_TTL_SECONDS },
  );

export function verifyAgentToken(secret: string, token: string): AgentGrant {
  const p = jwt.verify(token, signingKey(secret), { audience: 'questkeeper-agent' });
  if (typeof p === 'string') throw new Error('bad payload');
  const mode = p.mode as AgentMode;
  if (
    typeof p.own !== 'string' ||
    typeof p.cid !== 'string' ||
    typeof p.tid !== 'string' ||
    !AGENT_MODES.includes(mode) ||
    (p.chr !== undefined && typeof p.chr !== 'string')
  ) {
    throw new Error('bad payload');
  }
  return { ownerId: p.own, campaignId: p.cid, characterId: p.chr, turnId: p.tid, mode };
}

export function requireAgentToken(secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new HttpError(401, 'Missing agent token');
    try {
      req.agent = verifyAgentToken(secret, token);
    } catch {
      throw new HttpError(401, 'Invalid or expired agent token');
    }
    next();
  };
}
