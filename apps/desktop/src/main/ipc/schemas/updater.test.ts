import { describe, it, expect } from 'vitest';
import {
  updaterCheckForUpdatesArgs,
  updaterStartDownloadArgs,
  updaterInstallNowArgs,
} from './updater';

describe('updater payload schemas', () => {
  it('accept zero args', () => {
    expect(updaterCheckForUpdatesArgs.safeParse([]).success).toBe(true);
    expect(updaterStartDownloadArgs.safeParse([]).success).toBe(true);
    expect(updaterInstallNowArgs.safeParse([]).success).toBe(true);
  });

  it('reject extra args', () => {
    expect(updaterCheckForUpdatesArgs.safeParse(['x']).success).toBe(false);
  });
});
