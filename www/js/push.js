// ============================================================
// GeoEstate v2 — Push notification registration (Capacitor)
// Thin wrapper around @capacitor/push-notifications, which registers on the
// native bridge as Capacitor.Plugins.PushNotifications (official first-party
// plugin, verified against its actual registerPlugin() call — unlike the
// biometric plugin, the JS export name and the bridge name match exactly).
//
// FCM_CONFIGURED must be flipped to true only once BOTH of these are done:
//   1. android/app/google-services.json (real Firebase project credentials)
//      is added to this repo and the Google Services Gradle plugin is
//      applied — without this, PushNotificationsPlugin.register() calls
//      FirebaseMessaging.getInstance() directly, which throws a native
//      IllegalStateException ("Default FirebaseApp is not initialized")
//      because FirebaseApp was never initialized. That's not something a
//      JS try/catch can catch — it crashes the whole app process (this is
//      exactly what happened: "GeoEstate keeps stopping" right after
//      granting notification permission, since permission-grant is what
//      triggered the next step, register()).
//   2. SECRET_FCM_SERVICE_ACCOUNT is set on the backend (Railway), so a
//      registered token actually has somewhere real to receive a push.
// Until both are true, this module intentionally does nothing at all —
// not even requesting notification permission, since there'd be no point
// prompting for a permission the app can't yet use.
// ============================================================
(function (window) {
  'use strict';

  const FCM_CONFIGURED = false;

  function getPlugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) || null;
  }

  // Call once after a successful login/registration (or on boot if already
  // logged in) — requests permission, registers with FCM, and sends the
  // resulting device token to the backend so it knows where to deliver
  // notifications for this user.
  let initialized = false;

  async function init() {
    if (!FCM_CONFIGURED) return;
    if (initialized) return;
    const plugin = getPlugin();
    if (!plugin) return; // web preview, or native module not linked yet
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
        if (token && token.value && window.GeoAPI) {
          window.GeoAPI.registerPushToken(token.value).catch(() => {});
        }
      });
      await plugin.addListener('registrationError', () => {
        // Expected until Firebase credentials are configured — no action needed.
      });
      // Foreground notifications aren't shown by the OS automatically the
      // way backgrounded ones are — surface a toast so the user still
      // notices a chat message or update while actively using the app.
      await plugin.addListener('pushNotificationReceived', (notification) => {
        if (window.toast) {
          window.toast((notification.title ? notification.title + ': ' : '') + (notification.body || 'New notification'));
        }
      });
      await plugin.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification && action.notification.data;
        if (data && data.type === 'chat' && window.GeoChat) {
          // Chat is a sheet (GeoChat.openChatThread), not a router page — the
          // structured push data only carries sender_id/property_id; the
          // sender's display name only exists in the notification's own
          // title (set server-side to sender_name || 'New message'), so
          // that's used as a reasonable fallback here.
          const otherName = (action.notification.title || 'User');
          window.GeoChat.openChatThread(data.sender_id, otherName, data.property_id || '', '');
        }
      });

      await plugin.register();
    } catch (e) {
      // Never let push setup failures affect the rest of the app.
    }
  }

  // Called on logout — without this, a different user logging in later on
  // the same device would silently skip re-registration (the guard above
  // would still think it's "already initialized" from the previous user),
  // leaving push notifications associated with whoever logged in first.
  function reset() {
    initialized = false;
  }

  window.GeoPush = { init, reset };
})(window);
