import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { HttpError } from '../errors';
import type { Config } from '../config';
import { DuplicateEmailError, type User, type UserRepo } from '../users/types';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, requireAuth, signSession } from './session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
// bcrypt ignores everything past 72 bytes, so longer passwords would silently weaken.
const MAX_PASSWORD = 72;

function parseCredentials(body: unknown): { email: string; password: string } {
  const { email, password } = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email.trim())) {
    throw new HttpError(400, 'A valid email is required');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    throw new HttpError(400, `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
  }
  return { email: email.trim().toLowerCase(), password };
}

const publicUser = (u: User) => ({ id: u.id, email: u.email });

export function authRouter(users: UserRepo, config: Pick<Config, 'jwtSecret' | 'bcryptRounds' | 'secureCookies'>) {
  const router = Router();

  const startSession = (res: Response, user: User) => {
    res.cookie(SESSION_COOKIE, signSession(user.id, config.jwtSecret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: SESSION_MAX_AGE_MS,
    });
  };

  // Compared against when the email is unknown so response time doesn't reveal which emails exist.
  const dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

  router.post('/register', async (req, res) => {
    const { email, password } = parseCredentials(req.body);
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    try {
      const user = await users.create({ email, passwordHash });
      startSession(res, user);
      res.status(201).json(publicUser(user));
    } catch (err) {
      if (err instanceof DuplicateEmailError) throw new HttpError(409, 'That email is already registered');
      throw err;
    }
  });

  router.post('/login', async (req, res) => {
    const { email, password } = parseCredentials(req.body);
    const user = await users.findByEmail(email);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
    if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
    startSession(res, user);
    res.json(publicUser(user));
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies });
    res.status(204).end();
  });

  router.get('/me', requireAuth(config.jwtSecret), async (req, res) => {
    const user = await users.findById(req.userId!);
    if (!user) throw new HttpError(401, 'Not signed in');
    res.json(publicUser(user));
  });

  return router;
}
