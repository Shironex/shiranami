# Storybook Testing Adoption — interaction tests, a11y, autodocs

Research-only plan to bring shiranami's Storybook (`apps/web`) up to the ShiroAni
gold standard: every story runs as a real-browser test (render smoke + `play`
interactions + axe a11y) via `@storybook/addon-vitest`, plus global autodocs.

Reference repo: ShiroAni (`/Users/shirone/Documents/Projects/shiroani`). Both
repos run Storybook **10.4.x**, `@storybook/react-vite`, Vitest **4.1.7**, Vite
**8**, React **19.2**. ShiroAni's infra commit is `6ecba61d`.

---

## (a) ShiroAni infra recipe — copy-pasteable reference

### Packages added (ShiroAni `apps/web/package.json`, commit `6ecba61d`)

devDependencies (versions pinned `^10.4.5` for SB; shiranami should use `^10.4.4`
to match its existing SB pin, or bump all SB deps in lockstep):

```
@storybook/addon-a11y        ^10.4.5
@storybook/addon-vitest      ^10.4.5
@vitest/browser              ^4.1.7
@vitest/browser-playwright   4.1.7      # exact pin in ShiroAni (no caret)
playwright                   ^1.60.0
```

Already present in both repos (no add needed for shiranami): `@storybook/addon-themes`,
`@storybook/react-vite`, `storybook`, `@vitejs/plugin-react`, `@vitest/coverage-v8`,
`vitest`, `playwright` (shiranami has `playwright ^1.60.0` + `vitest ^4.1.7` at ROOT;
`@vitest/coverage-v8 ^4.1.7` at root).

### Scripts (ShiroAni split the single `test` into project-scoped scripts)

```jsonc
"test":            "vitest run --project=unit",
"test:watch":      "vitest --project=unit",
"test:cov":        "vitest run --project=unit --coverage",
"test:storybook":  "vitest run --project=storybook"
```

> shiranami's web project is named **`web`** (not `unit`) — keep `web` and add
> `"test:storybook": "vitest run --project=storybook"`.

### `.storybook/main.ts` — one line

```ts
addons: ['@storybook/addon-themes', '@storybook/addon-a11y', '@storybook/addon-vitest'],
```

### `.storybook/preview.tsx` — autodocs tag + a11y param

```ts
const preview: Preview = {
  // Generate a Docs page for every component from its args/argTypes + JSDoc.
  tags: ['autodocs'],
  // ...existing globals/decorators...
  parameters: {
    // ...existing controls...
    // axe runs inside the Vitest-addon story tests. 'todo' = violations are
    // non-blocking warnings (suite stays green repo-wide while we ratchet
    // feature-by-feature); audited features set parameters.a11y.test = 'error'.
    a11y: { test: 'todo' },
  },
};
```

ShiroAni also added a "dormant socket singleton" to preview (its view hooks call
`getSocket()` on mount). shiranami's equivalent already exists: preview mocks
`window.electronAPI` via a recursive Proxy (preview.tsx lines 30-74) and seeds a
fresh `QueryClient` per render — that mock works in browser mode too (it only
touches `window`), so NO socket-style addition is needed.

### `apps/web/vitest.config.ts` — TWO Vitest 4 projects

ShiroAni converted its single-config file into a `projects: [...]` array (its
root has no central vitest workspace; shiranami DOES — see gap section). The
`storybook` project:

```ts
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
// ...
{
  plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
  // storybookTest does NOT merge vite.config.ts resolve.alias the way
  // `storybook build` does — '@/…' / '@shiranami/*' must be redeclared here
  // or preview.tsx + stories fail to resolve in browser mode.
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      '@shiranami/contracts': path.resolve(dirname, '../../packages/contracts/src/index.ts'),
      '@shiranami/shared':   path.resolve(dirname, '../../packages/shared/src/index.ts'),
      // plus shiranami's sentry-replay stubs (vite.config.ts lines 55-57)
    },
  },
  // pnpm virtual store is at monorepo root; addon's injected setup file must be
  // within fs.allow or browser mode can't fetch it.
  server: { fs: { allow: [path.resolve(dirname, '../..')] } },
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    // @storybook/addon-vitest auto-applies preview annotations (decorators +
    // a11y config) since Storybook 10.3 — NO setup file needed.
  },
}
```

### CI (`.github/workflows/ci.yml`) — new `test-storybook` job

```yaml
test-storybook:
  needs: [changes]
  if: needs.changes.outputs.web == 'true'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - uses: ./.github/actions/setup
    - run: pnpm build:packages
    - run: pnpm --filter @shiranami/web exec playwright install chromium --with-deps
    - run: pnpm --filter @shiranami/web test:storybook
```

…then add `test-storybook` to the `ci-result` aggregate `needs`.

### Story file SHAPE (strengthen commits `55a3fda6`, `fce9a7ba`, …)

- `import { within, userEvent, expect, waitFor } from 'storybook/test';`
  **NOT** `@storybook/test`. (SB 10 consolidated `@storybook/test` → bare
  `storybook/test`. 93/93 ShiroAni stories use the bare path; zero use the old
  one.)
- JSDoc block above `meta` (feeds autodocs Description).
- `parameters.a11y.test: 'error'` at meta level once the component passes axe.
- Store seeding via `beforeEach` (meta-level for the default, story-level to
  override): `beforeEach: () => { useSomeStore.setState({...}); }` — NOT inline
  decorators (cleaner for the test run; decorators still fine for layout).
- `play: async ({ canvasElement }) => { const canvas = within(canvasElement); ... }`
  — assert roles/names with `expect(canvas.getByRole(...))`, drive interactions
  with `userEvent`, await async store effects with `waitFor`.
- Each named story gets a JSDoc one-liner (autodocs story description).
- NO `composeStories` anywhere — stories ARE the tests via addon-vitest.

Example (ShiroAni `NameStep.stories.tsx`, leaf w/ input):

```ts
export const TypesAName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole('textbox', { name: 'Your name' });
    await userEvent.type(field, 'Mochi');
    await waitFor(() => expect(field).toHaveValue('Mochi'));
    await expect(useSettingsStore.getState().displayName).toBe('Mochi');
  },
};
```

### Colocated `*.test.tsx` — stays jsdom

The strengthen commits ALSO grow the existing jsdom `*.test.tsx` (Testing
Library + `@/test/test-utils`). Division of labour: `play` = browser-real
interaction + a11y; `.test.tsx` = mock-heavy logic (spies on store actions,
mocked data hooks, edge cases hard to set up in-browser). They coexist; neither
replaces the other.

### Decorator patterns (commits `56e25b20`, `9d20261e`)

- `withTooltip` → hoisted into preview.decorators (Radix `TooltipProvider`).
  shiranami applies `TooltipProvider` per-story today — hoisting it removes the
  boilerplate. shiranami ALSO has a per-render `QueryClientProvider` (already in
  preview) — keep that.
- `withFullHeight` (`.storybook/decorators.tsx`) for `*View` stories that need a
  `100vh` flex host + `parameters.layout: 'fullscreen'`.

### a11y bug class surfaced (commit `e954f685`)

Turning axe to `'error'` surfaced a real bug: Radix `Slider` put
`aria-label`/`aria-labelledby` on the Root, but `role="slider"` is on the Thumb
→ axe `aria-input-field-name`. Fix forwarded the naming props to the Thumb.
**shiranami has its own sliders** (`VolumeControl`, `SeekBar`,
`VerticalBandSlider`, EQ band sliders) — expect the same class of finding.

### Story exclusion escape hatch (commit `6ecba61d`)

`tags: ['!test']` on a meta excludes that story from the browser run while
keeping it in the Storybook UI + autodocs. ShiroAni used it for `LibraryView`
(ResizeObserver loop hangs headless Chromium). shiranami's heavy/animated
components (visualizers driving rAF, virtualized lists) are likely `!test`
candidates initially.

---

## (b) Docs-verified canonical SB 10.4 setup + deltas from ShiroAni

Sources: Storybook docs — Vitest addon, Accessibility testing, Autodocs.

1. **Test addon package name** — `@storybook/addon-vitest`, plugin import
   `@storybook/addon-vitest/vitest-plugin`. (SB 8 was
   `@storybook/experimental-addon-test`; consolidated in 9/10.) ✅ ShiroAni matches.

2. **Browser provider** — docs show `provider: playwright({})`, `headless: true`,
   `instances: [{ browser: 'chromium' }]`, devdeps `@vitest/browser-playwright`
   - `playwright`. ✅ ShiroAni matches.

3. **⚠ SETUP FILE — the one real divergence.** The official Vitest-addon docs
   example STILL lists `setupFiles: ['./.storybook/vitest.setup.ts']` (the file
   that calls `setProjectAnnotations([previewAnnotations])`). ShiroAni OMITS it,
   relying on addon-vitest **auto-applying preview annotations since SB 10.3**.
   Community confirms 10.3+ auto-applies in the standard (non-portable-stories)
   path. ShiroAni's leaner no-setup-file config is CI-green on 10.4.5.
   → **Recommendation for shiranami:** start WITHOUT the setup file (match
   ShiroAni). If decorators/a11y params don't apply in the browser run, fall
   back to adding `.storybook/vitest.setup.ts`:

   ```ts
   import { beforeAll } from 'vitest';
   import { setProjectAnnotations } from '@storybook/react-vite';
   import * as preview from './preview';
   const project = setProjectAnnotations([preview.default]);
   beforeAll(project.beforeAll);
   ```

   and `setupFiles: ['./.storybook/vitest.setup.ts']` on the storybook project.

4. **a11y addon** — `@storybook/addon-a11y`. Config is `parameters.a11y.test`:
   `'off'` (don't run) / `'todo'` (run, violations = non-blocking warnings) /
   `'error'` (violations FAIL the Vitest story test). Set globally in preview,
   override per-meta/story. ✅ ShiroAni matches (global `'todo'`, ratchet to
   `'error'`).

5. **Autodocs** — `tags: ['autodocs']` in preview (global) or per-meta. The
   `docs` block in main.ts is NOT how you enable autodocs (only controls
   `defaultName`/`docsMode`); `docs: { autodocs: true }` is the deprecated SB7
   form — do NOT use it. ✅ ShiroAni matches (preview `tags: ['autodocs']`, no
   main.ts docs block). Opt a component OUT with `tags: ['!autodocs']`.

**Net:** ShiroAni's recipe is correct for SB 10.4 with ONE caveat — the omitted
`vitest.setup.ts` (works via 10.3+ auto-apply; have the fallback ready).

---

## (c) shiranami current-state gap analysis

Current files: `apps/web/.storybook/main.ts`, `apps/web/.storybook/preview.tsx`,
`apps/web/vitest.config.ts`, root `vitest.config.ts`, `apps/web/package.json`.

| Area            | shiranami today                                                   | ShiroAni target                        | Gap                           |
| --------------- | ----------------------------------------------------------------- | -------------------------------------- | ----------------------------- |
| addons          | `['@storybook/addon-themes']`                                     | + a11y + vitest                        | add 2 addons                  |
| stories assert  | render-only (no `play`)                                           | `play` + a11y per story                | 139 story files to strengthen |
| a11y            | none                                                              | global `'todo'`, per-feature `'error'` | add param + ratchet           |
| autodocs        | none                                                              | preview `tags:['autodocs']`            | add tag                       |
| vitest projects | single `web` project; root `vitest.config.ts` lists project FILES | `unit`+`storybook` projects            | add `storybook` project       |
| deps            | no addon-vitest/a11y/browser                                      | full set                               | add 5 devdeps                 |
| scripts         | `--project web`                                                   | + `test:storybook`                     | add 1 script                  |
| CI              | no storybook job                                                  | dedicated job + Chromium install       | add job                       |
| Tooltip         | per-story `TooltipProvider`                                       | hoisted in preview                     | optional hoist                |
| QueryClient     | already in preview (per-render)                                   | n/a                                    | ✅ keep                       |
| electronAPI     | recursive Proxy mock in preview                                   | ShiroAni uses socket singleton         | ✅ already covered            |

**shiranami-specific gotchas (differ from ShiroAni):**

1. **Root vitest config integration.** shiranami's root `vitest.config.ts` uses
   `test.projects: ['apps/web/vitest.config.ts', ...other apps...]` (string file
   paths). ShiroAni had NO central workspace. shiranami's web config must expose
   BOTH the `web` (rename keep) and `storybook` projects. Easiest: make
   `apps/web/vitest.config.ts` itself a `projects: [...]` array (web + storybook)
   like ShiroAni — but then the ROOT config referencing the file inherits BOTH
   projects, so `pnpm test` at root would try to run the browser project too.
   → **Decision needed:** either (a) keep the storybook project OUT of the root
   aggregate (define it in a separate `apps/web/vitest.storybook.config.ts` and
   only run it via `test:storybook`), or (b) accept that root `vitest run` also
   runs the browser project (needs Chromium locally). ShiroAni's no-root-workspace
   setup sidesteps this; shiranami must choose. **Recommend (a)** — a separate
   storybook config keeps the existing root `pnpm test` jsdom-only and CI fast.

2. **Alias parity.** web `vitest.config.ts` currently aliases only `@` and
   `@shiranami/shared`. The storybook project ALSO needs `@shiranami/contracts`
   AND the three `@sentry-internal/*` replay stubs (vite.config.ts lines 47,
   55-57), or preview.tsx (imports `@shiranami/contracts`) + Sentry-touching
   components fail to resolve in browser mode.

3. **`satisfies` vs annotation.** 132/139 shiranami stories already use the
   required `const meta: Meta<typeof X> = {…}` annotation (TS2742 convention from
   memory); 7 use `satisfies`. New/edited stories MUST use the annotation form.
   (ShiroAni uses `satisfies` — do NOT copy that; it's the documented shiranami
   gotcha.)

4. **Store seeding style.** shiranami stories seed stores via INLINE per-story
   `decorators` (e.g. `VolumeControl.stories.tsx` `seedVolume` in a decorator;
   `OverviewView.stories.tsx` `seededClient`). ShiroAni uses `beforeEach`.
   Prefer migrating seeding to `beforeEach` as stories are strengthened (runs
   per test, no decorator nesting), but inline decorators still work.

5. **Heavy components.** shiranami has ~14 rAF-driven visualizers + virtualized
   lists. Expect `tags: ['!test']` exclusions (like ShiroAni's LibraryView) and
   IntersectionObserver/ResizeObserver issues — note jsdom mocks these in
   `src/test/setup.ts`, but the BROWSER run has real observers, so some stories
   that "passed" in jsdom may loop/hang headless. Triage per feature.

---

## (d) Phased adoption plan for shiranami

New branch: `feat/storybook-testing` (multi-commit refactor → never on master).
Small conventional commits mirroring ShiroAni's cadence.

### Phase 0 — Infra (one commit)

`test(web): add Storybook component testing, a11y, and autodocs infra`

- package.json: add 5 devdeps + `test:storybook` script (keep `--project web`).
- main.ts: add a11y + vitest addons.
- preview.tsx: `tags: ['autodocs']` + `parameters.a11y.test: 'todo'`; optionally
  hoist `TooltipProvider` decorator.
- vitest: add the `storybook` browser project (separate
  `vitest.storybook.config.ts` per gap #1, with full alias parity per gap #2 +
  `server.fs.allow` root).
- CI: add `test-storybook` job + wire into `ci-result`.
- Sanity: exclude obviously-hanging stories up front with `tags: ['!test']`
  (visualizers, virtualized lists) — un-exclude as each feature is strengthened.
- VERIFY the whole suite is green at `'todo'` before moving on.

### Phase 1..N — Per-feature strengthen (one commit per feature folder)

`test(web): strengthen <feature> tests + a11y + interaction stories`
Suggested order (smallest/leafiest first, matching ShiroAni onboarding→shared):

1. `settings/*` leaf panels (DownloadLocationPanel etc. — already arg-driven)
2. `overview/*` (ClockCard, WeatherRow, TopAlbums, ListeningClock, then OverviewView)
3. `lyrics/*`
4. `player/*` controls (VolumeControl, SeekBar, PlayerControls, TimeDisplay,
   VolumeControl) — EXPECT the Slider/`aria-input-field-name` bug here → a
   `fix(web): forward Slider accessible name…` commit like `e954f685`.
5. `player/*` visualizers LAST (likely stay `!test`; strengthen `.test.tsx` +
   autodocs only).
   Per feature: add `play` + JSDoc + ratchet `a11y.test:'error'`; grow `.test.tsx`;
   remove that feature's `!test` tags where the browser run is now clean.

### Phase N+1 — a11y ratchet sweep / cleanup

Flip remaining green features to `'error'`; document any permanent `!test`.

### Verification gauntlet (run before every commit)

```
pnpm --filter @shiranami/web typecheck
pnpm --filter @shiranami/web test                 # jsdom unit (project web)
pnpm --filter @shiranami/web exec playwright install chromium   # once
pnpm --filter @shiranami/web test:storybook       # browser: render+play+a11y
pnpm --filter @shiranami/web build-storybook      # autodocs build sanity
pnpm lint
```
