# GeoEstate — Native Android App (v2)

Full rebuild of the GeoEstate customer + owner experience as a single native
Capacitor app. Same live backend (`https://api.geoestate.com.ng`) as before —
no backend changes — but every screen (including the Owner Dashboard) now
renders natively inside the app. Nothing opens the external browser.

## What's included

- **Home** — live stats, quick search, fresh listings
- **Browse** — filter by Rent / Buy / Lease, search by state/LGA/keyword
- **Property Detail** — gallery, amenities, units, enquiry form, WhatsApp
- **Owner Dashboard** (native — no browser hand-off)
  - Add Property (multi-step form, in-app)
  - Manage Properties, filter by type
  - Units management (add/view units per property)
  - Enquiries inbox
- **Verify Identity** — NIN + document/selfie upload via Supabase signed URLs
- **Team** — sales team with WhatsApp deep links
- **Contact** — email/phone/WhatsApp + contact form
- **Profile** — session-aware (customer or owner), sign out

## Why the rebuild

The previous build (`GeoEstate-Mobile-App` v1) intentionally routed all
Owner Dashboard flows (`goListProperty()`) to `owner-dashboard.html` in the
system browser via `@capacitor/browser`, because the dashboard was only ever
built as a standalone web tool. This version implements that dashboard as a
first-class in-app screen instead, wired directly to the same
`/owner/*` API endpoints.

## Project structure

```
www/                  ← the app (HTML/CSS/JS) — edit this to change UI
  ├── css/             tokens.css (design tokens), base.css (components)
  ├── js/               api.js (backend client), app.js (router/shell),
  │                     screen-*.js (one file per screen), util.js (helpers)
  └── assets/          team photos, icons
android/               native Android project (Capacitor)
capacitor.config.json  app id, name, colors, plugin config
```

## Building the APK

### Automatically (GitHub Actions)
Every push to `main` triggers `.github/workflows/build-apk.yml`, which runs
`npx cap sync android && ./gradlew assembleDebug` and uploads the resulting
debug APK as a workflow artifact (Actions tab → latest run → Artifacts).

### Locally
```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## App identity
- App ID: `ng.com.geoestate.app`
- App name: GeoEstate
- Brand color: `#0a1a11` (dark green surface), accent green `#3db374`

## Permissions
- `INTERNET` — API calls, image loading
- `CAMERA`, `READ_MEDIA_IMAGES`, `READ_EXTERNAL_STORAGE` (≤ API 32) — Verify
  Identity selfie/document upload

## Known upstream note
`targetSdkVersion` is pinned to 34 (not 36) to avoid an active Capacitor 8 /
Android 15-16 edge-to-edge bug that breaks keyboard input in fixed-position
overlays — carried over from a fix applied in v1.

## Signing for the Play Store
This project only has debug signing configured. For a release build, generate
a keystore and configure `signingConfigs.release` in
`android/app/build.gradle` (or via Android Studio's Generate Signed Bundle
wizard).
