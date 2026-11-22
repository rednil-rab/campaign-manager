import type { Campaign } from '@questkeeper/domain';
import { api } from './client';

export const MAX_PORTRAIT_BYTES = 500_000;
export const PORTRAIT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** The URL segment of the thing the portrait belongs to. */
export type PortraitKind = 'characters' | 'npcs';

const path = (campaignId: string, kind: PortraitKind, id: string) =>
  `/campaigns/${encodeURIComponent(campaignId)}/${kind}/${encodeURIComponent(id)}/portrait`;

/** The version in the URL makes the browser fetch the image again whenever it changes. */
export const portraitUrl = (campaignId: string, kind: PortraitKind, id: string, version: number) =>
  `/api${path(campaignId, kind, id)}?v=${version}`;

/** What a player loads for an NPC the DM has revealed; the server refuses it once the NPC is hidden again. */
export const playerNpcPortraitUrl = (token: string, npcId: string, version: number) =>
  `/api/play/${encodeURIComponent(token)}/npcs/${encodeURIComponent(npcId)}/portrait?v=${version}`;

export const uploadPortrait = (campaignId: string, kind: PortraitKind, id: string, image: Blob) =>
  api<Campaign>('PUT', path(campaignId, kind, id), image);

export const deletePortrait = (campaignId: string, kind: PortraitKind, id: string) =>
  api<Campaign>('DELETE', path(campaignId, kind, id));

export interface GeneratedPortrait {
  contentType: string;
  data: string;
}

export const generatePortrait = (campaignId: string, kind: PortraitKind, id: string, prompt: string) =>
  api<GeneratedPortrait>('POST', `${path(campaignId, kind, id)}/generate`, { prompt });

export const generatedToBlob = ({ contentType, data }: GeneratedPortrait): Blob =>
  new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: contentType });
