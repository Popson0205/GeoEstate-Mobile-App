// ============================================================
// GeoEstate v2 — Biometric lock (fingerprint / Face ID)
// Thin wrapper around @aparajita/capacitor-biometric-auth, which
// registers on the native bridge as Capacitor.Plugins.BiometricAuth
// (same pattern this project already uses for StatusBar/SplashScreen/App —
// see www/index.html and app.js). Degrades gracefully to "not available"
// on the web or if the plugin didn't load for any reason, rather than
// throwing and blocking the app.
// ============================================================
(function (window) {
  'use strict';

  const STORAGE_KEY = 'geo_biometric_enabled';

  function isEnabled() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  function setEnabled(v) {
    localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false');
  }

  function getPlugin() {
    // The plugin registers on the native bridge as "BiometricAuthNative"
    // (see registerPlugin('BiometricAuthNative', ...) in its own source),
    // not "BiometricAuth" — that mismatch was the actual reason this always
    // reported "not available" regardless of the device's real capability.
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BiometricAuthNative) || null;
  }

  // Returns { isAvailable, biometryType, ... } — isAvailable is false (not
  // an error) if the device has no biometric hardware, nothing enrolled, or
  // the plugin isn't present (e.g. running in a browser tab during dev).
  async function checkAvailable() {
    const plugin = getPlugin();
    if (!plugin) return { isAvailable: false, biometryType: 'none' };
    try {
      return await plugin.checkBiometry();
    } catch (e) {
      return { isAvailable: false, biometryType: 'none' };
    }
  }

  // Resolves on success, rejects on failure/cancel — callers should catch
  // and show err.message. The raw native bridge only exposes checkBiometry
  // and internalAuthenticate directly; the nicer authenticate() wrapper
  // (with error re-typing) only exists in the package's JS base class,
  // which this vanilla script-tag project has no bundler to import — so
  // this calls internalAuthenticate directly instead, which does the same
  // native work.
  async function authenticate(reason) {
    const plugin = getPlugin();
    if (!plugin) throw new Error('Biometric authentication is not available on this device');
    await plugin.internalAuthenticate({
      reason: reason || 'Unlock GeoEstate',
      androidTitle: 'Biometric Login',
      androidSubtitle: 'Use your fingerprint or face to unlock GeoEstate',
      cancelTitle: 'Cancel',
      // Falls back to device PIN/pattern/password if biometry itself isn't
      // available or fails repeatedly, so a user can never get permanently
      // locked out just because e.g. their fingerprint sensor is dirty.
      allowDeviceCredential: true
    });
  }

  window.GeoBiometric = { isEnabled, setEnabled, checkAvailable, authenticate };
})(window);
