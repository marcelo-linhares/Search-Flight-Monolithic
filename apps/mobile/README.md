# apps/mobile

Expo (React Native, managed workflow, **SDK 57**: React 19.2, React Native 0.86) client for SearchFly — Expo Router, one Zustand store per bounded-context module, and a client-side EventBus that mirrors the server EventEmitter.

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

## Running it

- **Phone:** install Expo Go (SDK 57), run `yarn mobile`, scan the QR code. Phone and PC must be on the same Wi-Fi.
- **Web:** press `w` in the Expo terminal (fastest way to check the UI).
- **Android emulator:** start the emulator first (Android Studio, Device Manager), wait for the home screen, then press `a`. If Expo says `could not connect to TCP port 5554`, the emulator was not running yet; if it still fails, restart adb: `adb kill-server`, `adb start-server`, `adb devices`.
- After changing config files (`babel.config.js`, `app.json`) restart with `yarn mobile --clear`.

## Expo Go limits

Android remote push notifications were removed from Expo Go in SDK 53, and importing `expo-notifications` there throws at load time. `src/shared/push/index.ts` therefore loads the module lazily (`require`) and skips it when `Constants.executionEnvironment` is `StoreClient` (Expo Go). In mock mode the mock server pushes straight into the client bus, so the demo flows do not need real push. Real push needs a development build.

## Upgrading the Expo SDK

Do it on its own branch and PR (`chore/expo-sdk-NN`). From `apps/mobile`, on Windows prefer `yarn expo` over `npx expo`:

```bash
yarn expo install expo@^NN.0.0
yarn expo install --fix        # aligns every Expo/React Native package to the SDK (flag has no space: --fix)
npx expo-doctor@latest         # goal: all checks pass
yarn tsc --noEmit              # fix type errors
```

Rules we learned:

- Never pass stray words to `expo install`: `-- fix` (with a space) made Yarn install an unrelated npm package named `fix`.
- `packages/ui` must not pin `react`, `react-native` or `react-native-svg` (peer dependencies only), otherwise a second copy is installed and expo-doctor fails.
- Use `resolutions` in the root `package.json` to collapse a duplicate that comes from two ranges (we pin `react-native-screens`).
- Read the SDK changelog for every SDK you skip. 52 to 57 included: New Architecture is the only mode (remove `newArchEnabled` from `app.json`), `expo-router` no longer depends on `react-navigation`, `expo-notifications` requires `shouldShowBanner` / `shouldShowList`, tab icon `color` is typed `ColorValue`, `@expo/vector-icons` is no longer bundled with `expo`.
- Delete every `node_modules` and reinstall from the root when expo-doctor still complains about duplicates; delete `yarn.lock` only as a last resort.
