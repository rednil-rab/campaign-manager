import { ashenCrown, deleteCharacter, emptyCampaign, upsertCharacter } from '@questkeeper/domain';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../auth/session';
import type { Config } from '../config';
import { HttpError } from '../errors';
import { parseCampaignName, parseCharacter } from './parse';
import { mutateCampaign } from './service';
import type { CampaignRepo } from './types';

const MAX_CAMPAIGNS_PER_USER = 50;

export function campaignsRouter(repo: CampaignRepo, config: Pick<Config, 'jwtSecret'>) {
  const router = Router();
  router.use(requireAuth(config.jwtSecret));

  router.get('/', async (req, res) => {
    const stored = await repo.list(req.userId!);
    res.json(stored.map((s) => s.campaign));
  });

  router.post('/', async (req, res) => {
    const ownerId = req.userId!;
    if ((await repo.list(ownerId)).length >= MAX_CAMPAIGNS_PER_USER) {
      throw new HttpError(400, `You can have at most ${MAX_CAMPAIGNS_PER_USER} campaigns`);
    }
    const id = randomUUID();
    const sample = req.body?.sample === true;
    const campaign = sample
      ? { ...structuredClone(ashenCrown), id }
      : emptyCampaign(id, parseCampaignName(req.body));
    res.status(201).json((await repo.insert(ownerId, campaign)).campaign);
  });

  router.patch('/:id', async (req, res) => {
    const name = parseCampaignName(req.body);
    res.json(await mutateCampaign(repo, req.userId!, req.params.id, (c) => ({ ...c, name })));
  });

  router.delete('/:id', async (req, res) => {
    if (!(await repo.delete(req.userId!, req.params.id))) throw new HttpError(404, 'Campaign not found');
    res.status(204).end();
  });

  router.put('/:id/characters/:characterId', async (req, res) => {
    const character = parseCharacter(req.body);
    if (character.id !== req.params.characterId) throw new HttpError(400, 'Character id does not match the URL');
    res.json(await mutateCampaign(repo, req.userId!, req.params.id, (c) => upsertCharacter(c, character)));
  });

  router.delete('/:id/characters/:characterId', async (req, res) => {
    res.json(
      await mutateCampaign(repo, req.userId!, req.params.id, (c) => deleteCharacter(c, req.params.characterId)),
    );
  });

  return router;
}
