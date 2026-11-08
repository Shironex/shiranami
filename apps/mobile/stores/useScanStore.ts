import { create } from 'zustand';
import type { ScanResult } from '@/lib/library-scan';
import type { PermissionState } from '@/lib/media-permission';

interface ScanState {
  running: boolean;
  done: number;
  total: number;
  /** Null until the first scan asked. */
  permission: PermissionState | null;
  last: ScanResult | null;
  error: string | null;
}

interface ScanActions {
  begin: () => void;
  progress: (done: number, total: number) => void;
  finish: (result: ScanResult) => void;
  fail: (error: string) => void;
  setPermission: (permission: PermissionState) => void;
}

/** The phone library scan, shared by the library and Settings so either can show it. */
export const useScanStore = create<ScanState & ScanActions>(set => ({
  running: false,
  done: 0,
  total: 0,
  permission: null,
  last: null,
  error: null,

  begin: () => set({ running: true, done: 0, total: 0, error: null }),
  progress: (done, total) => set({ done, total }),
  finish: last => set({ running: false, last }),
  fail: error => set({ running: false, error }),
  setPermission: permission => set({ permission }),
}));
