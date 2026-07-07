# GeoEstate — Customer Android App

This is a Capacitor-wrapped Android app built from the GeoEstate customer website
(`index.html` from GeoEstate2). It talks to the same live backend
(`https://api.geoestate.com.ng`) as the website — no backend changes were made.

## What's included vs. excluded

**Included (customer-facing pages only):**
Home, Browse Map, Property Detail, Verify Identity, Our Team, Contact, Profile,
Privacy Policy, Terms.

**Excluded / removed from the app:**
- The "Portals" menu (Owner / Partner / Sales / Admin login links) — removed from
  both the desktop-style top nav and the mobile drawer.
- The "List Property" entry in the nav — this action lands on the Owner Dashboard,
  which is a separate tool (`owner-dashboard.html`) not bundled into this app.
  The few "List a Property" buttons still on the Home/Detail pages now open the
  live owner dashboard in the device's browser instead (via `@capacitor/browser`),
  so the feature isn't broken — it just isn't a native in-app screen.
- `admin.html`, `owner-dashboard.html`, `sales.html`, `partner.html` were never
  copied into this project at all.

Note: `index.html` itself has a large dormant admin-panel block of JS/HTML baked
in (only ever activated by the removed admin nav link). It's inert now — nothing
in the app can trigger it — but it does add extra weight to the bundle. It was
left in place to avoid risking breakage across the file; stripping it out is a
safe follow-up if you want a smaller APK later.

## Project structure

```
geoestate-app/
├── www/                  ← the customer web app (HTML/CSS/JS) — edit this to change UI
├── android/               ← native Android project (open this folder in Android Studio)
├── assets/                ← source icon/splash artwork (1024×1024)
├── capacitor.config.json  ← app id, name, colors, plugin config
└── package.json
```

## Building the APK

You'll need Android Studio (or the Android SDK + Java 17 command line tools)
installed locally — this was not built inside this sandbox since it has no
Android SDK.

### Option A — Android Studio (recommended)
1. Open Android Studio → **Open** → select the `android/` folder.
2. Let Gradle sync finish (first sync downloads dependencies, needs internet).
3. Run ▶ on a device/emulator, or **Build → Generate Signed Bundle / APK** for a
   release build.

### Option B — Command line
```bash
cd android
./gradlew assembleDebug
# APK output: android/app/build/outputs/apk/debug/app-debug.apk
```

## Making changes later
Edit files in `www/`, then re-sync into the native project:
```bash
npx cap copy android      # just copies web assets
npx cap sync android      # copies web assets + updates native plugins
```

## App identity
- App ID: `ng.com.geoestate.app`
- App name: GeoEstate
- Brand color used for status bar / splash / icon background: `#0d3d22`

## Permissions requested
- `INTERNET` — all API calls, map tiles, images
- `CAMERA`, `READ_MEDIA_IMAGES`, `READ_EXTERNAL_STORAGE` (≤ API 32) — used by the
  Verify Identity page's selfie and ID-document file pickers

## Native niceties added on top of the website
- Hardware **back button** steps back through in-app pages (and closes the auth
  modal / mobile drawer first) instead of always exiting the app.
- Branded splash screen and app icon generated from the GeoEstate logo.
- Status bar colored to match the brand.
- Deep external links (e.g. Owner Dashboard) open in the system browser via
  `@capacitor/browser` rather than trying to load inside the app.

## Signing for the Play Store
When you're ready for a release build, generate a keystore and configure
signing in `android/app/build.gradle` (or via Android Studio's Generate Signed
Bundle wizard) — this project currently only has debug signing configured.
