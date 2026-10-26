import { DomainError, type Campaign } from '@questkeeper/domain';
import { HttpError } from '../errors';
import { assertCampaignSize } from './parse';
import type { CampaignRepo } from './types';

const MAX_ATTEMPTS = 3;

/**
 * Loads a campaign, applies a pure domain function to it and saves the result.
 * If another request saved in between, the function is re-applied to the fresh copy,
 * so concurrent edits to different records are not lost.
 */
export async function mutateCampaign(
  repo: CampaignRepo,
  ownerId: string,
  id: string,
  fn: (campaign: Campaign) => Campaign,
): Promise<Campaign> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const stored = await repo.get(ownerId, id);
    if (!stored) throw new HttpError(404, 'Campaign not found');

    let next: Campaign;
    try {
      next = fn(stored.campaign);
    } catch (err) {
      if (err instanceof DomainError) throw new HttpError(400, err.message);
      throw err;
    }
    // The id and ownership are fixed by the server, never by a domain function.
    next = { ...next, id };
    assertCampaignSize(next);

    const saved = await repo.replace(ownerId, id, stored.version, next);
    if (saved) return saved.campaign;
  }
  throw new HttpError(409, 'The campaign was changed by another request, please try again');
}
