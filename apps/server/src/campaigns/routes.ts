import {
  ashenCrown,
  deleteCharacter,
  deleteClass,
  deleteNpc,
  deleteQuest,
  deleteRace,
  deleteSession,
  deleteStatDefinition,
  emptyCampaign,
  upsertCharacter,
  upsertClass,
  upsertNpc,
  upsertQuest,
  upsertRace,
  upsertSession,
  upsertStatDefinition,
  type Campaign,
} from '@questkeeper/domain';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../auth/session';
import type { Config } from '../config';
import { HttpError } from '../errors';
import {
  parseCampaignName,
  parseCharacter,
  parseNpc,
  parseQuest,
  parseRuleOption,
  parseSession,
} from './parse';
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

  // Every entity is replaced with PUT /:id/<kind>/:entityId and removed with DELETE on the same path.
  // The domain action does the validation and any cascades; the response is the updated campaign.
  const entity = <T extends { id: string }>(
    kind: string,
    parse: (body: unknown) => T,
    upsert: (c: Campaign, item: T) => Campaign,
    remove: (c: Campaign, id: string) => Campaign,
  ) => {
    router.put(`/:id/${kind}/:entityId`, async (req, res) => {
      const item = parse(req.body);
      if (item.id !== req.params.entityId) throw new HttpError(400, 'The id does not match the URL');
      res.json(await mutateCampaign(repo, req.userId!, req.params.id, (c) => upsert(c, item)));
    });
    router.delete(`/:id/${kind}/:entityId`, async (req, res) => {
      res.json(await mutateCampaign(repo, req.userId!, req.params.id, (c) => remove(c, req.params.entityId)));
    });
  };

  entity('characters', parseCharacter, upsertCharacter, deleteCharacter);
  entity('npcs', parseNpc, upsertNpc, deleteNpc);
  entity('quests', parseQuest, upsertQuest, deleteQuest);
  entity('sessions', parseSession, upsertSession, deleteSession);
  entity('stats', parseRuleOption, upsertStatDefinition, deleteStatDefinition);
  entity('races', parseRuleOption, upsertRace, deleteRace);
  entity('classes', parseRuleOption, upsertClass, deleteClass);

  return router;
}
