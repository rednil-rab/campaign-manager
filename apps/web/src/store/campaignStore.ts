import {
  addCampaign,
  removeCampaign,
  setActiveCampaign as selectCampaign,
  type Campaign,
  type Id,
  type Library,
  type Npc,
  type PlayerCharacter,
  type Quest,
  type RuleOption,
  type Session,
  type StatDefinition,
} from '@questkeeper/domain';
import { create } from 'zustand';
import { api } from '../api/client';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CampaignState extends Library {
  status: LoadStatus;
  load: () => Promise<void>;
  /** Forgets everything, e.g. on sign-out. */
  reset: () => void;

  createCampaign: (name: string) => Promise<Id>;
  createSampleCampaign: () => Promise<Id>;
  renameCampaign: (id: Id, name: string) => Promise<void>;
  deleteCampaign: (id: Id) => Promise<void>;
  setActiveCampaign: (id: Id) => void;

  // Everything below is stored on the server and resolves once the saved campaign is applied.
  upsertCharacter: (character: PlayerCharacter) => Promise<void>;
  deleteCharacter: (id: Id) => Promise<void>;
  upsertNpc: (npc: Npc) => Promise<void>;
  deleteNpc: (id: Id) => Promise<void>;
  upsertQuest: (quest: Quest) => Promise<void>;
  deleteQuest: (id: Id) => Promise<void>;
  upsertSession: (session: Session) => Promise<void>;
  deleteSession: (id: Id) => Promise<void>;
  upsertStatDefinition: (def: StatDefinition) => Promise<void>;
  deleteStatDefinition: (id: Id) => Promise<void>;
  upsertRace: (race: RuleOption) => Promise<void>;
  deleteRace: (id: Id) => Promise<void>;
  upsertClass: (option: RuleOption) => Promise<void>;
  deleteClass: (id: Id) => Promise<void>;
}

const empty: Library = { campaigns: {}, order: [], activeCampaignId: null };

const withCampaign = (lib: Library, campaign: Campaign): Library =>
  lib.campaigns[campaign.id]
    ? { ...lib, campaigns: { ...lib.campaigns, [campaign.id]: campaign } }
    : addCampaign(lib, campaign);

export const useCampaignStore = create<CampaignState>()((set, get) => {
  const activeId = (): Id => {
    const id = get().activeCampaignId;
    if (!id || !get().campaigns[id]) throw new Error('No active campaign');
    return id;
  };

  /** Applies the campaign returned by the server, which is the source of truth. */
  const apply = (campaign: Campaign) => set((s) => withCampaign(s, campaign));

  const save = async (kind: string, item: { id: Id }) =>
    apply(await api<Campaign>('PUT', `/campaigns/${activeId()}/${kind}/${item.id}`, item));
  const remove = async (kind: string, id: Id) =>
    apply(await api<Campaign>('DELETE', `/campaigns/${activeId()}/${kind}/${id}`));

  return {
    ...empty,
    status: 'idle',

    load: async () => {
      set({ status: 'loading' });
      try {
        const campaigns = await api<Campaign[]>('GET', '/campaigns');
        set((s) => {
          const byId = Object.fromEntries(campaigns.map((c) => [c.id, c]));
          const order = campaigns.map((c) => c.id);
          const keep = s.activeCampaignId && byId[s.activeCampaignId] ? s.activeCampaignId : null;
          return { campaigns: byId, order, activeCampaignId: keep ?? order[0] ?? null, status: 'ready' };
        });
      } catch (err) {
        set({ status: 'error' });
        throw err;
      }
    },
    reset: () => set({ ...empty, status: 'idle' }),

    createCampaign: async (name) => {
      const campaign = await api<Campaign>('POST', '/campaigns', { name });
      apply(campaign);
      return campaign.id;
    },
    createSampleCampaign: async () => {
      const campaign = await api<Campaign>('POST', '/campaigns', { sample: true });
      apply(campaign);
      return campaign.id;
    },
    renameCampaign: async (id, name) => apply(await api<Campaign>('PATCH', `/campaigns/${id}`, { name })),
    deleteCampaign: async (id) => {
      await api('DELETE', `/campaigns/${id}`);
      set((s) => removeCampaign(s, id));
    },
    setActiveCampaign: (id) => set((s) => selectCampaign(s, id)),

    upsertCharacter: (item) => save('characters', item),
    deleteCharacter: (id) => remove('characters', id),
    upsertNpc: (item) => save('npcs', item),
    deleteNpc: (id) => remove('npcs', id),
    upsertQuest: (item) => save('quests', item),
    deleteQuest: (id) => remove('quests', id),
    upsertSession: (item) => save('sessions', item),
    deleteSession: (id) => remove('sessions', id),
    upsertStatDefinition: (item) => save('stats', item),
    deleteStatDefinition: (id) => remove('stats', id),
    upsertRace: (item) => save('races', item),
    deleteRace: (id) => remove('races', id),
    upsertClass: (item) => save('classes', item),
    deleteClass: (id) => remove('classes', id),
  };
});

/** The active campaign. Routes must ensure one exists before rendering pages. */
export const useCampaign = (): Campaign => {
  const campaign = useCampaignStore((s) => (s.activeCampaignId ? s.campaigns[s.activeCampaignId] : undefined));
  if (!campaign) throw new Error('No active campaign');
  return campaign;
};
