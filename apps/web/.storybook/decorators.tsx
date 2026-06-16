import type { Decorator } from '@storybook/react-vite';

/*
 * NOTE — portal-to-body components (dialogs, alert-dialogs, modals, sheets) must
 * render their Docs preview in an iframe so the `position: fixed` overlay (and an
 * open Radix dialog's scroll-lock) stays inside the preview block instead of
 * covering the whole Docs page. Set this DIRECTLY in the component's meta:
 *
 *   parameters: { docs: { story: { inline: false, iframeHeight: 620 } } }
 *
 * It must be an inline object literal, NOT a spread helper (`...fn()` / `...const`):
 * Storybook statically parses the CSF `parameters` for docs render config and can't
 * see through a spread, so `inline: false` is silently dropped (verified). Canvas
 * rendering and play-function tests run in `story` viewMode, unaffected by this.
 */

/**
 * Bounded height for the host in a Docs page vs. the standalone Canvas.
 *
 * In the Canvas view each story runs in its own iframe, so `100vh` resolves to
 * the iframe's height — a real bound the view's inner `overflow-y-auto` can
 * scroll against. On a Docs page the story renders *inline* (no iframe), so
 * `100vh` would resolve to the whole browser viewport: the inner scroll viewport
 * never gets a bounded parent and the docs preview just clips it (can't scroll).
 * Inline docs therefore get a fixed, scrollable preview height instead.
 */
const hostHeight = (viewMode: string | undefined) =>
  viewMode === 'docs' ? 'min(100vh, 600px)' : '100vh';

/**
 * Full-viewport-height flex host for `*View` stories. In the app these views
 * render inside a height-constrained `flex-1` <main>; their own root is
 * `flex-1 … overflow-hidden` with an inner `overflow-y-auto`, which only forms a
 * scroll viewport when an ancestor bounds the height. Storybook's canvas does
 * not, so the content clips and can't scroll — pair this decorator with
 * `parameters.layout: 'fullscreen'` to restore the app's height context.
 */
export const withFullHeight: Decorator = (Story, context) => (
  <div style={{ height: hostHeight(context.viewMode), display: 'flex', flexDirection: 'column' }}>
    <Story />
  </div>
);

/**
 * Opaque app-shell surface host (full-height, like `withFullHeight`, plus the
 * shell's themed surface). In the app, views render inside the shell's
 * `bg-background text-foreground` <main>; isolated in Storybook a story has no
 * such ancestor, so the app's translucent surfaces (`bg-card/40`, accent-tinted
 * pills at `oklch .../0.10`, the Tiptap editor layer) and any color-inheriting
 * text resolve against the bare canvas. axe's color-contrast resolver then walks
 * past the translucent stack to the page root, assumes `#ffffff`, and reports
 * false low-contrast failures. Restoring the opaque themed surface makes axe stop
 * at the first opaque ancestor and measure contrast as it is in-app. Theme-aware
 * via the `--background` / `--foreground` tokens (correct for dark and light).
 *
 * Inline styles, not Tailwind classes: this file lives in `.storybook/`, outside
 * the `@source '../src/**'` scan, so `bg-background`/`text-foreground` utilities
 * would never be generated for it (same reason `withFullHeight` is inline).
 */
export const withAppSurface: Decorator = (Story, context) => (
  <div
    style={{
      height: hostHeight(context.viewMode),
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--background)',
      color: 'var(--foreground)',
    }}
  >
    <Story />
  </div>
);
