import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { rememberDaoLaunchContext } from '../utils/daoStreamLaunch';

export type AppMode = 'user' | 'dao';

interface AppModeState {
  /** The saved workspace. It only changes while a wallet is connected. */
  mode: AppMode;
  /** A workspace picked before connecting. It's saved once a wallet connects, so closing the picker changes nothing. */
  pendingMode: AppMode | null;
  /** Pick a workspace before a wallet is connected. */
  setMode: (mode: AppMode) => void;
  /** Save a workspace while a wallet is connected. */
  saveMode: (mode: AppMode) => void;
  commitPendingMode: () => void;
}

export const useAppMode = create<AppModeState>()(
  persist(
    (set, get) => {
      const saveMode = (mode: AppMode) => {
        if (mode === 'user' && get().mode === 'dao') rememberDaoLaunchContext(null);
        set({ mode, pendingMode: null });
      };

      return {
        mode: 'user',
        pendingMode: null,
        setMode: (mode) => set({ pendingMode: mode }),
        saveMode,
        commitPendingMode: () => {
          const { pendingMode } = get();
          if (pendingMode) saveMode(pendingMode);
        },
      };
    },
    {
      name: 'flowguard-app-mode',
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
