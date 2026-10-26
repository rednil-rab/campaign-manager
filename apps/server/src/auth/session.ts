import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../errors';

export const SESSION_COOKIE = 'qk_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export const signSession = (userId: string, secret: string): string =>
  jwt.sign({}, secret, { subject: userId, expiresIn: Math.floor(SESSION_MAX_AGE_MS / 1000) });

export function requireAuth(secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string') throw new HttpError(401, 'Not signed in');
    try {
      const payload = jwt.verify(token, secret);
      if (typeof payload === 'string' || !payload.sub) throw new Error('bad payload');
      req.userId = payload.sub;
      next();
    } catch {
      throw new HttpError(401, 'Not signed in');
    }
  };
}
