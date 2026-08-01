import type { AppApi } from '@shiranami/contracts';
import { commands } from '../commands';

export const appApi: AppApi = {
  getVersion: () => commands.appGetVersion(),
  // `app:open-logs-folder` resolves `null` where v1 resolved `undefined`; both
  // satisfy `Promise<void>` and no caller reads the value.
  openLogsFolder: async () => {
    await commands.appOpenLogsFolder();
  },
  getLocaleCountry: () => commands.appGetLocaleCountry(),
};
