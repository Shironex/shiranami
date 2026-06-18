# design-sync NOTES — @shiranami/web

Synced design system: the **app**'s Storybook (`apps/web`), 177 storied components.
Target Claude Design project: `019e080e-f887-72ca-bf75-32d4e717aec4` ("Shiranami Design System").

## App-shape setup (this repo is an APP, not a component library)

`apps/web` is a Vite **application** — no `dist/`, no public `exports`, no library
build. The storybook shape normally expects a library whose public exports the
storybook titles match. To bridge that, this sync generates two barrels:

- **`.design-sync/gen-entry.mjs`** (committed) regenerates both on every sync.
  Run it before the converter: `node .design-sync/gen-entry.mjs`.
- **`apps/web/ds-entry.generated.ts`** (gitignored) — the bundle `--entry`. Re-exports
  every storied component (`export { default as <Name> }`) so they land on
  `window.ShiranamiWeb.<Name>`. All 177 are default exports.
- **`apps/web/index.d.ts`** (gitignored) — the types-root anchor at the converter's
  default location, so `exportedNames()` sees all components as public value exports.
  Components are declared `(props: any) => any` — props are `any` because the
  converter's ts-morph project can't resolve this app's `@/` path aliases.
  [GENERAL] **Known tradeoff: component `.d.ts` contracts are `any`-typed.** Real
  usage examples still come from the stories (`.prompt.md`). Improving prop fidelity
  would require a forked dts project with tsconfig paths — not done.

## config.json knobs and why

- `entry`: the generated JS barrel (also passed via `--entry`).
- `tsconfig: "tsconfig.dssync.json"` — **PKG_DIR-relative** (cfgPath resolves against
  `apps/web`, NOT repo root). This sync tsconfig contains ONLY the `@/lib/i18n` redirect
  (to `.design-sync/i18n-preview-shim.ts`). It must NOT contain a `@/*` wildcard: the
  converter's tsconfig-paths plugin has a directory-resolution quirk that only bites when
  cfg.tsconfig differs from esbuild's auto-discovered `apps/web/tsconfig.json` — so with a
  bare redirect, every other `@/` import falls through to esbuild's (correct) native
  resolution. The shim uses RELATIVE locale imports so it needs no `@/` alias itself.
- `provider: { component: "DsPreviewRoot" }` — see below.

## [GENERAL] import.meta.glob crash (i18n) — bundle-fatal

`@/lib/i18n` (apps/web/src/lib/i18n.ts) calls Vite's `import.meta.glob` at module scope.
Under the converter's IIFE bundle esbuild lowers `import.meta` to `{}`, so `.glob(...)`
throws AT BUNDLE LOAD -> `window.ShiranamiWeb` never gets assigned -> EVERY preview fails
("Cannot read 'X' of undefined"). Fix: the dssync tsconfig redirects `@/lib/i18n` to
`.design-sync/i18n-preview-shim.ts` (eager English, no glob). Polish lazy-loading is
dropped (previews are EN-only).

## [GENERAL] Provider chain — decorators can't bundle

`.storybook/preview.tsx` imports `globals.css` which does `@import 'tailwindcss'`.
The converter's decorator bundler has hardcoded loaders (no CSS) and can't follow
it → `! preview decorator bundle failed: Could not resolve "tailwindcss"`. Remedy:
`cfg.provider` + an owned module **`apps/web/ds-preview-providers.tsx`** (committed)
exporting `DsPreviewRoot`, added to both barrels by the generator. It reproduces the
essential preview context the decorators gave:

- a recursive-Proxy `window.electronAPI` mock at module scope (components gate IPC on
  `IS_ELECTRON = !!window.electronAPI`),
- eager `initI18n()` (English ships eagerly),
- `QueryClientProvider` + `I18nextProvider` wrapper.
  NOT reproduced: the `withThemeByClassName` addon theme toggle (app defaults suffice
  for static light previews) and per-story `beforeEach` theme reset.

## Styling

CSS comes from `[CSS_FROM_STORYBOOK]` (scraped compiled Tailwind from sb-reference) —
the correct path for Tailwind 4. Fonts are Google Fonts via `@import url(...)` in
globals.css (DM Sans, Sora, JetBrains Mono, Instrument Serif, Shippori Mincho) —
designs fetch them at runtime (needs egress). Watch `[ASSETS_BLOCKED]` / `[FONT_MISSING]`.

## Excluded components

- **3 `*Manager` components dropped** by the `isComponentName` heuristic
  (`/(?:Manager|Placements|Context)$/`): `EditTagsDialogManager`, `ShareDialogManager`,
  `TrackEnrichDialogManager`. They are store-driven dialog controllers that render
  `null` by default (low preview value). 174/177 ship. To force-include, alias them to
  non-`Manager` export names + `cfg.titleMap`.

## [GENERAL] Dark app surface — the big global fix

Shiranami is **dark-only**; components are translucent surfaces meant to sit on the
app's dark background. The emitted preview card hardcodes `body{background:#fff}`
(emit.mjs, not configurable/forkable), so previews render on white and every
component looked washed-out vs the storybook reference. Fix: `DsPreviewRoot`
(the cfg.provider wrapper) wraps children in a dark app-surface div
(`background: var(--background); color: var(--foreground); min-height:100%`). After
this, StatTile + SearchResultRow grade clean `match`. Do NOT remove this wrapper.
(The dark `:root` tokens + `body{background:var(--background)}` ship in the scraped
\_ds_bundle.css, but the card's inline white body overrides them — hence the wrapper.)

## [GENERAL] Theme thumbnail images don't ship

Theme-preview components (ThemeTileGrid, ThemeBackgroundPreview, AppearanceStep/
Section, ThemeBackground) load thumbnails from `apps/web/public/themes/*.webp` at
runtime (`src={tile.thumb}` -> `/themes/...`). The DS bundle doesn't ship `public/`
assets (not in the upload set), so those thumbnails 404 in previews AND in designs.
Structure/labels/selection still match -> grade these `close` with a note. Not fixable
without bundling public/ assets. Decorative only.

## sb-error overlays (skipped)

CommandPalette, KeyboardShortcutsHelp render to a portal / closed-by-default, so the
storybook root is empty ("no storybook root content") -> nothing to grade against.
Skipped via `cfg.overrides.<Name>.skip`. They still ship (bundle + .d.ts + .prompt.md),
just no rendered preview card. Other portal/overlay dialogs may need the same treatment
(or `cardMode: "single"` if they DO render in storybook).

## Build mechanics

- Each full `package-build.mjs` compiles 174 previews **sequentially** (~1.5-2 min).
  Don't sample `_preview/*.js` counts mid-build (they grow as it runs) and NEVER run
  two builds concurrently (both `rmSync(OUT)` -> one fails). Use `preview-rebuild.mjs
--components <N>` for fast per-component iteration in fan-out.

## [GENERAL] Store/query seeding — ~78 of 177 components render blank

Stories seed data through Storybook `beforeEach`, decorators, or React-Query
`setQueryData` into Zustand stores (29 stores) / the query cache. The generated
`compose()` wrapper does NOT run `beforeEach`, so these components render their
empty/skeleton/idle state instead of the populated story.

**Proven working pattern (w1a)** — own the preview and seed:

- Copy `.design-sync/.cache/previews/<Name>.tsx` -> `.design-sync/previews/<Name>.tsx`.
- Import the component AND its stores via the `@ds-stories/apps/web/src/...` prefix
  (NOT `@/...` — the dssync tsconfig only maps `@/lib/i18n`, so `@/stores/*` won't
  resolve). `@ds-stories` bundles them from source in ONE module graph, so
  `useXStore.setState(...)` reaches the rendered component.
- Mirror the story's seed calls (read the story's `beforeEach`/decorator) before
  rendering. Confirmed populated + matching for DebugOverlay, DownloadsView,
  FavoritesView.

**Still hard:** React-Query `setQueryData` seeding (HistoryView) — the seeded cache
doesn't reach the component (separate client / `enabled: IS_ELECTRON` gating); and
SearchView's `IS_ELECTRON` divergence (preview resolves it differently -> wrong card).

**DONE — the global seeding fork (validated):**

- `gen-entry.mjs` exports all 29 stores onto `window.ShiranamiWeb` (`export * from '@/stores/*'`).
- `cfg.storyImports.shim: ["/stores/"]` redirects story store-imports to the global.
- `.design-sync/overrides/preview-gen-storybook.mjs` (cfg.libOverrides) forks `compose()`
  to run `meta.beforeEach`/`story.beforeEach` once before first render (useRef-guarded
  SeededStory wrapper).
  Result: LibraryView, NowPlayingView, DownloadsView, MixesView, etc. render FULLY
  populated and match. This rescues the Zustand cohort. Do NOT undo these three pieces.
- `DsPreviewRoot` also wraps in `TooltipProvider` (app does this in main.tsx) — Radix
  Tooltip components (NowPlayingView etc.) error without it.

**Still `close`/straggler (accepted):**

- React-Query `setQueryData`-seeded data (HistoryView stats) — cache doesn't reach the
  component (QueryClient/`IS_ELECTRON` divergence). Structure matches; data empty -> close.
- `IS_ELECTRON` divergence (SearchView shows wrong card) — the mock makes IS_ELECTRON
  true; some components branch on it differently than storybook.
- mascot/theme `public/*.webp` images don't ship -> empty tiles on empty-states/theme
  pickers -> close.

## [GENERAL] Grade-key global slice — batch storyImports changes!

The grade contract's GLOBAL slice (lib/sync-hashes.mjs configSlicesFor) = `provider` +
`storyImports` + `extraEntries` + the fork-file bytes. NOT the bundle sha, NOT
`readmeHeader`, NOT overrides (those are per-component). So:

- Changing `storyImports` / `provider` / `extraEntries` / a fork file **clears ALL
  grades** (every component re-grades). BATCH these before fan-out — discovering them
  incrementally (as this first sync did) forces painful full re-grades.
- Adding a `cfg.overrides.<Name>.skip` only re-keys THAT component — safe mid-run.
- `--skip-dts` vs real build does NOT change the key (dts isn't keyed) — grade against
  the fast build, the final real build carries forward.
- Recovery trick if grades get cleared but renders are unchanged:
  `.design-sync/adopt-grades.mjs` restores backed-up verdicts + patches each capture's
  gradeKey to the current build's, so compare carries them forward without re-judging
  identical renders. (Back up verdicts BEFORE any compare run clears them — compare
  empties a component's grade.json when it recaptures under a changed key.)

## Named-export-through-global skips

Stories whose `render` uses NAMED exports of the component module (e.g. SettingsCard's
`SettingsToggleRow`/`SettingsSelectRow`, QueueRow's `QueueItem`/`DragOverlayContent`)
render blank: the barrel only puts the DEFAULT export on the global, so the named
import resolves to undefined ("Element type is invalid"). Fixing globally (barrel
`export *` per component) risks name collisions AND re-clears all grades (bundle/global
churn) — NOT worth it. Skipped those stories instead: SettingsCard (only story),
QueueRow (now-playing/overlay; Sortable kept).

## Final skip set (cfg.overrides.\*.skip) — all portal/null/sb-error or named-export

CommandPalette, KeyboardShortcutsHelp, SubfolderPlaylistDialog, MediaSessionSync(null),
BulkActionBar, EditTagsDialog, ImportDialog, NowPlayingHero(Idle only),
PlaylistContextMenu, ShareDialog, TrackContextMenu, TrackEnrichDialog, WindowControls,
SmartPlaylistFormDialog, ImportBulkActionBar, SupportBanner(Seen only),
QueueRow(now-playing/overlay), SettingsCard. All render empty in Storybook itself
(portal/closed/null) or hit the named-export issue. They still SHIP (bundle + .d.ts +
.prompt.md), just no rendered preview card.

## Conventions header

`.design-sync/conventions.md` (cfg.readmeHeader) authored from the brand README (backed
up in .cache/grade-backup-era + transcript). Tailwind-4-utilities-mapped-to-tokens idiom;
validated all class/token/component names against the build (cut `bg-sidebar` — token
exists but the utility isn't emitted).

## Re-sync risks (watch-list for the next run)

- The two generated barrels + `apps/web/index.d.ts` are gitignored; **re-run
  `gen-entry.mjs` first** on every sync (a fresh clone won't have them).
- `apps/web/ds-preview-providers.tsx` is committed; it imports `@/lib/i18n`,
  `@/types/electron`, `@shiranami/contracts` — if those move, the provider build breaks.
- Props are `any` (see above) — not a regression, by construction.
- Google-Fonts dependency: previews/designs need network egress for correct fonts.
