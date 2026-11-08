# CI & DX Guide

How CI is wired and what to do when something fails.

## Workflows

| File                                         | Trigger               | Purpose                                                 |
| -------------------------------------------- | --------------------- | ------------------------------------------------------- |
| `.github/workflows/ci.yml`                   | push / PR to `master` | Lint, typecheck, test, mock mode, landing build         |
| `.github/workflows/rust-checks.yml`          | push / PR, Rust paths | fmt, clippy, `cargo test`, drift guard, analyser canary |
| `.github/workflows/visual-windows.yml`       | dispatch / label      | WebView2 CDP visual check on Windows (opt-in)           |
| `.github/workflows/release.yml`              | release published     | Package macOS + Windows builds, upload to release       |
| `.github/workflows/pr-title-lint.yml`        | PR open / edit / sync | Enforce conventional-commit PR titles                   |
| `.github/workflows/labeler.yml`              | PR open / sync        | Apply path-based labels (`area:*`, `dependencies`, ...) |
| `.github/workflows/mirror-issue-labels.yml`  | PR open / edit        | Copy labels from linked issues onto the PR              |
| `.github/workflows/dependabot-automerge.yml` | Dependabot PR         | Auto-approve and `--auto` squash-merge patch updates    |

`ci.yml` aggregates lint / typecheck / test / mobile / landing through a final `ci-result` job that fails if any required job failed or was cancelled. Skipped jobs (when paths-filter excludes them) do not fail the gate.

## Mobile

`apps/mobile` (Expo SDK 56) is a workspace package. The root `pnpm lint` and `pnpm format:check` cover it; the `Mobile` job runs its own typecheck and Jest suite (`jest-expo`) when `apps/mobile/**` or a root config file changes. Locally: `pnpm --filter @shiranami/mobile typecheck` and `pnpm --filter @shiranami/mobile test`.

React Native pins React to the exact version its renderer was built with (19.2.3 for SDK 56), while `apps/web` and `apps/landing` run a newer React. The root `pnpm-workspace.yaml` keeps the two apart with a parent-scoped override (`'@shiranami/mobile>react'`), and `apps/mobile/metro.config.js` resolves every `react` import from the app itself, so Metro never picks up the web copy from pnpm's hidden hoist folder.

## Releasing mobile

Builds and over the air updates run on EAS (project `shirone-dev/shiranami`), not in GitHub Actions. Run every command from `apps/mobile`; `pnpm eas` is the pinned `eas-cli`, and `requireCommit` in `eas.json` wants a clean tree.

**Build or update?** An update (EAS Update) replaces only the JavaScript bundle and assets of an installed build. Anything native needs a new build: a new or bumped native package, a config plugin, `android.permissions`, `expo-build-properties`, the local `modules/audio-noisy` module, an Expo SDK bump.

The runtime version is the project fingerprint (`runtimeVersion: { policy: "fingerprint" }`), so this is checked for you: an update only reaches builds with the same fingerprint. `pnpm fingerprint` prints the current one; compare its `runtimeVersion` with the one on the build page in the EAS dashboard. If they differ, the change needs a build. `fingerprint.config.js` keeps the hash the same on the Mac, Windows and the EAS Linux builders (it drops pnpm's per-OS store folder names and the `scripts` block), and `.gitattributes` checks the app out with LF endings everywhere. pnpm patches to native packages are not hashed by content; build after adding one.

| Profile       | Channel      | Output          | Gets updates            |
| ------------- | ------------ | --------------- | ----------------------- |
| `development` | none         | dev client APK  | no, loads JS from Metro |
| `preview`     | `preview`    | APK (internal)  | yes                     |
| `production`  | `production` | AAB (Play)      | yes                     |

```sh
# New build (native change, or the first build with expo-updates)
pnpm eas build --profile preview --platform android

# JavaScript only: publish to the preview channel
pnpm eas update --channel preview --environment preview --message "fix queue order"

# Promote a tested preview update to production
pnpm eas update:republish --channel preview --destination-channel production --message "fix queue order"

# Undo: pick an earlier update or the bundle embedded in the build
pnpm eas update:rollback
```

`--environment` is required and must match the profile, otherwise the update is bundled with other `EXPO_PUBLIC_*` values than the build. Installed apps check for an update on launch without waiting (`fallbackToCacheTimeout: 0`), download it in the background and run it on the next launch: close and reopen the app twice. Settings > About shows the running channel and update id, and has a manual check with a restart button (hidden in dev builds).

Free plan limits (monthly): 15 Android builds with low queue priority and a 45 minute timeout; 1,000 update monthly active users as a hard cap, 100 GiB update bandwidth, 20 GiB storage. Builds run out first. Code signing for updates needs a paid plan and is not used.

## Required checks

Branch protection requires the individual jobs to pass — not just `ci-result`. When adding a new required job, run it on a few PRs first to confirm it stays green; only then add it to branch protection. New jobs introduced in this PR are intentionally **not** required yet.

## Centralized versions

- Node version lives in `.nvmrc` at the repo root (currently `22`). `nvm`, `fnm`, and Volta will auto-switch.
- pnpm version lives in `packageManager` in `package.json` (currently `pnpm@10.9.0`). `pnpm/action-setup` reads it automatically.
- Both are consumed by `.github/actions/setup` — the composite action used by every CI job.

## Conventional commits

The repo uses [Conventional Commits](https://www.conventionalcommits.org/). Both commit messages and PR titles must conform.

- Commit messages are validated locally by `.husky/commit-msg` running `commitlint`.
- PR titles are validated by `pr-title-lint.yml` (squash-merge uses the PR title as the merged commit subject).
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Subjects must start lowercase. Headers can be up to 100 characters.

Example PR title: `feat(player): persist queue across restarts`.

## Local checks

Husky is wired through `prepare: husky` so hooks install on `pnpm install`.

| Hook                | What runs                                                         |
| ------------------- | ----------------------------------------------------------------- |
| `.husky/pre-commit` | `pnpm exec lint-staged` (eslint --fix + prettier on staged files) |
| `.husky/commit-msg` | `pnpm exec commitlint --edit "$1"`                                |

To run the full CI suite locally before pushing:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

To skip hooks for an emergency commit (rare): `git commit --no-verify`. Don't make a habit of it.

## Dependabot

Daily updates for `npm` and `github-actions` ecosystems. Updates are grouped:

- `github-actions`: all actions in one PR per day
- `npm`: `@types/*`, dev dependencies, and production dependencies in three separate groups
- Electron major bumps are ignored — bump manually because they coordinate with native module rebuilds

`dependabot-automerge.yml` auto-approves and enables `--auto` squash-merge for `version-update:semver-patch` updates only. Minor and major updates are reviewed manually. Auto-merge still requires CI to pass before the merge happens.

**Required repo setting:** the auto-approve step runs `gh pr review --approve` as `github-actions[bot]`, which needs **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests** to be enabled. Without it, auto-approve silently fails and `--auto` will never complete because branch protection blocks on the missing approval.

## Linked issues and labels

Reference issues from PR bodies with `Closes #N`, `Fixes #N`, or `Resolves #N`. The `mirror-issue-labels` workflow copies the issue's `P0`–`P3`, `area:*`, `type:*`, and a whitelist of common labels (`security`, `performance`, `i18n`, `dx`, `refactor`, `chore`, `bug`, `enhancement`) onto the PR. The `labeler` workflow adds path-based area labels on top.

## Action pinning

Third-party actions are pinned to commit SHAs with a trailing `# vX.Y.Z` comment (Dependabot manages updates). First-party `actions/*` actions stay on major tags.

## Out of scope (today)

- **Code signing / notarization.** Builds are unsigned. End users see Gatekeeper / SmartScreen warnings; the workaround is documented in the README.
