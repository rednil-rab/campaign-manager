import { create } from 'zustand';
import { ApiError, api, setUnauthorizedHandler } from '../api/client';
import { useCampaignStore } from './campaignStore';

export interface User {
  id: string;
  email: string;
}

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated';
  user: User | null;
  /** Checks for an existing session; call once on startup. */
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => {
  const signedIn = (user: User) => set({ status: 'authenticated', user });
  const signedOut = () => {
    set({ status: 'anonymous', user: null });
    useCampaignStore.getState().reset();
  };

  // A 401 from any request means the session is gone.
  setUnauthorizedHandler(signedOut);

  return {
    status: 'loading',
    user: null,

    init: async () => {
      try {
        signedIn(await api<User>('GET', '/auth/me'));
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        set({ status: 'anonymous', user: null });
      }
    },
    login: async (email, password) => signedIn(await api<User>('POST', '/auth/login', { email, password })),
    register: async (email, password) => signedIn(await api<User>('POST', '/auth/register', { email, password })),
    logout: async () => {
      try {
        await api('POST', '/auth/logout');
      } finally {
        signedOut();
      }
    },
  };
});
