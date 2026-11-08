import { create } from 'zustand';
import type { SyncErrorCode } from '@/lib/sync-client';
import type { DesktopPeer } from '@/lib/sync-peer';
import type { SyncProgress, SyncSummary } from '@/lib/sync-run';

interface SyncState {
  /** False until the saved peer has been read. */
  loaded: boolean;
  peer: DesktopPeer | null;
  running: boolean;
  progress: SyncProgress | null;
  error: SyncErrorCode | null;
  last: SyncSummary | null;
}

interface SyncActions {
  setPeer: (peer: DesktopPeer | null) => void;
  begin: () => void;
  setProgress: (progress: SyncProgress) => void;
  finish: (summary: SyncSummary) => void;
  fail: (error: SyncErrorCode) => void;
}

/** The paired desktop and the pull from it, shared by Settings and the desktop screen. */
export const useSyncStore = create<SyncState & SyncActions>(set => ({
  loaded: false,
  peer: null,
  running: false,
  progress: null,
  error: null,
  last: null,

  setPeer: peer => set({ peer, loaded: true, error: null }),
  begin: () => set({ running: true, progress: null, error: null }),
  setProgress: progress => set({ progress }),
  finish: last => set({ running: false, last }),
  fail: error => set({ running: false, error }),
}));
