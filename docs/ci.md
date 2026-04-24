# CI & DX Guide

How CI is wired and what to do when something fails.

## Workflows

| File                                         | Trigger               | Purpose                                                 |
| -------------------------------------------- | --------------------- | ------------------------------------------------------- |
| `.github/workflows/ci.yml`                   | push / PR to `master` | Lint, typecheck, test, landing build                    |
| `.github/workflows/release.yml`              | release published     | Package macOS + Windows builds, upload to release       |
| `.github/workflows/pr-title-lint.yml`        | PR open / edit / sync | Enforce conventional-commit PR titles                   |
| `.github/workflows/labeler.yml`              | PR open / sync        | Apply path-based labels (`area:*`, `dependencies`, ...) |
| `.github/workflows/mirror-issue-labels.yml`  | PR open / edit        | Copy labels from linked issues onto the PR              |
| `.github/workflows/dependabot-automerge.yml` | Dependabot PR         | Auto-approve and `--auto` squash-merge patch updates    |

`ci.yml` aggregates lint / typecheck / test / landing through a final `ci-result` job that fails if any required job failed or was cancelled. Skipped jobs (when paths-filter excludes them) do not fail the gate.

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

## Linked issues and labels

Reference issues from PR bodies with `Closes #N`, `Fixes #N`, or `Resolves #N`. The `mirror-issue-labels` workflow copies the issue's `P0`–`P3`, `area:*`, `type:*`, and a whitelist of common labels (`security`, `performance`, `i18n`, `dx`, `refactor`, `chore`, `bug`, `enhancement`) onto the PR. The `labeler` workflow adds path-based area labels on top.

## Action pinning

Third-party actions are pinned to commit SHAs with a trailing `# vX.Y.Z` comment (Dependabot manages updates). First-party `actions/*` actions stay on major tags.

## Out of scope (today)

- **Code signing / notarization.** Builds are unsigned. End users see Gatekeeper / SmartScreen warnings; the workaround is documented in the README.
- **Mobile CI.** `apps/mobile` does not run lint or typecheck in CI yet — pending a React 19 upgrade on web.
