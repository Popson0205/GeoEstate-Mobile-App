// ============================================================
// GeoEstate Support — API wrapper
// Login uses individually-enrolled authenticator app (TOTP) credentials —
// each of the (however many) staff members has their own email + code
// from their own Google Authenticator/Authy/etc, enrolled via the admin
// panel — rather than a single shared email waiting on an emailed OTP.
// A successful login still just issues a token for the one shared
// SUPPORT_USER_ID identity, so every chat endpoint below is completely
// unaffected by who specifically logged in.
// ============================================================
(function (window) {
  'use strict';

  const BASE = 'https://api.geoestate.com.ng';
  const SESSION_KEY = 'support_session';

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  async function req(path, opts) {
    opts = opts || {};
    const session = getSession();
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      session ? { 'Authorization': 'Bearer ' + session.token } : {},
      opts.headers || {}
    );
    let res;
    try {
      res = await fetch(BASE + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (netErr) {
      throw new Error('Could not reach GeoEstate servers. Check your connection.');
    }
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }

  window.SupportAPI = {
    getSession, setSession, clearSession,
    isLoggedIn: () => !!getSession(),

    // One step: email + the 6-digit code currently showing in their
    // authenticator app — no waiting on an email round-trip.
    async login(email, code) {
      const d = await req('/support/login', { method: 'POST', body: { email, code } });
      if (d.success && d.token) setSession({ token: d.token, owner: d.owner, staffName: d.staff_name, loginTime: Date.now() });
      return d;
    },
    logout() { clearSession(); },

    async getConversations() {
      const d = await req('/owner/conversations');
      return d.conversations || [];
    },
    async getThread(otherId, propertyId) {
      const qs = '?with=' + encodeURIComponent(otherId) + (propertyId ? '&property_id=' + encodeURIComponent(propertyId) : '');
      const d = await req('/owner/messages' + qs);
      return d.messages || [];
    },
    async sendMessage(recipientId, body, propertyId, senderName) {
      return req('/owner/messages', { method: 'POST', body: { recipient_id: recipientId, body, property_id: propertyId || null, sender_name: senderName || 'GeoEstate Support' } });
    },
    async registerPushToken(token) {
      return req('/owner/push-token', { method: 'POST', body: { push_token: token } });
    }
  };
})(window);
