import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useCampaignStore } from '../../store/campaignStore';
import { AppShell } from './AppShell';

/** Makes the campaign in the URL the active one before rendering its pages. */
export function CampaignRoute() {
  const { campaignId = '' } = useParams();
  const exists = useCampaignStore((s) => campaignId in s.campaigns);
  const isActive = useCampaignStore((s) => s.activeCampaignId === campaignId);
  const setActiveCampaign = useCampaignStore((s) => s.setActiveCampaign);

  useEffect(() => {
    if (exists && !isActive) setActiveCampaign(campaignId);
  }, [exists, isActive, campaignId, setActiveCampaign]);

  if (!exists) return <Navigate to="/" replace />;
  if (!isActive) return null;
  return <AppShell />;
}
