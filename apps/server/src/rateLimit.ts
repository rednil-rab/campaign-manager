import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errors';

/** Fixed-window limiter per client address. Enough to blunt abuse of public endpoints on one instance. */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    if (hits.size > 10_000) {
      for (const [key, h] of hits) if (h.resetAt <= now) hits.delete(key);
    }
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) throw new HttpError(429, 'Too many requests, please slow down');
    next();
  };
}
