import type { Campaign } from '@questkeeper/domain';
import { api } from './client';

export const MAX_PORTRAIT_BYTES = 500_000;
export const PORTRAIT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const path = (campaignId: string, characterId: string) =>
  `/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}/portrait`;

/** The version in the URL makes the browser fetch the image again whenever it changes. */
export const portraitUrl = (campaignId: string, characterId: string, version: number) =>
  `/api${path(campaignId, characterId)}?v=${version}`;

export const uploadPortrait = (campaignId: string, characterId: string, image: Blob) =>
  api<Campaign>('PUT', path(campaignId, characterId), image);

export const deletePortrait = (campaignId: string, characterId: string) =>
  api<Campaign>('DELETE', path(campaignId, characterId));

export interface GeneratedPortrait {
  contentType: string;
  data: string;
}

export const generatePortrait = (campaignId: string, characterId: string, prompt: string) =>
  api<GeneratedPortrait>('POST', `${path(campaignId, characterId)}/generate`, { prompt });

export const generatedToBlob = ({ contentType, data }: GeneratedPortrait): Blob =>
  new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: contentType });
