import { api } from './client';

export interface ShareInfo {
  characterId: string;
  token: string;
}

export const listShares = (campaignId: string) => api<ShareInfo[]>('GET', `/campaigns/${campaignId}/shares`);

export const createShare = (campaignId: string, characterId: string) =>
  api<ShareInfo>('POST', `/campaigns/${campaignId}/characters/${characterId}/share`);

export const revokeShare = (campaignId: string, characterId: string) =>
  api('DELETE', `/campaigns/${campaignId}/characters/${characterId}/share`);

/** The full URL a player opens; it works with the app served from any base path. */
export const playerLink = (token: string) => `${window.location.origin}${import.meta.env.BASE_URL}play/${token}`;
