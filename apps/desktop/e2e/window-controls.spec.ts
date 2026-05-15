import { test, expect } from './fixtures';

// xvfb has no window manager so maximize/minimize get dispatched but never
// transition window state. We split those tests into IPC-only-on-Linux mode
// and full-WM-mode elsewhere so we still cover the bridge surface on every
// platform without making CI flaky for a non-shippable surface.
const HAS_WINDOW_MANAGER = process.platform !== 'linux';

test.describe('window controls', () => {
  test('maximize IPC succeeds; state transitions only assertable with a WM', async ({
    page,
    electronApp,
  }) => {
    // Always assert the IPC roundtrip cleanly returns, on every platform.
    const startedMaximized = await page.evaluate(async () => {
      return await window.electronAPI.window.isMaximized();
    });
    expect(typeof startedMaximized).toBe('boolean');

    await page.evaluate(async () => {
      await window.electronAPI.window.maximize();
    });

    if (!HAS_WINDOW_MANAGER) {
      // On xvfb the maximize call dispatched into the BrowserWindow but the
      // virtual X server has no compositor to actually transition state.
      // The IPC contract is what we own; the OS behaviour is not.
      return;
    }

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

  test('minimize IPC succeeds; state transition only assertable with a WM', async ({
    page,
    electronApp,
  }) => {
    // Always exercise the IPC end-to-end so the bridge stays covered.
    await page.evaluate(async () => {
      await window.electronAPI.window.minimize();
    });

    if (!HAS_WINDOW_MANAGER) {
      // xvfb dispatches the minimize but the OS never transitions; nothing
      // to assert on the BrowserWindow state. The IPC succeeding is the
      // contract we ship.
      return;
    }

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
