import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { SessionsPage } from '../features/sessions/SessionsPage';
import { QuestsPage } from '../features/quests/QuestsPage';
import { NpcCodexPage } from '../features/npcs/NpcCodexPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'sessions', element: <SessionsPage /> },
      { path: 'quests', element: <QuestsPage /> },
      { path: 'npcs', element: <NpcCodexPage /> },
    ],
  },
]);
