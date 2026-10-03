# SearchFly Refactoring Summary

SearchFly (formerly named SmartFlight in the first version of this document) is a flight price tracker built as a **DDD monolith** with **8 bounded contexts**, plus an Expo React Native client, in one Yarn-workspaces monorepo. It is the practical part of the MBA thesis (USP/ESALQ) on DDD + GenAI in monolith refactoring.

This file records how the structure evolved and what the repository looks like **today**. For the Git/GitHub workflow see [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md); for the thesis observations see [docs/EXPERIMENT_LOG.md](docs/EXPERIMENT_LOG.md).

Last reviewed: October 2026.

---

## Current repository structure

```
apps/
  api/                         Node.js monolith (private package @searchfly/api)
    src/
      app.js                   composition root (event bus, contexts, flight provider, clock)
      server.js                HTTP listener + scheduler timer
      shared/                  domain-event.js, in-process-event-bus.js, errors.js (technical kernel)
      billing/                 domain (PaymentIntent, CreditPack), application/use-cases.js, infrastructure (in-memory repo), index.js
      ledger/                  domain (CreditLedger, LedgerEntry), application (handlers, queries), infrastructure (in-memory repo), index.js
      watch/                   WatchRequest, use cases, handlers, in-memory repo + credit-status projection, index.js
      scheduler/               ScheduledSearch, RunDueSearchesUseCase, handlers, in-memory repo, index.js
      search/                  SearchJob, PriceSnapshot, OnSearchJobTriggered, GetPriceHistory, FlightPort contract, index.js
      integration/             fake-flight-provider.js (deterministic fake; real providers later)
      http/                    Express 5 app: create-http-app.js, middleware.js, routes/
    tests/unit/                billing/, ledger/, watch/, scheduler/, search/, integration/, shared/ (TDD)
    tests/integration/         billing-ledger.flow, search-orchestrator.flow (P0 with fake clock), http-api (supertest), server
    examples/                  billing-example.js, p0-credit-exhaustion-example.js (runnable demos)
    Dockerfile, jest.config.js, package.json, package-lock.json
  mobile/                      Expo SDK 57 client (private package @searchfly/mobile)
    app/                       Expo Router routes: composition points only
    src/modules/               one folder per bounded context: watch, billing, ledger, notification, search, pricing
    src/shared/                bus (client EventBus), api (http + in-memory mock server), push, auth, format, profile
packages/
  domain-events/               shared DTOs + client-visible domain events (TypeScript)
  ui/                          design tokens, shared components, logomark (peer deps on react / react-native)
  config/                      tsconfig base, prettier config
brand/                         logomark SVGs
docs/                          ARCHITECTURE.md, EXPERIMENT_LOG.md, GITHUB_SETUP.md, architecture and wireframe pages
```

Tooling: Yarn Classic workspaces from the repo root (`yarn install`, `yarn mobile`, `yarn typecheck`, `yarn api:test`). `apps/api` keeps its own `package-lock.json` because the Docker build context is `apps/api`.

---

## The 8 bounded contexts

| Context | Backend (`apps/api`) | Mobile (`apps/mobile/src/modules`) |
|---------|----------------------|-------------------------------------|
| Watch Management | `src/watch` (WatchRequest, use cases, handlers) | `watch` |
| Billing | `src/billing` (PaymentIntent, CreditPack, use cases) | `billing` |
| Ledger | `src/ledger` (CreditLedger, LedgerEntry, handlers, queries) | `ledger` |
| Scheduler | `src/scheduler` (ScheduledSearch, run-due-searches) | none (no UI; schedule is shown inside the watch detail) |
| Search | `src/search` (SearchJob, PriceSnapshot, price history, FlightPort) | `search` |
| Pricing | not implemented yet | `pricing` |
| Notification | not implemented yet | `notification` |
| Integration | `src/integration` (fake flight provider) | none (admin/debug only) |

Each backend context has its own folders, events and value objects and talks to the others only through events on the in-process bus (wired in `src/app.js`). The mobile app mirrors all contexts with an in-memory mock server so the full flows can be demonstrated before the backend exists.

---

## Design rules that still apply

1. **Contexts communicate only through domain events.** No importing another context's aggregates or stores. On the backend this means subscribers (`src/ledger/application/handlers.js`); on the client it means the Zustand-based EventBus in `src/shared/bus`.
2. **Contexts do not share value objects.** Each context redefines what it needs in its own language (for example `PaymentAmountVO` in Billing mirrors Search's `MoneyVO`).
3. **Layers per context:** domain (aggregates, value objects, events) -> application (use cases, event handlers) -> infrastructure (repositories, gateways, adapters) -> presentation. Billing and Ledger have all three (infrastructure is in-memory repositories); presentation (HTTP) does not exist yet.
4. **Single source for balance:** the credit balance comes from Ledger only, never from Billing data.
5. **Suspended watches always offer a top-up call to action** (entry point to the Billing flow).
6. **Notification is downstream of everything.** Alert preferences live in their own screen, not in the watch form.
7. **Client-visible events are a contract.** They live in `packages/domain-events` and are shared by the monolith and the mobile app. Server-internal events (for example `BalanceExhausted`) stay inside the monolith.
8. **Messaging stays swappable.** Handlers are written against an event bus interface so the in-process bus can later be replaced by a message queue without touching the domain logic.

---

## Domain events

### Backend (`apps/api/src/billing/domain/events.js` and `apps/api/src/ledger/domain/events.js`)

| Event | Emitted by | Reaction |
|-------|------------|----------|
| `PaymentConfirmed` | PaymentIntent | Ledger |
| `CreditsPurchased` | PaymentIntent | Ledger credits the balance (`OnCreditsPurchased`) |
| `PaymentFailed` | PaymentIntent | Notification |
| `CreditsRefunded` | PaymentIntent | Ledger debits the refunded credits (`OnCreditsRefunded`) |
| `SearchCreditDebited` | CreditLedger | Audit log |
| `BalanceExhausted` | CreditLedger | Scheduler pauses the user's watches |
| `BalanceRestored` | CreditLedger (only when the ledger was exhausted) | Scheduler resumes the user's watches |
| `GiftCreditsGranted` | CreditLedger | Notification (welcome message) |

### Client-visible (`packages/domain-events`)

`WatchSuspendedDueToCredits`, `WatchReactivated`, `BalanceRestored`, `CreditsPurchased`, `PriceDropDetected`, `AlertReceived`, delivered through the push channel as a `PushPayload`.

### P0 flow: credit exhaustion and reactivation

```
Search: PriceSnapshotCaptured
  -> Ledger (OnPriceSnapshotCaptured): debitForSearch -> SearchCreditDebited
  -> balance reaches 0 -> BalanceExhausted
  -> Scheduler pauses watches -> Watch: suspended_credits -> WatchSuspendedDueToCredits
  -> Notification: push to the device (client EventBus -> notification store -> watch store)

User buys a pack:
  Billing: PaymentIntent.confirm -> PaymentConfirmed, CreditsPurchased
  -> Ledger (OnCreditsPurchased): creditFromPurchase -> BalanceRestored (only if the ledger was SUSPENDED)
  -> Scheduler resumes watches -> WatchReactivated
```

On the backend, Pricing and Notification are the only contexts missing; they are still simulated by the mobile mock server (Profile > Demo controls). Event flow change: Ledger balance events now go to Watch Management, and the Scheduler follows the watch events (Ledger → Watch Management → Scheduler).

---

## Running things

```bash
yarn install                 # repo root
yarn mobile                  # Expo dev server, mock backend by default (see apps/mobile/README.md)
yarn typecheck               # type-checks the mobile app
yarn api:test                # backend tests (Jest: unit and integration projects)
yarn api:coverage            # same, with coverage thresholds
yarn api:start               # REST API on port 5050 (ENABLE_DEV_ROUTES=true adds POST /api/dev/scheduler/tick)
docker build -t searchfly-api apps/api
node apps/api/examples/billing-example.js              # Billing + Ledger lifecycle
node apps/api/examples/p0-credit-exhaustion-example.js  # P0 flow across the real contexts (fake flight provider)
```

---

## Known gaps

- **No persistence yet:** repositories are in memory. Auth is temporary (`x-user-id` header, no Identity context) and the payment webhook does not verify the gateway signature. Pricing and Notification are not implemented. Open domain questions are kept as `it.todo` in the tests (for example `NaN` accepted by `PaymentAmountVO`, a `pending` webhook marking a payment as failed, refunds larger than the balance being clamped to zero, debits not idempotent).
- **Push notifications** run only in mock mode inside Expo Go; real push requires a development build (see `apps/mobile/README.md`).

---

## Next steps

1. Decide the open domain questions listed in the `it.todo` items and turn them into tests.
2. Add database repositories behind the same `findBy...` / `save` methods, a real Identity context (auth) and webhook signature verification.
3. Implement the remaining contexts: Pricing, then Notification.
4. Point the mobile app to the real API with `EXPO_PUBLIC_API_URL` and keep `packages/domain-events` as the contract (add contract tests).
5. Replace the in-process event bus with a message queue only when a context is actually extracted from the monolith.

---

## History

### May 7, 2026: first refactoring (project then called SmartFlight)

The flat code base was reorganized into bounded contexts with a layered structure and shared base classes, as a monolith:

| Before | After |
|--------|-------|
| All files in one folder | Separated by context and layer |
| Mixed concerns | Clear separation of concerns |
| No infrastructure abstraction | Abstract repository and event bus |
| Shared value objects | Each context owns its domain |

The design targeted two contexts, `BillingLedger` and `SearchOrchestrator`, under `src/contexts/` with a `src/shared/` kernel (DomainEvent, AggregateRoot, ValueObject, Entity, EventBus, Repository). That layout is not what the code on `develop` uses today: the implemented code is the flatter `src/{billing,ledger}/{domain,application,infrastructure}` shown above.

### August to September 2026: thesis experiment

Observations from working with the AI-generated code (single files mixing domain concepts, handlers inside the billing context, TDD, Event Storming) are in [docs/EXPERIMENT_LOG.md](docs/EXPERIMENT_LOG.md).

### October 2026: monorepo restructuring

The backend moved into `apps/api` with `git mv` (history preserved), and `apps/mobile`, `packages/*` and `brand/` were added (PRs #1 to #3; Expo SDK upgraded from 52 to 57).

| Before | After |
|--------|-------|
| `src/` | `apps/api/src/` |
| `tests/` | `apps/api/tests/` |
| `examples/` | `apps/api/examples/` |
| `package.json`, `package-lock.json`, `jest.config.js`, `Dockerfile` | `apps/api/` (same names) |
| - | `apps/mobile/`, `packages/{domain-events,ui,config}/`, `brand/` |

### October 2026: Jest configuration

The `integration` and `stage` Jest projects pointed to setup files that did not exist, so every Jest run failed configuration validation. Placeholder `tests/integration/setup.js`, `tests/stage/setup.js` and `tests/stage/teardown.js` were added and the `coverageThreshold` option name was corrected. `npm test` now passes.

### October 2026: examples and pack catalogue

The examples still required the original `src/contexts/...` layout, so they were rewritten against `src/billing`: `billing-example.js` (gift credits, purchase, failed payment, refund) and `p0-credit-exhaustion-example.js` (credit exhaustion and reactivation across contexts, with fake Search, Scheduler and Notification), both using `examples/_event-bus.js`. The old `search-example.js` was removed because the Search context it demonstrated is not in the repository. The mobile mock server now uses the backend credit pack catalogue (STARTER 50 credits at R$ 9,90, EXPLORER 200 at R$ 29,90, PROFESSIONAL 600 at R$ 69,90, same ids), so a pack id sent to the real API will match.

### October 2026: unit tests, Ledger split and application layer

Unit tests were added for `CreditLedger`, the value objects, the handlers and `PaymentIntent` (see `tests/unit`). The Ledger was then moved out of `src/billing` into its own context `src/ledger` (own aggregates, value objects, events, handlers and queries), the shared technical code went to `src/shared` (`makeEvent`, `InProcessEventBus`), and both contexts got use cases or queries, in-memory repositories and a public `index.js`. `src/app.js` is the composition root and `tests/integration/billing-ledger.flow.test.js` exercises the full flow. Ledger purchases and refunds became idempotent (one entry per payment). `examples/_event-bus.js` was removed in favor of `src/shared/in-process-event-bus.js`; the examples now use `createApp()`.

### October 2026: search-orchestrator and REST API

Watch Management, Scheduler, Search and Integration (a deterministic fake flight provider behind the `FlightPort` contract) were added test-first, plus an Express 5 REST API (`src/http`) and `src/server.js` (HTTP listener plus a scheduler timer). Errors share one hierarchy in `src/shared/errors.js` (`DomainError` subclasses with `httpStatus` and `code`); Billing and Ledger errors were moved onto it. The event flow became Ledger → Watch Management → Scheduler, `jobId` is the idempotency key between Scheduler and Search, and the P0 flow has an integration test with a fake clock and a rewritten example that uses the real contexts. The `Dockerfile` now starts the server (`npm start`). Coverage is about 98% of statements.
