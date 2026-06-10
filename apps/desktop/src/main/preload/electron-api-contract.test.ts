import { describe, it, expect } from 'vitest';
import type { ElectronAPI as PreloadAPI } from './index';
import type { ElectronAPI as RendererAPI } from '../../../../web/src/types/electron';

/**
 * Compile-time guard that the renderer's hand-maintained IPC surface
 * (`apps/web/src/types/electron.d.ts`) stays in lock-step with the preload's
 * `ElectronAPI` — the type the contextBridge actually exposes. The desktop
 * package is the only place that can see BOTH types, so the assertion lives
 * here. If a handler return type or a method signature drifts on one side
 * without the other, `_RendererMatchesPreload` stops resolving and the
 * dedicated `typecheck:contract` tsc run (wired into `pnpm typecheck`) fails.
 *
 * The assertion is purely type-level; the runtime body is a trivial smoke test
 * so the file is still a valid vitest module.
 */
type AssertAssignable<Expected, Actual extends Expected> = Actual;

// The renderer surface must be assignable to the preload surface: every method
// the renderer believes it can call must exist on the preload with a compatible
// signature/return type. This is the direction that catches d.ts decay — a
// renderer method drifting from what the handler actually returns stops
// resolving here. The reverse is intentionally NOT asserted: the renderer keeps
// a few members deliberately looser than the preload (e.g. `store.get` is a
// generic `<T>(key: string)` because the renderer does not import the desktop
// `StoreSchema`), which is a one-way widening, not a contract break.
export type _RendererMatchesPreload = AssertAssignable<PreloadAPI, RendererAPI>;

describe('electron API contract', () => {
  it('renderer and preload ElectronAPI types stay assignable (enforced at typecheck)', () => {
    expect(true).toBe(true);
  });
});
