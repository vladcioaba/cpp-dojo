#!/usr/bin/env bash
# Refresh the offline content snapshot bundled into the native app, then sync
# Capacitor. Run before building the iOS/Android app so it works without internet.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
datasets="$here/../datasets"

echo "→ regenerating datasets bundle"
( cd "$datasets" && node tools/build.js )

echo "→ copying snapshot into app.web/offline"
mkdir -p "$here/app.web/offline"
cp "$datasets/bundle.md"   "$here/app.web/offline/bundle.md"
cp "$datasets/skills.json" "$here/app.web/offline/skills.json"

echo "→ capacitor sync"
( cd "$here" && npx cap sync )

# Capacitor CLI only auto-detects platform dirs named ios/ and android/;
# ours are app.ios/ and app.android/, so copy the web assets + config manually.
for native in "app.ios/App/App" "app.android/app/src/main/assets"; do
  dest="$here/$native"
  [ -d "$dest" ] || continue
  echo "→ copying web assets into $native/public"
  rm -rf "$dest/public"
  cp -R "$here/app.web" "$dest/public"
  cp "$here/capacitor.config.json" "$dest/capacitor.config.json"
done
echo "done — rebuild in Xcode / Android Studio to ship the offline snapshot"
