# Shiranami mobile

How to run `apps/mobile` (Expo SDK 56) on a physical Android device. The app needs a development build: `expo-audio` with its playback service, `expo-sqlite` and the local `audio-noisy` module are native code that Expo Go does not contain.

There is no emulator workflow, by choice. Everything below targets a real phone.

## Prerequisites

- Node `>=22.23.0` and pnpm 10.9 (`packageManager` in the root `package.json`).
- Android Studio, for its bundled JDK 21 and the Android SDK. Point `JAVA_HOME` at that JDK (on macOS: `/Applications/Android Studio.app/Contents/jbr/Contents/Home`) and `ANDROID_HOME` at the SDK directory (on macOS: `~/Library/Android/sdk`), or a direct Gradle build fails with `SDK location not found`.
- `adb` from the SDK `platform-tools` on your `PATH`.
- A phone with USB debugging on. Check it with `adb devices`.
- Optional: an Expo account with access to the `shirone-dev` owner, for EAS builds.

```bash
pnpm install
```

## Daily loop

Install a development client on the phone once (below), then:

```bash
adb reverse tcp:8081 tcp:8081
pnpm dev:mobile    # from the repo root
```

`pnpm dev:mobile` runs `expo start -c` in `apps/mobile` (cache cleared on every start). Open the dev client on the phone: its launcher lists the detected Metro server (tap it) or you can scan the QR code from the terminal. Over USB only, enter `http://localhost:8081` in the launcher, which `adb reverse` forwards to the computer. JS and style changes hot reload. A change to `app.json`, a config plugin, a native dependency or `modules/audio-noisy` needs a new native build.

## Build and install a debug dev client locally

```bash
cd apps/mobile
pnpm android:prebuild          # expo prebuild --platform android --clean
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`pnpm --filter @shiranami/mobile android` (`expo run:android`) does build, install and launch in one step and is fine when a single device is attached.

`apps/mobile/android/` is generated and ignored. Re-run `android:prebuild` after changing native config; `--clean` rebuilds the folder from scratch.

## EAS builds

Profiles live in `apps/mobile/eas.json`. The CLI is pinned through the `eas` script, so there is nothing to install globally.

| Profile       | Output | Use                                               |
| ------------- | ------ | ------------------------------------------------- |
| `development` | APK    | Dev client, internal distribution                 |
| `preview`     | APK    | Release-like build to sideload and test           |
| `production`  | AAB    | Play Store upload, `autoIncrement` on the version |

```bash
cd apps/mobile
pnpm eas build --profile development --platform android
pnpm eas build --profile preview --platform android
pnpm eas build --profile production --platform android
```

`requireCommit` is on, so commit before building. When a build finishes, EAS prints a link and a QR code: open it on the phone, download the APK and install it (allow installs from the browser when Android asks). The `production` AAB is not installable directly.

## Environment variables

Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` (ignored by git):

- `EXPO_PUBLIC_API_URL`: default server URL. Use the computer's LAN address for a phone, for example `http://192.168.1.20:3000`. `10.0.2.2` only works inside an emulator.
- `EXPO_PUBLIC_API_KEY`: value for the `x-shiranami-key` header, if the server wants one.
- `EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH`: `true` or `false`, off for v0.1.

`EXPO_PUBLIC_*` values are inlined into the bundle and readable by anyone with the app, so no secrets. Restart Metro after a change (`pnpm dev:mobile` already clears the cache).

`.env.local` only reaches local Metro. EAS builds do not upload it, so set the same names in the matching EAS environment (each profile in `eas.json` names one) or the build falls back to the defaults:

````bash
cd apps/mobile
pnpm eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value http://192.168.1.20:3000 --visibility plaintext
``` `lib/env.ts` validates them at startup.

## Test audio on the phone

```bash
adb push track.mp3 /sdcard/Music/
````

Then import it from the app's file picker. If it does not show up, put it in `/sdcard/Download/` instead. `adb shell ls /sdcard/Music` confirms the push.

## Logs

```bash
adb logcat ReactNativeJS:V '*:S'      # JS console output and errors
adb logcat -b crash                   # native crash headers and backtraces, unfiltered
adb logcat -c                         # clear the buffer first
```

## Phone test checklist

Run this on the phone after any change to playback, navigation or native config.

- [ ] Playback: a local file plays, pauses and resumes
- [ ] Queue: next, previous, reorder, remove, repeat and shuffle behave
- [ ] Seek: dragging the bar lands where expected and keeps playing
- [ ] Notification and lock screen: controls, title and art show and work
- [ ] Headphone unplug: playback pauses
- [ ] Locked for 3+ minutes: audio keeps playing, controls still respond
- [ ] Call interruption: playback pauses on a call and resumes after
- [ ] Radio: a live station plays and recovers after a network drop
- [ ] Sleep timer: it fades out and stops at the set time
- [ ] Sheets and the back button: each sheet closes on back, no screen is skipped
- [ ] Settings: tracks without art show the placeholder art
- [ ] Icon and splash: launcher icon (adaptive and themed) and the splash look right
- [ ] Desktop sync: pair by QR over home Wi-Fi, the first pull finishes, Sync now copies nothing new, Forget unpairs on both sides

## Desktop sync (LAN v0)

Settings > Desktop > Sync with desktop pairs the phone with the desktop app and copies its library over home Wi-Fi, one way (desktop to phone). The protocol is `crates/shiranami-sync/README.md`; the wire types, the link parser and every HMAC come from `@shiranami/contracts/sync`.

- Pairing (`lib/sync-pairing.ts`): the camera reads the `shiranami://pair?...` QR, the phone finds the first host from it that answers, sends `POST /v1/sync/pair` and waits up to 120 s for Allow on the desktop. It checks `keyProof` before it derives the device secret.
- Storage (`lib/sync-peer.ts`): the device secret goes to `expo-secure-store` (Android keystore) only. The desktop name, id, hosts, port, device id, clock skew and last sync time are the `syncDesktop` row of the settings table.
- A pull (`lib/sync-run.ts`): manifest, favorites, playlists and history first, then audio, then covers. A song the phone already has (same `content_hash`) is linked, not downloaded. New songs are rows with `source = 'desktop'` and `desktop_id` (migration 3), hidden as missing until their audio is in `tracks/`. Audio resumes with `Range` plus `If-Range` from a `.part` file (`lib/sync-download.ts`); covers go to `art/<hash>.jpg`. Every database write joins the library run lock in `lib/library-scan.ts`.
- Merges (`lib/sync-library.ts`): desktop favorites are added, never removed. A desktop playlist keeps its desktop id and takes the desktop's name and order on every pull; playlists made on the phone are not touched, and one deleted on the desktop stays on the phone. Plays are added once by id.
- Cleartext: v0 is plain HTTP to a private address, and the address is only known at runtime from the QR. Android's network security config matches host names, not address ranges, and is fixed at build time, so it cannot scope cleartext to RFC 1918 space or to the paired host. The app therefore sets `usesCleartextTraffic` (through `expo-build-properties`) and the sync client refuses every host outside 10/8, 172.16/12, 192.168/16 and 169.254/16 itself (`isPrivateLanHost`). v1 moves to TLS with a pinned certificate and drops this.
- Hermes has no Web Crypto, so `lib/crypto-polyfill.ts` installs `crypto.getRandomValues` from `expo-crypto` at startup for the X25519 keys and request nonces.
- Metro, Jest and TypeScript read `@shiranami/contracts/sync` from source through its `react-native` export condition, so the contracts package needs no build for the app.

## Traps

### React 19.2.3 for mobile, newer React elsewhere

React Native 0.85 checks its renderer against the exact React version it was built with (19.2.3 for SDK 56), while `apps/web` and `apps/landing` run a newer React. The root `pnpm-workspace.yaml` keeps them apart with the parent-scoped override `'@shiranami/mobile>react'`, and `apps/mobile/metro.config.js` resolves `react` from the app itself so Metro never picks the web copy out of pnpm's hidden hoist folder. Do not bump mobile React on its own; it moves with the Expo SDK.

### Keep the `android/` ignore anchored

`apps/mobile/.gitignore` ignores `/android/` and `/ios/` with a leading slash, so only the generated folders are skipped. An unanchored `android/` would also ignore `apps/mobile/modules/audio-noisy/android/`, the module's real source, and the build would break on a fresh clone without any git warning.
