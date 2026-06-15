import { create } from 'zustand';

interface SyncState {
  isSyncing: boolean;
  lastSync: Date | null;
  setSyncing: (status: boolean) => void;
  setLastSync: (date: Date) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSync: null,
  setSyncing: (status) => set({ isSyncing: status }),
  setLastSync: (date) => set({ lastSync: date }),
}));