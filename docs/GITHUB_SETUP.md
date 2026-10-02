# GitHub Repository — SearchFly (Monolithic Version)

**Repository:** https://github.com/marcelo-linhares/Search-Flight-Monolithic  
**Owner:** marcelo-linhares  
**Default branch:** `develop` (changed in October 2026; `main` is the stable branch)  
**Active experiment branch:** `context/billing-ledger`  

## Branch convention

| Branch | Purpose |
|--------|---------|
| `main` | Stable baseline |
| `develop` | Integration branch |
| `context/billing-ledger` | Billing bounded context work |
| `context/search-orchestrator` | Search orchestrator bounded context |

## Setup notes

- Remote configured via HTTPS
- Git identity: `Marcelo Linhares <mlinharesdev@gmail.com>`
- Always open terminal as **regular user** (not Administrator) to avoid `.git` ownership issues
- If push is rejected due to diverged history on a personal branch, use `git push --force-with-lease`


## Monorepo workflow (October 2026)

### History note: `context/billing-ledger` has no common ancestor with `main` / `develop`

`context/billing-ledger` started from a local `git init`, while `main`, `develop` and `context/search-orchestrator`
point at GitHub's generated "Initial commit". The two histories are unrelated, so the first integration needs
`--allow-unrelated-histories` (verified: no conflicts; `LICENSE` and `README.md` from `develop` are preserved):

```bash
git fetch origin
git checkout develop && git pull
git merge --no-ff --allow-unrelated-histories origin/context/billing-ledger -m "Merge context/billing-ledger into develop"
git push origin develop
```

After this merge the histories are related and later merges need no flag.

### Branches

| Branch | Purpose |
|--------|---------|
| `chore/monorepo-skeleton` | Yarn-workspaces layout: backend moved to `apps/api`, `packages/*`, `brand/` |
| `feat/mobile-app` | Expo React Native client in `apps/mobile` (branches off the skeleton) |

Both are short-lived and merge into `develop` through pull requests (skeleton first, then mobile).

### Layout after the skeleton

```
apps/api/        Node.js monolith (src/, tests/, examples/, Dockerfile, package.json, package-lock.json)
apps/mobile/     Expo RN client
packages/        domain-events (shared DTOs + events), ui (tokens, components, logomark), config (tsconfig, prettier)
brand/           logomark SVGs
docs/            architecture, wireframes, experiment log
```

- Backend commands now run from `apps/api` (`npm test`) or from the root (`yarn api:test`).
- Docker: build context is `apps/api` (`docker build -t searchfly-api apps/api`). `apps/api` keeps its own `package-lock.json` for that reason.
- Frontend/shared packages use Yarn workspaces from the repo root (`yarn install`, `yarn typecheck`, `yarn mobile`).

### Known issue (pre-existing)

`apps/api/jest.config.js` declares `integration` and `stage` projects whose `globalSetup` / `globalTeardown` files
(`tests/integration/setup.js`, `tests/stage/setup.js`, `tests/stage/teardown.js`) do not exist yet, so `npm test` fails Jest
config validation. The existing unit test passes when run on its own:
`npx jest --config '{"testEnvironment":"node","testMatch":["<rootDir>/tests/unit/**/*.test.js"]}'`.

### Pushing from a Claude session

The repository must be listed in the session's sources, otherwise the git proxy answers `403` and pushes are refused.

## Lessons learned (October 2026)

### Pull requests and branches

- A PR's base branch defaults to the repository's default branch. The skeleton PR (#1) was merged into `main` while the default was still `main`, which left `develop` behind. Always check the "base" box. The default branch is now `develop`.
- When `develop` is a plain ancestor of `main`, it can be fast-forwarded without a force push: `git fetch origin` then `git push origin origin/main:refs/heads/develop`. The reverse works for syncing `main` once `develop` is green: `git push origin origin/develop:refs/heads/main` (first check that `git log origin/develop..origin/main` prints nothing).
- Never force-push `main` or `develop` to repair a branching mistake; fast-forward or merge instead.
- GitHub can show a stale commit list on a PR after its base branch moved (it kept listing the skeleton commit). Toggling the base branch and back, or closing and reopening the PR, refreshes it. Git computes the actual merge itself, so the stale list is cosmetic.
- Use "Create a merge commit" (not squash) for stacked branches so each commit stays in `develop`.
- Run `git fetch origin` before reading `origin/*` in `git log`; otherwise the output is stale.
- After a PR is merged, delete its branch (GitHub button) and run `git fetch origin --prune`.

### Keeping `main` and `develop` in sync

**Rule: never open a pull request between `develop` and `main`, in either direction. Sync `main` only with a fast-forward push.**

Why: a PR always creates a merge commit. In October 2026, PRs #5 (`develop` into `main`), #6 (`main` into `develop`) and #7 (`develop` into `main`) each added a merge commit to one branch that the other did not have, so GitHub kept showing "N commits behind" even though the files were identical (`git diff origin/main origin/develop` was empty). A PR-based sync never converges; GitHub's "behind" counts commits, not content.

How to sync `main` when `develop` is stable:

```bash
git fetch origin
git log origin/develop..origin/main --oneline      # must print nothing (main has nothing develop lacks)
git push origin origin/develop:refs/heads/main     # fast-forward, no new commit, no force
```

Quick check of the relationship between the two branches: `git rev-list --left-right --count origin/main...origin/develop` prints `<only on main> <only on develop>`. `0 N` means `main` can be fast-forwarded to `develop`; `N 0` means `develop` is the one that can be fast-forwarded to `main` (`git push origin origin/main:refs/heads/develop`); `N M` with both above zero means the branches have really diverged, so stop and look at `git log` before pushing anything.

Recovery after a PR ping-pong: if the trees are identical and one branch only lacks merge commits, fast-forward it to the other as above. Do not force-push.

Day-to-day work stays the same: feature and chore branches go into `develop` through pull requests (base `develop`, "Create a merge commit"). `main` may lag behind `develop` until you want a release point.

### Windows

- Files in the working tree use CRLF. Other tools may report most files as modified; `git diff --ignore-cr-at-eol --stat` shows the real changes, and `git add <explicit paths>` avoids committing line-ending noise.
- An interrupted Git tool can leave an empty `.git/index.lock`. If Git says it cannot create `index.lock` and no Git process is running, delete that one file.
- Keep the repo outside OneDrive. Syncing `node_modules` produced locked folders ("Deletion of directory failed") and slow installs.
- Close editors and terminals that have a moved or deleted folder open before `git pull`.

### Yarn and workspaces

- The repo uses Yarn Classic 1.22 with workspaces (`apps/*`, `packages/*`). Run `yarn install` from the root. `yarn.lock` is committed.
- `npx` can resolve the wrong path for hoisted binaries in a workspace on Windows. Prefer `yarn <bin>` from the workspace folder.
- Flags take two dashes with no space (`--fix`, `--clear`).
- Shared library packages declare `react`, `react-native` and `react-native-svg` as `peerDependencies` only. Use root `resolutions` for forced single versions.
- `yarn typecheck` at the root type-checks the mobile app (`yarn workspace @searchfly/mobile tsc --noEmit`). It used to run `typecheck` in every workspace, which failed because `apps/api` has no such script.

### Expo SDK 52 to 57 (PR #3)

Upgrade steps and the breaking changes we hit are in [apps/mobile/README.md](../apps/mobile/README.md). Result: expo-doctor 21/21, `tsc` clean, app running in Expo Go SDK 57 with the mock backend.

### Claude sessions

A session can read the repository but pushes are refused (`403`, "not in this session's authorized repository set") unless the repository is selected as a source when the session starts. Committing and pushing from your own terminal is the fallback.
