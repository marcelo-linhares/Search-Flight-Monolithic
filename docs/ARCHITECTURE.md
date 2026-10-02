# SearchFly Architecture

SearchFly is a credit-based flight price tracker. A user creates a **watch** on a route, the system runs automated searches, Pricing detects a significant drop and Notification alerts the user. Each search run debits credits; credits are bought through a payment gateway and tracked by a ledger. When the credits run out, the user's watches are suspended automatically and reactivated as soon as the balance is restored.

The system is a **DDD monolith** (one deployable backend, 8 bounded contexts) with an **Expo React Native client**, kept in one Yarn-workspaces monorepo. This file describes the architecture **as it is today** and how to extend it. The history of the structure is in [REFACTORING_SUMMARY.md](../REFACTORING_SUMMARY.md); the Git workflow is in [GITHUB_SETUP.md](GITHUB_SETUP.md).

Last updated: October 2026.

---

## 1. System overview

```
┌──────────────────────────┐        REST + push (APNs / FCM)       ┌───────────────────────────────┐
│  apps/mobile             │ <──────────────────────────────────> │  apps/api                     │
│  Expo SDK 57, RN 0.86    │                                       │  Node.js monolith             │
│  Expo Router + Zustand   │                                       │  8 bounded contexts           │
│  client EventBus         │                                       │  in-process event bus (MVP)   │
└────────────┬─────────────┘                                       └───────────────┬───────────────┘
             │                                                                     │
             └────────────────────  packages/domain-events  ───────────────────────┘
                         shared DTOs + client-visible events (TypeScript contract)
```

| Part | Responsibility |
|------|----------------|
| `apps/api` | The monolith: domain model, use cases, event handlers. Private package `@searchfly/api`. |
| `apps/mobile` | The client. Runs against an in-memory mock server unless `EXPO_PUBLIC_API_URL` is set. Private package `@searchfly/mobile`. |
| `packages/domain-events` | The contract between server and client: DTOs and the events the UI must show. |
| `packages/ui` | Design tokens, shared components and the logomark. Declares `react`, `react-native`, `react-native-svg` as peer dependencies only. |
| `packages/config` | Shared `tsconfig.base.json` and prettier config. |
| `brand/` | Logomark SVGs. |
| `docs/` | This document, the experiment log, the Git setup notes, the architecture pages (HTML) and the wireframes. |

The visual architecture pages live next to this file: `SearchFly — Solution Architecture.html`, `SearchFly — Full-Stack Architecture.html`, `SearchFly — Frontend Architecture.html`, `SearchFly — P0 Credit Exhaustion & Reactivation Flow.html`, and the wireframes in `docs/WireFrames/`.

---

## 2. Bounded contexts

| Context | Owns | Backend today | Mobile today |
|---------|------|---------------|--------------|
| Watch Management | WatchRequest, lifecycle (`active`, `suspended_credits`, `expired`, `cancelled`) | not implemented | `modules/watch` |
| Billing | PaymentIntent, CreditPack, gateway interaction | `src/billing` | `modules/billing` |
| Ledger | CreditLedger, LedgerEntry, the credit balance | `src/billing` | `modules/ledger` |
| Scheduler | When each watch runs; pausing and resuming | not implemented | no module (schedule shown in the watch detail) |
| Search | PriceSnapshot, search execution | not implemented | `modules/search` |
| Pricing | Price-drop and anomaly detection | not implemented | `modules/pricing` |
| Notification | Alerts, channel preferences, push delivery | not implemented | `modules/notification` |
| Integration | Providers (flight data, payment gateway adapters) | not implemented | no module (admin/debug only) |

Billing and Ledger share the folder `src/billing` for now; they stay separate aggregates with their own events.

### Context map (who reacts to whom)

```
Billing ── CreditsPurchased ──────────────> Ledger ── BalanceRestored ──> Scheduler ──> Watch Management
Search  ── PriceSnapshotCaptured ─────────> Ledger ── SearchCreditDebited ──> audit log
                                            Ledger ── BalanceExhausted ───> Scheduler ──> Watch Management
Watch Management ── WatchSuspendedDueToCredits / WatchReactivated ──> Notification ──> push to the client
Search  ── PriceSnapshotCaptured ─────────> Pricing ── PriceDropDetected ──> Notification
Billing ── PaymentFailed ─────────────────> Notification
Ledger  ── GiftCreditsGranted ────────────> Notification
```

Only the Billing and Ledger part exists in `apps/api`; the rest is simulated by the mobile mock server (Profile > Demo controls).

---

## 3. Layers inside a context

```
┌────────────────────────────────────┐
│ Presentation   controllers, routes │   thin; calls use cases
├────────────────────────────────────┤
│ Application    use cases, handlers │   orchestrates; no business rules
├────────────────────────────────────┤
│ Domain         aggregates, value   │   pure logic, no I/O, no framework
│                objects, events     │
├────────────────────────────────────┤
│ Infrastructure repositories,       │   technical concerns
│                gateways, adapters  │
└────────────────────────────────────┘
```

- **Domain:** aggregates enforce invariants and record domain events (`pullDomainEvents()` hands them to the caller); value objects are immutable (frozen) and compared by value; events are frozen facts created by factories (`makeEvent`: `eventId`, `occurredAt`, `type`, payload).
- **Application:** use cases (for example `ConfirmPaymentUseCase`) load and save aggregates through repositories and publish the events the aggregate recorded. Event handlers (`OnCreditsPurchased`, `OnPriceSnapshotCaptured`, `OnCreditsRefunded`) are thin subscribers that delegate to an aggregate.
- **Infrastructure:** repositories (`findByUserId`, `save`), payment gateway adapters, the event bus implementation. Gateway vocabulary is translated here, so the domain never sees gateway language.
- **Presentation:** HTTP controllers calling use cases. Not implemented yet.

### Backend layout today

```
apps/api/src/billing/
  domain/
    aggregates.js        PaymentIntent, CreditPack, CreditLedger, LedgerEntry, PaymentStatus, LedgerStatus
    value-objects.js     PackDefinitionVO, PaymentAmountVO, GatewayResultVO, ...
    events.js            PaymentConfirmed, CreditsPurchased, PaymentFailed, CreditsRefunded,
                         SearchCreditDebited, BalanceExhausted, BalanceRestored, GiftCreditsGranted
  application/
    handlers.js          OnCreditsPurchased, OnPriceSnapshotCaptured, OnCreditsRefunded, ConfirmPaymentUseCase
apps/api/tests/unit/billing/payment-intent.test.js
```

Today each concern is one file (`aggregates.js`, `value-objects.js`, `events.js`). When a file grows, split it into a folder with one file per aggregate or value object and an `index.js` that re-exports, as in the original design.

---

## 4. Communication rules

1. **Contexts talk only through domain events.** A context never requires another context's aggregates, value objects, repositories or stores.
2. **No shared value objects between contexts.** Each context redefines what it needs in its own language (Billing's `PaymentAmountVO` mirrors Search's `MoneyVO`).
3. **Events are facts in the past tense** (`CreditsPurchased`, not `AddCredits`), immutable, and carry the identifiers subscribers need.
4. **The Ledger is the only source of the credit balance.** The UI never derives it from Billing data.
5. **Handlers are idempotent where possible** and written against an event bus interface (`publish(event)`) so the in-process bus can be replaced by a message queue later.
6. **Server-internal events stay in the monolith.** Only the events the UI must show are part of the shared contract in `packages/domain-events` (`WatchSuspendedDueToCredits`, `WatchReactivated`, `BalanceRestored`, `CreditsPurchased`, `PriceDropDetected`, `AlertReceived`).

```javascript
// OK: inside one context
const { CreditLedger } = require('../domain/aggregates');

// OK: across contexts, only by reacting to an event payload
bus.subscribe('CreditsPurchased', (event) => handler.handle(event));

// NOT OK: reaching into another context
const { PaymentIntent } = require('../../billing/domain/aggregates');   // from the search context
```

---

## 5. Client architecture (`apps/mobile`)

- **Expo Router** routes live in `app/` and are **composition points only**: they fill screen slots with components from the modules.
- **One folder per bounded context** in `src/modules/` (`watch`, `billing`, `ledger`, `notification`, `search`, `pricing`), each with its own Zustand `store.ts`, `events.ts` and components/screens. A module **never imports another module's store**.
- **Client EventBus** (`src/shared/bus`) mirrors the server's event emitter. Cross-module data flows through it; for example `WatchSuspendedDueToCredits` updates the watch store (`suspended_credits`) and the notification store.
- **API layer** (`src/shared/api`): `http.ts` for the real backend, `mock/` for the in-memory server. `USE_MOCK` is true when `EXPO_PUBLIC_API_URL` is empty.
- **Push channel** (`src/shared/push`): in mock mode the mock server pushes straight into the bus; in real mode it uses `expo-notifications`, loaded lazily and skipped inside Expo Go (Android remote push was removed from Expo Go in SDK 53).
- **Rules:** suspended watches always show the top-up call to action; the Ledger store is the only balance source; alert preferences are a separate screen, not part of the watch form; Scheduler and Integration have no mobile module.

Details and the Expo upgrade procedure are in [apps/mobile/README.md](../apps/mobile/README.md).

---

## 6. Testing strategy

Backend tests run with **Jest** (`apps/api/jest.config.js`). The configuration defines three isolated Jest "projects", selected with `--selectProjects`:

| Project | Purpose | Needs |
|---------|---------|-------|
| `unit` | Domain logic (aggregates, value objects, events) in milliseconds, written test-first (TDD). | nothing |
| `integration` | Use cases and handlers wired together with in-memory repositories and an in-process bus. | a global setup file |
| `stage` | End-to-end behavior against a running server, a database and mocked providers; longer timeout. | global setup and teardown |

Today only `tests/unit/billing/payment-intent.test.js` exists. The `integration` and `stage` projects have placeholder setup files (`tests/integration/setup.js`, `tests/stage/setup.js`, `tests/stage/teardown.js`) that do nothing yet; fill them in when the first test of that kind is written. `npm test` runs the unit and integration projects. Coverage thresholds are 80% branches and 85% functions and lines (`npm run test:coverage`). The mobile app has no automated tests yet; its checks are `yarn typecheck` and `npx expo-doctor`.

---

## 7. Build and run

```bash
yarn install                        # repo root
yarn mobile                         # Expo dev server (mock backend by default)
yarn typecheck                      # type-checks the mobile app
yarn api:test                       # backend tests
docker build -t searchfly-api apps/api
node apps/api/examples/billing-example.js              # Billing + Ledger lifecycle
node apps/api/examples/p0-credit-exhaustion-example.js  # P0 flow across contexts (fakes for the missing contexts)
```

`apps/api` keeps its own `package-lock.json` because the Docker build context is `apps/api` and the image installs with `npm install`.

---

## 8. Extending the project

### Add a bounded context (backend)

1. Create `apps/api/src/<context>/{domain,application,infrastructure,presentation}`.
2. Model aggregates and value objects in `domain`; record events in the aggregate's behavior methods.
3. Add use cases and event handlers in `application`.
4. Subscribe to other contexts' events through the event bus; never import their code.
5. Write the unit test first (`tests/unit/<context>/...`), then the code.
6. If the UI must show an event, add it to `packages/domain-events/src/events.ts` and handle it in the matching mobile module.

### Add an aggregate or a repository

1. Add the aggregate to `domain/aggregates.js` (or its own file once the file grows) and export it.
2. Define the repository contract the use cases need (`findBy...`, `save`) and implement it in `infrastructure/persistence`.
3. Keep persistence details out of the domain.

### Add a mobile module

1. Create `apps/mobile/src/modules/<context>/` with `store.ts` and `events.ts`.
2. Subscribe to the client bus in `events.ts`; export components and screens.
3. Compose them from a route in `app/`; do not import other modules' stores.

---

## 9. Known gaps

- Test coverage is about 22% to 30% (only `PaymentIntent` is tested), so `npm run test:coverage` fails its 80% / 85% thresholds until more unit tests are written.
- There is no event bus implementation, repository implementation, HTTP server or gateway adapter in `apps/api/src` yet. The examples use a small in-process bus (`examples/_event-bus.js`) in the meantime. The Dockerfile exposes port 5050 and its `CMD` is a placeholder (`npm run`) until a start script exists.
- Real push notifications need a development build; Expo Go runs the mock flow only.
