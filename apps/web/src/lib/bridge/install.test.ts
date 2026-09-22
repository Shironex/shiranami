/**
 * The shim must be invisible everywhere `window.electronAPI` already has an
 * arrangement — and this suite is running inside one of them.
 *
 * `src/test/setup.ts` installs a literal mock and 264 assertions across 21 files
 * depend on it. Storybook installs a Proxy *after* `platform.ts` has evaluated,
 * so `IS_ELECTRON` is false there while the global is live, and eight stories
 * assert against that hybrid by name. Browser dev at :15175 has nothing at all
 * and every query hook returns its empty value through an `IS_ELECTRON` guard.
 * A shim that installed unconditionally would break all three.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { installElectronApiBridge } from './install';
import { detectPlatform, isE2eHarness, isTauri } from './environment';

const TAURI_GLOBAL = '__TAURI_INTERNALS__';

/** Put the surrounding suite's own `window.electronAPI` back. */
const original = Object.getOwnPropertyDescriptor(window, 'electronAPI');

afterEach(() => {
  Reflect.deleteProperty(window, TAURI_GLOBAL);
  if (original) Object.defineProperty(window, 'electronAPI', original);
});

describe('installElectronApiBridge', () => {
  it('installs nothing outside the Tauri webview', () => {
    const before = window.electronAPI;

    expect(installElectronApiBridge()).toBe(false);
    expect(window.electronAPI).toBe(before);
  });

  it('leaves this suite’s own mock intact — the shim never replaced it', () => {
    // Guards the arrangement the other 1547 tests run under: if the module-level
    // install in `install.ts` had fired on import, the mock would be gone and
    // every `vi.mocked(window.electronAPI.…)` in the suite would be a different
    // object than the one under test.
    expect(window.electronAPI).toBeDefined();
    expect(isTauri()).toBe(false);
  });

  it('installs the full surface when the webview is present', () => {
    Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });

    expect(installElectronApiBridge()).toBe(true);
    expect(typeof window.electronAPI.db.tracks.getAll).toBe('function');
    expect(typeof window.electronAPI.media.onCommand).toBe('function');
    expect(typeof window.electronAPI.errors.isIpcError).toBe('function');
  });

  it('installs a non-writable global, so nothing can swap the transport', () => {
    Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });
    installElectronApiBridge();

    const installed = window.electronAPI;
    expect(Object.getOwnPropertyDescriptor(window, 'electronAPI')?.writable).toBe(false);
    expect(window.electronAPI).toBe(installed);
  });
});

describe('environment', () => {
  it('detects Tauri by the global the webview injects before page scripts', () => {
    expect(isTauri()).toBe(false);

    Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });
    expect(isTauri()).toBe(true);
  });

  it('reports a platform string from v1’s vocabulary', () => {
    // jsdom's agent is neither Windows nor macOS, so this exercises the
    // fallback: v1's two comparisons treated every non-darwin, non-win32 value
    // as Linux, and so does this.
    expect(['darwin', 'win32', 'linux']).toContain(detectPlatform());
  });

  it('reports __e2e false until the harness sets its global', () => {
    expect(isE2eHarness()).toBe(false);

    Object.defineProperty(window, '__SHIRANAMI_E2E__', { value: true, configurable: true });
    expect(isE2eHarness()).toBe(true);
    Reflect.deleteProperty(window, '__SHIRANAMI_E2E__');
  });
});
