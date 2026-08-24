// ============================================================
// GeoEstate Support — Push notifications
// Same pattern (and same hard-learned lesson) as the main GeoEstate app's
// push.js: FCM_CONFIGURED gates the entire flow off until Firebase is
// actually set up for THIS app's package name specifically.
//
// This app has a different appId (ng.com.geoestate.support) than the main
// app (ng.com.geoestate.app), so it needs its OWN Android app entry added
// to the SAME Firebase project (geoestate-nig-ltd) — Firebase Console →
// Project Settings → your apps → Add app → Android → package name
// ng.com.geoestate.support → download the updated google-services.json
// (it will contain both app entries) → replace
// support-app/android/app/google-services.json with it → flip
// FCM_CONFIGURED to true here.
//
// Calling register() before that is configured throws a native
// IllegalStateException ("Default FirebaseApp is not initialized") that
// crashes the whole app — not something a JS try/catch can catch — so
// this stays false until that's genuinely done, not just "probably fine".
// ============================================================
(function (window) {
  'use strict';

  const FCM_CONFIGURED = false;

  function getPlugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) || null;
  }

  let initialized = false;

  async function init() {
    if (!FCM_CONFIGURED) return;
    if (initialized) return;
    const plugin = getPlugin();
    if (!plugin) return;
    initialized = true;

    try {
      const perm = await plugin.checkPermissions();
      let granted = perm.receive === 'granted';
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        const req = await plugin.requestPermissions();
        granted = req.receive === 'granted';
      }
      if (!granted) return;

      await plugin.addListener('registration', (token) => {
        if (token && token.value && window.SupportAPI) {
          window.SupportAPI.registerPushToken(token.value).catch(() => {});
        }
      });
      await plugin.addListener('registrationError', () => {});
      await plugin.addListener('pushNotificationReceived', (notification) => {
        // No dedicated in-app toast helper is wired here on purpose — the
        // conversations list already polls every 15s, so a foreground
        // notification would be redundant with the list refreshing itself.
      });

      await plugin.register();
    } catch (e) {
      // Never let push setup failures affect the rest of the app.
    }
  }

  function reset() { initialized = false; }

  window.SupportPush = { init, reset };
})(window);
