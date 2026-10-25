import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { CampaignProvider } from './app/CampaignContext';
import { router } from './app/router';
import './styles/tokens.css';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CampaignProvider>
      <RouterProvider router={router} />
    </CampaignProvider>
  </StrictMode>,
);
