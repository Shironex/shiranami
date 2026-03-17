/** Whether we're running inside Electron (vs plain browser) */
export const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI;

const platform = IS_ELECTRON ? window.electronAPI?.platform : undefined;

/** Whether the app is running on Windows inside Electron */
export const IS_WINDOWS = IS_ELECTRON && platform === 'win32';

/** Whether the app is running on macOS */
export const IS_MAC =
  platform === 'darwin' ||
  (!IS_ELECTRON &&
    typeof navigator !== 'undefined' &&
    ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform === 'macOS' ||
      /Mac|iPhone|iPad/.test(navigator.platform)));
