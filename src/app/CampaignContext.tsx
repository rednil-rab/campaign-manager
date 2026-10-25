import { createContext, useContext, type ReactNode } from 'react';
import type { Campaign } from '../domain/types';
import { ashenCrown } from '../data/ashenCrown';

const CampaignContext = createContext<Campaign | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  return (
    <CampaignContext.Provider value={ashenCrown}>{children}</CampaignContext.Provider>
  );
}

export function useCampaign(): Campaign {
  const campaign = useContext(CampaignContext);
  if (!campaign) throw new Error('useCampaign must be used within CampaignProvider');
  return campaign;
}
