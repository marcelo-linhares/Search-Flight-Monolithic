# Search-Flight-Monolithic

SearchFly — DDD flight price tracker. A Node.js monolith (8 bounded contexts) plus an Expo React Native client, in one Yarn-workspaces monorepo. Part of the MBA thesis (USP/ESALQ) on DDD + GenAI in monolith refactoring.

```
apps/
  api/      Node.js monolith (src/billing, src/ledger, src/shared, tests, examples, Dockerfile)
  mobile/   Expo RN client (feat/mobile-app)
packages/
  domain-events/   shared DTOs + event contract (server <-> client)
  ui/              design tokens + shared React Native components + logomark
  config/          tsconfig base, prettier config
brand/             logomark SVGs
docs/              architecture, wireframes, experiment log
```

## Backend

```bash
cd apps/api && npm install       # apps/api keeps its own package-lock.json (Docker build context)
npm test
docker build -t searchfly-api apps/api
```

## Requirements

- Node.js 20.19.4 or newer (required by Expo SDK 56+)
- Yarn Classic 1.22 (`npm install -g yarn`, then open a new terminal). Do not use `npm install` at the repo root; `apps/api` is the only package with its own npm lockfile.
- Expo Go matching the SDK of the app (currently **SDK 57**), or an Android emulator / iOS simulator, or the web build (`w` in the Expo terminal)
- Keep the clone outside OneDrive/Dropbox: syncing `node_modules` causes file locks and slow installs

## Workspaces

```bash
yarn install       # from the repo root
yarn typecheck
yarn mobile        # Expo dev server (mock backend by default) — see apps/mobile/README.md
```

## Branches

`develop` is the default and integration branch · `main` is the stable branch (fast-forwarded from `develop` when it is green) · `context/<bounded-context>` per-context work · `feat/*`, `chore/*` short-lived, merged into `develop` through pull requests (base branch `develop`, "Create a merge commit"). More in [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `yarn` is not recognized | `npm install -g yarn`, then open a new terminal |
| `npx expo ...` fails with `node_modules\node_modules\expo` (Windows, workspaces) | Use `yarn expo ...` from `apps/mobile`, or `node ..\..\node_modules\expo\bin\cli ...` |
| expo-doctor reports duplicate `react` / `react-native` | Library packages (`packages/ui`) declare them only as `peerDependencies`; delete every `node_modules` and run `yarn install` from the root |
| Stale bundle or odd errors after changing config | `yarn mobile --clear` |
| Many files show as modified on Windows | Line endings (CRLF). Stage explicit paths, or check `git diff --ignore-cr-at-eol --stat` |

See [apps/mobile/README.md](apps/mobile/README.md) for Expo-specific notes and [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md) for the Git/GitHub workflow and lessons learned.
