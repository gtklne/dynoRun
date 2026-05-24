# DynoRun — Native build setup

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

- **Location:** "Always" or "While Using" — required for the run.
- **iOS only:** wake-lock not supported; the screen will sleep unless you adjust Settings → Display & Brightness → Auto-Lock → Never during a run.

## Rebuilding after web-app changes

```bash
npm run cap:sync
# Then re-run the platform.
```
