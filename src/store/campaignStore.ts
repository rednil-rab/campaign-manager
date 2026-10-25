import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ashenCrown } from '../data/ashenCrown';
import * as actions from '../domain/actions';
import * as lib from '../domain/library';
import type { Library } from '../domain/library';
import type { Campaign, Id, Npc, Quest, Session } from '../domain/types';

interface CampaignState extends Library {
  createCampaign: (name: string) => Id;
  renameCampaign: (id: Id, name: string) => void;
  deleteCampaign: (id: Id) => void;
  setActiveCampaign: (id: Id) => void;

  // The actions below apply to the active campaign.
  upsertNpc: (npc: Npc) => void;
  upsertQuest: (quest: Quest) => void;
  upsertSession: (session: Session) => void;
  deleteNpc: (id: Id) => void;
  deleteQuest: (id: Id) => void;
  deleteSession: (id: Id) => void;

  resetToSample: () => void;
}

const newId = (): Id => crypto.randomUUID();

const selectActive = (s: Library): Campaign | undefined =>
  s.activeCampaignId ? s.campaigns[s.activeCampaignId] : undefined;

// Actions throw DomainError on invalid input; callers (forms) should catch it.
export const useCampaignStore = create<CampaignState>()(
  persist(
    (set) => {
      const mutateActive = (fn: (c: Campaign) => Campaign) =>
        set((s) => {
          const id = s.activeCampaignId;
          if (!id || !s.campaigns[id]) throw new Error('No active campaign');
          return { campaigns: { ...s.campaigns, [id]: fn(s.campaigns[id]) } };
        });

      return {
        ...lib.libraryOf(ashenCrown),

        createCampaign: (name) => {
          const id = newId();
          set((s) => lib.addCampaign(s, lib.emptyCampaign(id, name)));
          return id;
        },
        renameCampaign: (id, name) => set((s) => lib.renameCampaign(s, id, name)),
        deleteCampaign: (id) => set((s) => lib.removeCampaign(s, id)),
        setActiveCampaign: (id) => set((s) => lib.setActiveCampaign(s, id)),

        upsertNpc: (npc) => mutateActive((c) => actions.upsertNpc(c, npc)),
        upsertQuest: (q) => mutateActive((c) => actions.upsertQuest(c, q)),
        upsertSession: (x) => mutateActive((c) => actions.upsertSession(c, x)),
        deleteNpc: (id) => mutateActive((c) => actions.deleteNpc(c, id)),
        deleteQuest: (id) => mutateActive((c) => actions.deleteQuest(c, id)),
        deleteSession: (id) => mutateActive((c) => actions.deleteSession(c, id)),

        resetToSample: () => set(lib.libraryOf(ashenCrown)),
      };
    },
    {
      // Key keeps its original name so existing v1 data is found and migrated.
      name: 'questkeeper:v1',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Library => ({
        campaigns: s.campaigns,
        order: s.order,
        activeCampaignId: s.activeCampaignId,
      }),
      // Handles v1 ({ campaign }) and v2 data; unusable data keeps the seeded library.
      merge: (persisted, current) => {
        const parsed = lib.parseStoredLibrary(persisted);
        return parsed ? { ...current, ...parsed } : current;
      },
    },
  ),
);

/** The active campaign. Routes must ensure one exists before rendering pages. */
export const useCampaign = (): Campaign => {
  const campaign = useCampaignStore(selectActive);
  if (!campaign) throw new Error('No active campaign');
  return campaign;
};
