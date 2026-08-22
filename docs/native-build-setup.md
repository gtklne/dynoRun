# DynoRun: Native build setup

This document captures the platform-specific install steps for Plan 3's Capacitor build.

## Prerequisites

- **iOS:** macOS, Xcode 15+, CocoaPods, optionally an Apple Developer account.
- **Android:** Android Studio + Android SDK 34 + Java 17.

## One-time installation

```bash
# From the project root:
npm install
npm run build
npx cap sync
```

`npx cap sync` copies the web bundle (`dist/`) into `ios/App/App/public` and `android/app/src/main/assets/public`, and installs any pending native plugin code (CocoaPods on iOS, Gradle deps on Android).

## Running on iOS

```bash
npm run cap:open:ios    # opens the workspace in Xcode
# In Xcode: pick a simulator or device, then Run (⌘R).
```

Or headless:

```bash
npm run cap:run:ios     # invokes xcodebuild + ios-deploy
```

You will be asked to trust your Mac on first device connect, and to trust the developer certificate in iOS Settings → General → VPN & Device Management.

## Running on Android

```bash
npm run cap:open:android  # opens in Android Studio
# Run the app from Android Studio onto a connected device or emulator.
```

Or headless:

```bash
npm run cap:run:android
```

## Permissions to grant on first launch

- **Location:** "Always" or "While Using": required for the run.
- **iOS:** The app uses `@capacitor-community/keep-awake` to prevent screen sleep during a run. No manual adjustment needed.

## Android manifest notes

`android/app/src/main/AndroidManifest.xml` declares `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION`. Investigation result: `@capacitor/geolocation` v8 uses Google's `FusedLocationProviderClient` directly and does **not** start an Android foreground service: its own `AndroidManifest.xml` is empty. These two permissions are therefore redundant. They are harmless (neither triggers a runtime permission prompt), but if Google Play flags them as undeclared foreground service types during a future submission review, remove them from the manifest without any other changes needed.

## Sign-in on native

Native builds sign in differently from the web, and two of the pieces are easy to get wrong.

**`VITE_API_URL` must be set before you build.** The webview is served from its own origin (`capacitor://localhost` on iOS, `https://localhost` on Android, per `androidScheme` in `capacitor.config.ts`), so a relative `/api` goes nowhere and the OAuth callback would be built against the webview origin. Put `VITE_API_URL=https://wasgoht.ch` in the root `.env` before `npm run cap:sync`.

**Session state is a bearer token, not a cookie.** The webview origin is cross-site to the API and better-auth's cookie is `SameSite=Lax`, so nothing is sent by `credentials: 'include'`. The app stores a token and both `authClient` and `apiFetch` attach it. See *Authentication* in CLAUDE.md.

**Social sign-in leaves the app.** It opens `GET /api/native/sign-in/:provider` in the system browser (OAuth providers refuse embedded webviews), and the browser hands control back over the `com.dynorun.app://auth` URL scheme, registered in `Info.plist` (`CFBundleURLTypes`) and `AndroidManifest.xml`. If you change the scheme, change it in `server/src/auth.ts` and `src/auth/social-sign-in.ts` too.

**Register `https://wasgoht.ch/api/auth/callback/<provider>` as the redirect URI** with each OAuth provider. There is no separate native redirect URI: the round trip always returns to the web origin first.

**Before shipping to either store, replace the custom URL scheme with Android App Links and iOS Universal Links.** A custom scheme is not an exclusive claim, so another app on the device can register `com.dynorun.app`, intercept the callback and redeem the one-time token for a session. Fixing it needs the release signing fingerprint (`assetlinks.json`) and an Apple Team ID (`apple-app-site-association`), which is why it is not done yet. This is a release blocker for the apps, not for the web app.

## Rebuilding after web-app changes

Also run `npm run cap:sync` after adding any Capacitor plugin. Until it runs, a plugin listed in `package.json` is absent from `android/app/capacitor.build.gradle` and `ios/App/CapApp-SPM/Package.swift`, and calling it fails at runtime on a device while everything compiles and tests pass.

```bash
npm run cap:sync
# Then re-run the platform.
```
