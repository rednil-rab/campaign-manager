import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { LoginPage } from '../../features/auth/LoginPage';
import { useAuthStore } from '../../store/authStore';
import { useCampaignStore } from '../../store/campaignStore';

/** Shows the login page until signed in, and loads the user's campaigns once they are. */
export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);
  const campaignStatus = useCampaignStore((s) => s.status);
  const load = useCampaignStore((s) => s.load);

  useEffect(() => {
    if (status === 'loading') void init();
  }, [status, init]);

  useEffect(() => {
    if (status === 'authenticated' && campaignStatus === 'idle') load().catch(() => undefined);
  }, [status, campaignStatus, load]);

  if (status === 'loading') return <p className="page-sub">Loading…</p>;
  if (status === 'anonymous') return <LoginPage />;
  if (campaignStatus === 'error') {
    return (
      <div className="picker">
        <p className="error" role="alert">
          Could not load your campaigns.
        </p>
        <button className="button" type="button" onClick={() => useCampaignStore.getState().reset()}>
          Try again
        </button>
      </div>
    );
  }
  if (campaignStatus !== 'ready') return <p className="page-sub">Loading…</p>;
  return <Outlet />;
}
