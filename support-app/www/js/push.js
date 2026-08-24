// ============================================================
// GeoEstate Support — Push notifications
// FCM_CONFIGURED is true now that support-app/android/app/google-services.json
// has been added, containing a real entry for this app's package name
// (ng.com.geoestate.support) within the same Firebase project the main
// app uses (geoestate-nig-ltd) — the Google Services Gradle plugin
// automatically picks the matching client entry by applicationId at
// build time, so the same google-services.json file (containing both
// apps) works correctly for both this app and the main one.
// ============================================================
(function (window) {
  'use strict';

  const FCM_CONFIGURED = true;

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
        // Foreground notifications aren't shown by the OS automatically the
        // way backgrounded ones are — surface a toast so staff notice a new
        // message while actively using the app, on top of the conversations
        // list's own 15s poll picking it up regardless.
        if (window.SupportApp && window.SupportApp.toast) {
          window.SupportApp.toast((notification.title ? notification.title + ': ' : '') + (notification.body || 'New message'));
        }
      });

      await plugin.register();
    } catch (e) {
      // Never let push setup failures affect the rest of the app.
    }
  }

  function reset() { initialized = false; }

  window.SupportPush = { init, reset };
})(window);
