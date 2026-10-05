# Experiment: what do bounded contexts buy us, and what do they cost?

This document is the protocol and the results of the refactoring experiment that supports the thesis *Refactoring Monoliths with DDD and GenAI*. Everything here can be reproduced from the repository. It also says plainly what the code can and cannot prove.

## 1. Questions and hypotheses

| ID | Hypothesis | How it is checked |
|----|-----------|-------------------|
| H1 | **Locality.** With contexts split inside the monolith, a business-rule change touches only code that belongs to that context. | Replay the same change requests (CR) on a pre-split baseline and on the split code; compare the change footprint. |
| H2 | **Cheap extraction.** Because contexts only talk through events, one of them can become a separate process without editing the others. | Extract the Ledger; count the files changed outside it; run the P0 flow across two real HTTP servers. |
| H3 | **Cost of the boundary.** Moving a boundary from a function call to a network call breaks assumptions that were invisible in-process. | Catalogue every behaviour that changed (the "leaks") and prove each one with a test. |
| H4 | GenAI helps to find the boundaries. | **Not tested by this code.** Future work / discussed qualitatively in the thesis. |

## 2. Design is frozen before the measurements

1. **Dependency rule as a test** (`tests/unit/architecture/dependency-rule.test.js`): a context may require only itself and `src/shared`; composition roots (`app.js`, `services/*.js`) may use only a context's public entry; `http` and `shared` never require context internals. A fixture test shows that the checker fails when a violation exists, so a green result means something.
2. **Metrics scripts**: `scripts/change-footprint.js` (per change), `scripts/context-metrics.js` (per context). Run with `yarn api:footprint ...`.

Current state (`docs/experiments/context-metrics.json`): five contexts with code (billing, ledger, scheduler, search, watch) plus the integration adapter; **0 imports between contexts**.

## 3. Experiment A: replaying change requests (H1)

Three change requests were applied twice: once on the **baseline** (the code before the Billing/Ledger split, where `billing/domain` still held ledger classes and value objects) and once on the **split** code.

| CR | Rule |
|----|------|
| CR1 | A search debit is idempotent per price snapshot (`referenceId = snapshotId`; a repeated snapshot does not charge twice). |
| CR2 | A refund cannot exceed the available balance. |
| CR3 | `GatewayResultVO` accepts only the statuses `succeeded`, `failed` and `pending`. |

CR1+CR2 target the Ledger, CR3 targets Billing. For each change, the footprint is measured on the target context.

| World | Change | Files (src + test) | Lines +/- | Foreign-concept lines inside the touched source files |
|-------|--------|-------------------|-----------|---------------------------------|
| Baseline | CR1+CR2 (Ledger) | 2 (1+1) | +44 / -1 | 110 of 317 (PaymentIntent, CreditPack) |
| Split | CR1+CR2 (Ledger) | 2 (1+1) | +44 / -1 | 0 of 195 |
| Baseline | CR3 (Billing) | 2 (1+1) | +20 / 0 | 35 of 139 (EntryTypeVO, CreditBalanceVO) |
| Split | CR3 (Billing) | 2 (1+1) | +17 / 0 | 0 of 94 |

Raw data: `docs/experiments/replay-results.json`.

**Reading.** The *size* of the change did not shrink: the same number of files and almost the same number of lines were touched. What changed is **cohesion**: in the baseline, whoever edits the file must read around concepts of another context (35 to 110 lines of foreign concepts); in the split code, the touched file contains only its own context. H1 is therefore supported **in its weak form** (the change is isolated and the reader's context is smaller), not in the strong form (fewer edits).

**Honest limits.** (a) Three change requests, written by the author, on a small system. (b) The foreign-concept metric partly follows from how the split was done, so it is close to tautological; its value is to make the difference visible, not to prove it. (c) Nothing here measures team productivity, onboarding time or defects; claims about those need a different kind of evidence.

## 4. Experiment B: extracting the Ledger (H2)

The Ledger runs as its own process (`src/services/ledger-service.js`, `yarn api:ledger`) with its own bus and repository. The monolith talks to it by:

* **events** over a `RemoteEventBridge` (`src/shared/remote-event-bridge.js`): outbox in memory, retry with backoff, dead-letter, de-duplication by `eventId`, shared token. Forwarded to the Ledger: `UserRegistered`, `CreditsPurchased`, `RefundRequested`, `PriceSnapshotCaptured`. Coming back: `BalanceExhausted`, `BalanceRestored`, `RefundAccepted`, `RefundRejected`.
* **queries** over HTTP (`src/ledger/client.js`), with the same `execute` shape as the local queries.

**Cost of the extraction (files changed outside the Ledger):**

| Kind | Files |
|------|-------|
| Edited in existing code | `src/app.js` (option `ledgerUrl`, ~25 lines), `src/http/create-http-app.js` (1 line, mounts `/internal`), `src/shared/errors.js` (new `ServiceUnavailableError`), `src/server.js` (2 env variables) |
| New | `src/shared/remote-event-bridge.js`, `src/ledger/client.js`, `src/services/ledger-service.js` |
| Inside Billing, Watch, Scheduler, Search | **0 files** |
| Inside the Ledger domain/application | **0 files** |

H2 is supported: the contexts that consume and produce Ledger events were not touched. The cost is concentrated in the infrastructure that did not exist before (the bridge).

A real two-process run (`node src/services/ledger-service.js` and `node src/server.js` with `LEDGER_URL`) registers a user and reads a balance of 10 through the Ledger service. The automated version is `tests/integration/ledger-extraction.flow.test.js` (12 tests on two real HTTP servers).

## 5. Experiment C: the leaks (H3)

Each row is a behaviour that was true in-process and is no longer true across the network. All are covered by tests in `ledger-extraction.flow.test.js` or `remote-event-bridge.test.js`.

| # | In-process assumption | Across the network | Mitigation in code | What is still open |
|---|----------------------|--------------------|--------------------|--------------------|
| 1 | After `publish()` returns, every handler already ran. | Consumers react later. Reading the balance right after registering returns 404 until the event arrives. | Bridge delivers asynchronously; test shows the 404 then the 200. | The client must tolerate "not yet" (retry, optimistic UI). |
| 2 | `RefundPaymentUseCase` returns the final status. | It returns `REFUND_REQUESTED`; `REFUNDED` or a revert to `CONFIRMED` arrives later. | Two-step refund with `RefundAccepted`/`RefundRejected`. | API contract changes to "accepted for processing". |
| 3 | Events are delivered exactly once. | At-least-once: the same event can arrive twice. | De-duplication by `eventId` in the receiver and `referenceId = snapshotId` in the Ledger (a duplicate charges once). | The processed-id set is in memory; it must be persistent. |
| 4 | The consumer is always up. | When the Ledger is down, events retry and may be dead-lettered. Searches keep running and are **not charged** while it is down. | Retry with backoff, dead-letter list, 401 without token. | An overdraft window exists while the Ledger is unreachable; dead-letters need a replay job. |
| 5 | Saving and publishing happen in the same process. | A crash between the DB write and the enqueue loses the event. | None (the outbox here is in memory). | A transactional outbox in the database is required for production. |
| 6 | Queries are function calls and cannot fail by themselves. | The balance query can return **503** when the Ledger is unreachable. | `ServiceUnavailableError` mapped to HTTP 503. | Caching or degraded reads. |

**Reading.** The Ledger domain code did not change, but its *consumers* needed to learn about time, duplicates and failure. This is the real price of the boundary: it is not paid in code size at the extraction moment, it is paid in behaviour. It is also an argument for staying a monolith until a reason to extract appears (scale, team ownership, regulatory isolation).

## 6. What this evidence supports

| Claim | Strength | Source |
|-------|----------|--------|
| Contexts are decoupled in this code base (0 cross-context imports, enforced by a test). | Strong | architecture test, `context-metrics.json` |
| Rule changes stay inside one context and the touched file has only its own concepts. | Moderate (3 CRs, one author) | Experiment A |
| A context can be extracted with no change to the other contexts. | Moderate (one extraction) | Experiment B |
| Extraction changes consistency, duplicates and failure behaviour. | Strong for this case | Experiment C tests |
| Developers perceive the structure as helpful. | Perception only (survey, n = 23) | survey, not this repository |
| Teams are more productive / onboard faster / ship fewer bugs. | **Not provable here** | would need a team study |

## 7. Reproducing

```powershell
yarn api:coverage                                   # full suite
yarn api:footprint <repo> <baseRef> <headRef> <ledger|billing>
yarn api:ledger                    # Ledger as its own process
node apps/api/scripts/context-metrics.js
```

Environment of the two-process mode: Ledger service `MONOLITH_URL`, `INTERNAL_TOKEN`, `LEDGER_PORT` (default 5051), `GIFT_CREDITS`; monolith `LEDGER_URL`, `INTERNAL_TOKEN`.

The replay is reproducible without the experiment branches: `docs/experiments/replay/` holds the commits as patches. Baseline = commit `0bb757b` (before the Billing/Ledger split, PR #11) plus `replay/baseline/*.patch`; split = commit `94f0eff` (PR #13) plus `replay/split/*.patch`. Apply with `git switch -c tmp <commit>` then `git am <patches>`, and measure each patch with `yarn api:footprint . <patch-commit>~1 <patch-commit> <ledger|billing>`.

![Ledger extraction](experiments/ledger-extraction.svg)

## 8. Not done (and why)

* Swapping the in-memory Ledger repository for SQLite behind the same interface with a shared contract test: dropped because of the deadline. It is the natural next experiment for the "persistence can change without touching the domain" claim.
* A transactional outbox and persistent de-duplication (leaks 3 and 5).
* Any measurement with GenAI (H4).
