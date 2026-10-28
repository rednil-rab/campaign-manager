import { randomBytes } from 'node:crypto';

/** 32 random bytes as base64url: 43 characters, 256 bits of entropy. */
export const newShareToken = (): string => randomBytes(32).toString('base64url');

export const isShareToken = (value: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(value);
