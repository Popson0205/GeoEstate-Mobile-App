// ============================================================
// GeoEstate v2 — Push notification registration (Capacitor)
// Thin wrapper around @capacitor/push-notifications, which registers on the
// native bridge as Capacitor.Plugins.PushNotifications (official first-party
// plugin, verified against its actual registerPlugin() call — unlike the
// biometric plugin, the JS export name and the bridge name match exactly).
//
// IMPORTANT: this can only actually deliver notifications once the native
// Android project has google-services.json (Firebase project credentials)
// and the backend has SECRET_FCM_SERVICE_ACCOUNT configured on Railway.
// Without those, register() below will typically fail quietly (no
// 'registration' event ever fires) — every call here is written to degrade
// gracefully rather than throw, so the rest of the app is unaffected either
// way.
// ============================================================
(function (window) {
  'use strict';

  function getPlugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) || null;
  }

  // Call once after a successful login/registration (or on boot if already
  // logged in) — requests permission, registers with FCM, and sends the
  // resulting device token to the backend so it knows where to deliver
  // notifications for this user.
  let initialized = false;

  async function init() {
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
