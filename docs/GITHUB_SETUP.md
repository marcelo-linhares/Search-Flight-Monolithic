# GitHub Repository — SearchFly (Monolithic Version)

**Repository:** https://github.com/marcelo-linhares/Search-Flight-Monolithic  
**Owner:** marcelo-linhares  
**Default branch:** `main`  
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
