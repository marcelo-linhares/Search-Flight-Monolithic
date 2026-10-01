# apps/mobile

Expo (React Native, managed workflow) client for SearchFly — Expo Router, one Zustand store per bounded-context module, and a client-side EventBus that mirrors the server EventEmitter.

```bash
yarn install          # from the repo root
yarn mobile           # expo start — Expo Go (scan QR) or press i / a
```

Runs against an in-memory **mock server** by default. Set `EXPO_PUBLIC_API_URL` (see `.env.example`) to use the real monolith.

## Flows
- **Happy path:** login, empty watch list, create watch, watch detail (price history), price-drop alert
- **P0 credit exhaustion:** low-credits banner, `WatchSuspendedDueToCredits` (paused card + top-up CTA), alert inbox, buy credits, payment confirmation, `BalanceRestored`, `WatchReactivated`

Trigger the server-side events from **Profile -> Demo controls** (mock mode only).

## Rules
1. `src/modules/*` never import another module's `store.ts`; cross-module data flows through `src/shared/bus` or the API.
2. Routes in `app/` are composition points: they fill screen slots with components from other modules.
3. Credit balance comes only from the Ledger store.
4. Suspended watches always render the top-up CTA.
5. Scheduler and Integration have no mobile module.
