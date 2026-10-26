import {
  DomainError,
  addCampaign,
  removeCampaign,
  setActiveCampaign as selectCampaign,
  type Campaign,
  type Id,
  type Library,
  type PlayerCharacter,
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

  // Characters are stored on the server.
  upsertCharacter: (character: PlayerCharacter) => Promise<void>;
  deleteCharacter: (id: Id) => Promise<void>;

  // Everything below is not connected to the server yet and refuses to save.
  upsertNpc: (...args: unknown[]) => never;
  upsertStatDefinition: (...args: unknown[]) => never;
  deleteStatDefinition: (...args: unknown[]) => never;
  upsertRace: (...args: unknown[]) => never;
  deleteRace: (...args: unknown[]) => never;
  upsertClass: (...args: unknown[]) => never;
  deleteClass: (...args: unknown[]) => never;
  upsertQuest: (...args: unknown[]) => never;
  upsertSession: (...args: unknown[]) => never;
  deleteNpc: (...args: unknown[]) => never;
  deleteQuest: (...args: unknown[]) => never;
  deleteSession: (...args: unknown[]) => never;
}

const empty: Library = { campaigns: {}, order: [], activeCampaignId: null };

const notYet = (what: string) => (): never => {
  throw new DomainError(`Saving ${what} is not connected to the server yet.`);
};

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

    upsertCharacter: async (character) =>
      apply(await api<Campaign>('PUT', `/campaigns/${activeId()}/characters/${character.id}`, character)),
    deleteCharacter: async (id) =>
      apply(await api<Campaign>('DELETE', `/campaigns/${activeId()}/characters/${id}`)),

    upsertNpc: notYet('NPCs'),
    deleteNpc: notYet('NPCs'),
    upsertQuest: notYet('quests'),
    deleteQuest: notYet('quests'),
    upsertSession: notYet('sessions'),
    deleteSession: notYet('sessions'),
    upsertStatDefinition: notYet('stats'),
    deleteStatDefinition: notYet('stats'),
    upsertRace: notYet('races'),
    deleteRace: notYet('races'),
    upsertClass: notYet('classes'),
    deleteClass: notYet('classes'),
  };
});

/** The active campaign. Routes must ensure one exists before rendering pages. */
export const useCampaign = (): Campaign => {
  const campaign = useCampaignStore((s) => (s.activeCampaignId ? s.campaigns[s.activeCampaignId] : undefined));
  if (!campaign) throw new Error('No active campaign');
  return campaign;
};
