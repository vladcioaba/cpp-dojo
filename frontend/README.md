# frontend

Three frontends over one codebase — the web app is the source, the native apps are thin Capacitor shells that load the deployed site.

```
frontend/
├── app.web/       # the web app (deployed as Cloudflare Worker static assets)
├── app.ios/       # Capacitor iOS project (Xcode)
├── app.android/   # Capacitor Android project (Android Studio)
└── capacitor.config.json   # server.url points at the live Worker
```

Because `capacitor.config.json` sets `server.url` to the live site, the native apps always run the current deployed web app — you rarely need to re-sync. Ship a web change → both native apps get it on next launch.

## iOS (needs macOS + Xcode + CocoaPods + an Apple Developer account)

The Xcode project is already generated at `app.ios/`. One-time native-dependency install:

```bash
cd frontend
npm install
sudo gem install cocoapods        # if not installed (or: brew install cocoapods)
cd app.ios/App && pod install
open App.xcworkspace              # opens Xcode
```

In Xcode: select your Team under Signing & Capabilities, pick a device/simulator, Run. For the App Store: Product → Archive → distribute. Enrollment ($99/yr) and signing are your account actions.

## Android (needs Android Studio / SDK)

```bash
cd frontend
npm install
npx cap open android              # opens Android Studio, then Run
```

## Re-generating

The native projects are committed. If you ever need to recreate them: `npx cap add ios` / `npx cap add android` create `ios/` / `android/` (rename to `app.ios` / `app.android`). `capacitor.config.json`'s `webDir` is `app.web`.
