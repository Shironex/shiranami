// Electron preload entry. The actual implementation lives in `./preload/` —
// this file is the bundler entry point referenced by esbuild.config.mjs and
// loaded by BrowserWindow's webPreferences.preload (window.ts), kept stable so
// the build pipeline doesn't need to track the split. Importing the index runs
// `contextBridge.exposeInMainWorld` as a side effect.

// Sentry preload: exposes the renderer↔main IPC bridge via contextBridge so the
// renderer SDK uses Electron IPC (Classic) instead of the HTTP-protocol fallback.
// Required because we bundle the main process — the SDK can't auto-inject its
// preload into a packaged build, so we wire it manually here. It's a no-op IPC
// channel with no network egress; harmless when telemetry is off.
import '@sentry/electron/preload';

import './preload/index';

export type { ElectronAPI } from './preload/index';
