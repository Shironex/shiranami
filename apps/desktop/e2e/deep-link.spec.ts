import { test, expect } from './fixtures';

test.describe('share deep-link', () => {
  test('renderer receives the import code via window.electronAPI.share.onDeepLink', async ({
    page,
    electronApp,
  }) => {
    // Subscribe on the renderer side and stash the received code on window
    // so the spec can wait for it without leaning on a global eventer.
    await page.evaluate(() => {
      const w = window as unknown as { __e2eReceivedCode?: string | null };
      w.__e2eReceivedCode = null;
      window.electronAPI.share.onDeepLink(code => {
        w.__e2eReceivedCode = code;
      });
    });

    // From main, emit the same webContents.send call the deep-link
    // handler uses (apps/desktop/src/main/index.ts: mainWindow.webContents.send
    // ('share:deep-link', code)). This mirrors what happens when a user clicks
    // a `shiranami://import/<code>` link in the OS.
    const SAMPLE_CODE = 'abc123-test-share';
    await electronApp.evaluate(async ({ BrowserWindow }, codeArg) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send('share:deep-link', codeArg);
    }, SAMPLE_CODE);

    await expect
      .poll(
        async () => {
          return await page.evaluate(() => {
            const w = window as unknown as { __e2eReceivedCode?: string | null };
            return w.__e2eReceivedCode;
          });
        },
        { timeout: 5_000 }
      )
      .toBe(SAMPLE_CODE);
  });

  test('onDeepLink returns an unsubscribe function that stops delivery', async ({
    page,
    electronApp,
  }) => {
    await page.evaluate(() => {
      const w = window as unknown as { __e2eDeliveryCount?: number };
      w.__e2eDeliveryCount = 0;
      const unsub = window.electronAPI.share.onDeepLink(() => {
        w.__e2eDeliveryCount = (w.__e2eDeliveryCount ?? 0) + 1;
      });
      // Stash the unsub for the next page.evaluate to call.
      (window as unknown as { __e2eUnsubDeepLink?: () => void }).__e2eUnsubDeepLink = unsub;
    });

    // First emission lands → counter goes to 1.
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('share:deep-link', 'first');
    });

    await expect
      .poll(
        async () =>
          await page.evaluate(
            () => (window as unknown as { __e2eDeliveryCount?: number }).__e2eDeliveryCount
          ),
        { timeout: 5_000 }
      )
      .toBe(1);

    // Unsubscribe.
    await page.evaluate(() => {
      const w = window as unknown as { __e2eUnsubDeepLink?: () => void };
      w.__e2eUnsubDeepLink?.();
    });

    // Second emission should be ignored — counter stays at 1.
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('share:deep-link', 'second');
    });

    // Give the IPC a tick to deliver if it were going to.
    await page.waitForTimeout(500);

    const finalCount = await page.evaluate(
      () => (window as unknown as { __e2eDeliveryCount?: number }).__e2eDeliveryCount
    );
    expect(finalCount).toBe(1);
  });
});
