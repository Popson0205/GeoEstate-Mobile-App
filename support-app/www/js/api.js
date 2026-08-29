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
      if (d.success && d.token) setSession({ token: d.token, owner: d.owner, staffName: d.staff_name, staffId: d.staff_id, loginTime: Date.now() });
      return d;
    },
    logout() { clearSession(); },

    async getConversations() {
      const d = await req('/support/conversations');
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
    },

    // ---- Conversation claims ----
    // A claim is deliberate (staff tap "Claim"), not automatic on first
    // reply — see handleClaimConversation on the backend for why.
    async claimConversation(customerId) {
      return req('/support/claim', { method: 'POST', body: { customerId } });
    },
    async releaseConversation(customerId) {
      return req('/support/release', { method: 'POST', body: { customerId } });
    },
    async pingPresence(customerId) {
      // Best-effort, silent on failure — a missed presence ping just means
      // this one heartbeat doesn't show up for other staff, nothing worth
      // surfacing an error for.
      return req('/support/presence/ping', { method: 'POST', body: { customerId } }).catch(() => {});
    },

    // ---- Live updates (claims + presence) ----
    // One shared SSE connection for both event types — claim changes are
    // rare but need to update the UI reliably; presence pings arrive every
    // ~10s from every other staff member with a thread open, so this
    // reconnects on drop rather than leaving the support app silently
    // stale until the next manual refresh.
    connectLiveUpdates(onClaimChanged, onPresence) {
      const session = getSession();
      if (!session) return () => {};
      let es = null;
      let closed = false;
      function connect() {
        if (closed) return;
        es = new EventSource(BASE + '/events');
        es.addEventListener('support_claim_changed', (e) => {
          try { onClaimChanged(JSON.parse(e.data)); } catch (err) {}
        });
        es.addEventListener('support_presence', (e) => {
          try { onPresence(JSON.parse(e.data)); } catch (err) {}
        });
        es.onerror = () => {
          es.close();
          if (!closed) setTimeout(connect, 4000);
        };
      }
      connect();
      return () => { closed = true; if (es) es.close(); };
    }
  };
})(window);
