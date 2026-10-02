# SearchFly Refactoring Summary

SearchFly (formerly named SmartFlight in the first version of this document) is a flight price tracker built as a **DDD monolith** with **8 bounded contexts**, plus an Expo React Native client, in one Yarn-workspaces monorepo. It is the practical part of the MBA thesis (USP/ESALQ) on DDD + GenAI in monolith refactoring.

This file records how the structure evolved and what the repository looks like **today**. For the Git/GitHub workflow see [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md); for the thesis observations see [docs/EXPERIMENT_LOG.md](docs/EXPERIMENT_LOG.md).

Last reviewed: October 2026.

---

## Current repository structure

```
apps/
  api/                         Node.js monolith (private package @searchfly/api)
    src/billing/
      domain/
        aggregates.js          PaymentIntent, CreditPack, CreditLedger, LedgerEntry (+ PaymentStatus, LedgerStatus)
        value-objects.js       PackDefinitionVO, PaymentAmountVO, GatewayResultVO, ...
        events.js              event factories (PaymentConfirmed, CreditsPurchased, BalanceExhausted, ...)
      application/
        handlers.js            OnCreditsPurchased, OnPriceSnapshotCaptured, OnCreditsRefunded, ConfirmPaymentUseCase
    tests/unit/billing/        payment-intent.test.js (TDD)
    examples/                  billing-example.js, search-example.js (see "Known gaps")
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
| Watch Management | not implemented yet | `watch` |
| Billing | `src/billing` (PaymentIntent, CreditPack) | `billing` |
| Ledger | `src/billing` (CreditLedger, LedgerEntry) | `ledger` |
| Scheduler | not implemented yet | none (no UI; schedule is shown inside the watch detail) |
| Search | not implemented yet (`examples/search-example.js` is the earlier prototype) | `search` |
| Pricing | not implemented yet | `pricing` |
| Notification | not implemented yet | `notification` |
| Integration | not implemented yet | none (admin/debug only) |

Billing and Ledger currently share the folder `src/billing`; they are separate aggregates with their own events and should be split into two modules when more contexts arrive. The mobile app mirrors the other contexts with an in-memory mock server so the full flows can be demonstrated before the backend exists.

---

## Design rules that still apply

1. **Contexts communicate only through domain events.** No importing another context's aggregates or stores. On the backend this means subscribers (`handlers.js`); on the client it means the Zustand-based EventBus in `src/shared/bus`.
2. **Contexts do not share value objects.** Each context redefines what it needs in its own language (for example `PaymentAmountVO` in Billing mirrors Search's `MoneyVO`).
3. **Layers per context:** domain (aggregates, value objects, events) -> application (use cases, event handlers) -> infrastructure (repositories, gateways, adapters) -> presentation. Only domain and application exist in `src/billing` today.
4. **Single source for balance:** the credit balance comes from Ledger only, never from Billing data.
5. **Suspended watches always offer a top-up call to action** (entry point to the Billing flow).
6. **Notification is downstream of everything.** Alert preferences live in their own screen, not in the watch form.
7. **Client-visible events are a contract.** They live in `packages/domain-events` and are shared by the monolith and the mobile app. Server-internal events (for example `BalanceExhausted`) stay inside the monolith.
8. **Messaging stays swappable.** Handlers are written against an event bus interface so the in-process bus can later be replaced by a message queue without touching the domain logic.

---

## Domain events

### Backend (`apps/api/src/billing/domain/events.js`)

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

On the backend only the Billing and Ledger part exists; the rest is simulated by the mobile mock server (Profile > Demo controls).

---

## Running things

```bash
yarn install                 # repo root
yarn mobile                  # Expo dev server, mock backend by default (see apps/mobile/README.md)
yarn typecheck               # type-checks the mobile app
yarn api:test                # backend tests (Jest: unit and integration projects)
docker build -t searchfly-api apps/api
```

---

## Known gaps

- **Coverage gate:** `apps/api/jest.config.js` requires 80% branches and 85% functions and lines, so `npm run test:coverage` fails until more tests exist. Only `PaymentIntent` is tested today (about 22% to 30% coverage). `npm test` (unit and integration projects) passes; the `integration` and `stage` projects use placeholder setup files until their first tests are written.
- **`apps/api/examples/*.js`** still require `src/contexts/...` and `src/shared/infrastructure/eventBus/...`, which belong to the original layout and no longer exist. The examples do not run until they are rewritten against `src/billing`, or until the shared event bus is recreated.
- **No event bus implementation** exists in `apps/api/src` yet; `handlers.js` expects an object with `publish(event)` and repositories with `findByUserId` / `save`.
- **Credit pack catalogue differs between backend and mock.** Backend `PackDefinitionVO`: STARTER 50 credits at BRL 9.90, EXPLORER 200 at 29.90, PROFESSIONAL 600 at 69.90. Mobile mock server: Starter 50 at R$ 9,90, Explorer 150 at R$ 24,90, Power 500 at R$ 69,90. The backend is the source of truth; the mock should be aligned.
- **Push notifications** run only in mock mode inside Expo Go; real push requires a development build (see `apps/mobile/README.md`).

---

## Next steps

1. Rewrite or remove the stale examples and add unit tests for `CreditLedger`, the value objects and the handlers (coverage is about 22% to 30%).
2. Add repositories and an in-process event bus for Billing/Ledger, then HTTP controllers (Express or Fastify) calling the use cases.
3. Implement the remaining contexts in the order the P0 flow needs them: Watch Management, Scheduler, Search, Pricing, Notification.
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

The design targeted two contexts, `BillingLedger` and `SearchOrchestrator`, under `src/contexts/` with a `src/shared/` kernel (DomainEvent, AggregateRoot, ValueObject, Entity, EventBus, Repository). That layout is not what the code on `develop` uses today: the implemented code is the flatter `src/billing/{domain,application}` shown above.

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
