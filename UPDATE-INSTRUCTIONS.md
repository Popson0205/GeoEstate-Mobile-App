# GeoEstate Mobile App — Update Package

This zip contains only the **changed files** from the latest round of fixes. Extract and copy them into your `GeoEstate-Mobile-App` repo, preserving the folder structure, then commit and push.

## What changed & why

1. **Hero background image → brand gradient**
   - `www/index.html` + `android/app/src/main/assets/public/index.html`
   - `www/geoestate-theme.css` + `android/app/src/main/assets/public/geoestate-theme.css`
   - Replaced the 6-photo Unsplash slideshow with a dark-green gradient + two soft drifting glow orbs (uses your existing `--geo-green` palette). Removed all now-unused slideshow CSS/JS (Ken Burns animations, dot indicators, slide labels).

2. **Password field unusable on Sign In / Sign Up**
   - `android/variables.gradle`
   - Root cause: Android 15/16 (SDK 35+) force-enables "edge-to-edge" mode, which breaks keyboard input in fixed-position overlays (your auth modal) — this is an active, unresolved upstream bug affecting many Capacitor 8 apps, not something specific to your code.
   - Fix: `targetSdkVersion` dropped from `36` → `34`, opting out of the enforced edge-to-edge behavior. This is the proven, recommended workaround until Capacitor/Android ship an official fix.

3. **Signing config wiring** (from the earlier back-button/nav-spacing fix round)
   - `android/app/build.gradle` — added a `signingConfigs.release` block that reads from `android/app/keystore.properties` (gitignored) so `./gradlew assembleRelease` produces a signed APK automatically.
   - `android/app/src/main/AndroidManifest.xml` — `windowSoftInputMode="adjustResize"` (kept as belt-and-suspenders alongside the targetSdk fix).

## How to apply

1. Copy `www/*`, `android/app/build.gradle`, `android/variables.gradle`, and `android/app/src/main/AndroidManifest.xml` into your repo at the same paths, overwriting the existing files.
2. **Do NOT copy `android/app/src/main/assets/public/*`** if your repo relies on `npx cap sync android` to regenerate it from `www/` — just run that command locally after copying `www/`. (Included here only so you have a reference of the final synced output.)
3. Set up your keystore for signed builds:
   - Rename `android/app/keystore.properties.example` to `android/app/keystore.properties`
   - Fill in your real `storePassword` / `keyPassword` (from the keystore delivered separately in your project — see "GeoEstate Keystore (KEEP SAFE)" artifact)
   - Place your `geoestate-release.keystore` file at `android/app/geoestate-release.keystore`
4. Add the lines from `.gitignore-additions.txt` to your repo's `.gitignore` so you never accidentally commit the keystore or credentials.
5. Commit and push:
   ```
   git add www/ android/app/build.gradle android/variables.gradle android/app/src/main/AndroidManifest.xml .gitignore
   git commit -m "Fix hero image, password keyboard bug (targetSdk 34), wire release signing"
   git push
   ```

## Build commands (reference)

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug      # unsigned debug APK
./gradlew assembleRelease    # signed release APK (needs keystore.properties)
```
