// Electron preload entry. The actual implementation lives in `./preload/` —
// this file is the bundler entry point referenced by esbuild.config.mjs and
// loaded by BrowserWindow's webPreferences.preload (window.ts), kept stable so
// the build pipeline doesn't need to track the split. Importing the index runs
// `contextBridge.exposeInMainWorld` as a side effect.

import './preload/index';

export type { ElectronAPI } from './preload/index';
