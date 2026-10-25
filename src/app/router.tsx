import { Navigate, createBrowserRouter } from 'react-router-dom';
import { CampaignRoute } from './layout/CampaignRoute';
import { CampaignPickerPage } from '../features/campaigns/CampaignPickerPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { SessionsPage } from '../features/sessions/SessionsPage';
import { QuestsPage } from '../features/quests/QuestsPage';
import { NpcCodexPage } from '../features/npcs/NpcCodexPage';

export const router = createBrowserRouter([
  { path: '/', element: <CampaignPickerPage /> },
  {
    path: '/c/:campaignId',
    element: <CampaignRoute />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'sessions', element: <SessionsPage /> },
      { path: 'quests', element: <QuestsPage /> },
      { path: 'npcs', element: <NpcCodexPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
