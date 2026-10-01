# Search-Flight-Monolithic

SearchFly — DDD flight price tracker. A Node.js monolith (8 bounded contexts) plus an Expo React Native client, in one Yarn-workspaces monorepo. Part of the MBA thesis (USP/ESALQ) on DDD + GenAI in monolith refactoring.

```
apps/
  api/      Node.js monolith (src/billing, tests, examples, Dockerfile)
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

## Workspaces

```bash
yarn install       # from the repo root
yarn typecheck
```

## Branches

`main` stable · `develop` integration · `context/<bounded-context>` per-context work · `feat/*`, `chore/*` short-lived, merged into `develop`.
