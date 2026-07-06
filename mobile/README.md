# cpp-dojo — mobile (iOS / Android)

The app is a **web-first PWA**; this folder wraps it as a **native app via Capacitor**, so one codebase (`../public`) ships everywhere:

| Target | How | Status |
|--------|-----|--------|
| Desktop / tablet / phone browser | just visit the URL | live |
| Installable app (add to home screen) | PWA manifest + service worker | live — works on iOS Safari, Android Chrome, desktop |
| iOS App Store | Capacitor → Xcode | scaffolded here; needs your Mac + Apple Developer account |
| Google Play | Capacitor → Android Studio | scaffolded here |

## Why this engine

The app was already a polished, dependency-free web app (feed, animated SVG labs, compile backend, accounts). A Flutter/React-Native rewrite would throw all of that away. Capacitor instead loads the exact same web app inside a native `WKWebView`/`WebView` shell, so:

- 100% code reuse — no second implementation to maintain
- the compile backend, labs, day/night, leaderboard all work unchanged
- native App Store / Play Store distribution when you want it
- access to native plugins later (push notifications, haptics) if needed

`capacitor.config.json` points `server.url` at the deployed Worker, so the native app always runs the current live version (backend included). To ship a fully-bundled offline build instead, drop `server.url` and rely on the copied `www/` + service worker.

## Build the iOS app (needs macOS + Xcode + an Apple Developer account)

```bash
cd mobile
npm install
npm run add:ios          # copies ../public → www, creates the ios/ Xcode project
npm run open:ios         # opens Xcode
```

In Xcode: pick your Team (Signing & Capabilities), choose a device/simulator, press Run. For the App Store: Product → Archive → distribute. The Apple Developer Program enrollment ($99/yr) and app signing are account actions you do yourself — they aren't scripted here.

After any change to the web app: `npm run sync` (re-copies `www/` and updates the native project).

## Android

```bash
cd mobile
npm install
npm run add:android
npm run open:android     # Android Studio
```

> `www/`, `ios/`, `android/`, and `node_modules/` are generated — they're gitignored.
