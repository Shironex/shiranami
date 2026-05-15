import { test, expect } from './fixtures';

test.describe('window controls', () => {
  test('maximize toggles the BrowserWindow + IPC state agrees', async ({ page, electronApp }) => {
    // BrowserWindow.maximize() toggles via the renderer-facing IPC. Asserting
    // both surfaces (the IPC response AND the actual main-process state) pins
    // the contract: a future bug that updates one without the other fails here.
    const startedMaximized = await page.evaluate(async () => {
      return await window.electronAPI.window.isMaximized();
    });
    expect(startedMaximized).toBe(false);

    await page.evaluate(async () => {
      await window.electronAPI.window.maximize();
    });

    // Wait for the maximize to settle (the WM call is async at the OS level).
    await page.waitForFunction(
      async () => (await window.electronAPI.window.isMaximized()) === true,
      undefined,
      { timeout: 5_000 }
    );

    // Cross-check from the main process directly.
    const mainAgreesMaximized = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.isMaximized() ?? false;
    });
    expect(mainAgreesMaximized).toBe(true);

    // Toggle back to restore (maximize() is a toggle in this app's window.ts).
    await page.evaluate(async () => {
      await window.electronAPI.window.maximize();
    });
    await page.waitForFunction(
      async () => (await window.electronAPI.window.isMaximized()) === false,
      undefined,
      { timeout: 5_000 }
    );
  });

  test('setAlwaysOnTop reflects on the BrowserWindow', async ({ page, electronApp }) => {
    await page.evaluate(async () => {
      await window.electronAPI.window.setAlwaysOnTop(true);
    });
    const onTop = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.isAlwaysOnTop() ?? false;
    });
    expect(onTop).toBe(true);

    await page.evaluate(async () => {
      await window.electronAPI.window.setAlwaysOnTop(false);
    });
    const offTop = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.isAlwaysOnTop() ?? true;
    });
    expect(offTop).toBe(false);
  });

  test('minimize hides the window from the renderer perspective', async ({ page, electronApp }) => {
    await page.evaluate(async () => {
      await window.electronAPI.window.minimize();
    });

    // Read isMinimized from main directly; renderer doesn't expose a getter.
    await expect
      .poll(
        async () =>
          await electronApp.evaluate(async ({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows()[0];
            return win?.isMinimized() ?? false;
          }),
        { timeout: 5_000 }
      )
      .toBe(true);

    // Restore so the spec cleans up cleanly.
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.restore();
    });
  });
});
