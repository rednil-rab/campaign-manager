import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ashenCrown } from '../data/ashenCrown';
import * as actions from '../domain/actions';
import { isCampaign, sanitizeCampaign } from '../domain/integrity';
import type { Campaign, Id, Npc, Quest, Session } from '../domain/types';

interface CampaignState {
  campaign: Campaign;
  upsertNpc: (npc: Npc) => void;
  upsertQuest: (quest: Quest) => void;
  upsertSession: (session: Session) => void;
  deleteNpc: (id: Id) => void;
  deleteQuest: (id: Id) => void;
  deleteSession: (id: Id) => void;
  resetToSample: () => void;
}

// Actions throw DomainError on invalid input; callers (forms) should catch it.
export const useCampaignStore = create<CampaignState>()(
  persist(
    (set) => ({
      campaign: ashenCrown,
      upsertNpc: (npc) => set((s) => ({ campaign: actions.upsertNpc(s.campaign, npc) })),
      upsertQuest: (q) => set((s) => ({ campaign: actions.upsertQuest(s.campaign, q) })),
      upsertSession: (x) => set((s) => ({ campaign: actions.upsertSession(s.campaign, x) })),
      deleteNpc: (id) => set((s) => ({ campaign: actions.deleteNpc(s.campaign, id) })),
      deleteQuest: (id) => set((s) => ({ campaign: actions.deleteQuest(s.campaign, id) })),
      deleteSession: (id) => set((s) => ({ campaign: actions.deleteSession(s.campaign, id) })),
      resetToSample: () => set({ campaign: ashenCrown }),
    }),
    {
      name: 'questkeeper:v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ campaign: state.campaign }),
      // Corrupt or foreign data falls back to the seeded campaign.
      merge: (persisted, current) => {
        const stored = (persisted as { campaign?: unknown } | undefined)?.campaign;
        return isCampaign(stored)
          ? { ...current, campaign: sanitizeCampaign(stored) }
          : current;
      },
    },
  ),
);

export const useCampaign = (): Campaign => useCampaignStore((s) => s.campaign);
export const useCampaignName = (): string => useCampaignStore((s) => s.campaign.name);
