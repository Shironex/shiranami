import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers/launch';

interface AppFixtures {
  launched: LaunchedApp;
  electronApp: ElectronApplication;
  page: Page;
  userDataDir: string;
}

/**
 * Single-app fixture set: spec receives a booted Electron app with the
 * renderer already at domcontentloaded. Each spec gets its own userDataDir
 * under tmp/, torn down on exit. Specs that need a restart should ignore
 * these fixtures and call launchApp() directly twice with the same dir.
 */
export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern -- playwright fixture API requires destructure
  launched: async ({}, use) => {
    const launched = await launchApp();
    await use(launched);
    await launched.close();
  },
  electronApp: async ({ launched }, use) => {
    await use(launched.app);
  },
  page: async ({ launched }, use) => {
    await use(launched.page);
  },
  userDataDir: async ({ launched }, use) => {
    await use(launched.userDataDir);
  },
});

export { expect };
