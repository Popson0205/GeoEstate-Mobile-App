// ============================================================
// GeoEstate Support — App
// Minimal, single-purpose: login (shared support account, OTP), a
// conversations list, and a chat thread. Nothing else — no property
// browsing, no owner dashboard. This app IS the shared support inbox.
// ============================================================
(function (window) {
  'use strict';

  const API = window.SupportAPI;
  const app = document.getElementById('app');

  let pollTimer = null;
  let currentView = 'login'; // 'login' | 'list' | 'thread' — drives the back-button handler below

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // Consistent, distinguishable avatar color per person (hashed from their
  // id, not random) — makes the conversations list scannable at a glance
  // instead of every row looking identical.
  const AVATAR_PALETTE = [
    ['#3db374', '#145430'], ['#4a9dd6', '#1c4a6e'], ['#c77dd6', '#5a2a66'],
    ['#e0a23d', '#7a4e10'], ['#e0616b', '#6e1f28'], ['#5ecbc0', '#1c5a53']
  ];
  function avatarGradient(id) {
    let hash = 0;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    const [c1, c2] = AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
    return `linear-gradient(135deg, ${c1}, ${c2})`;
  }

  // Short relative time for the conversations list (WhatsApp-style: "2m",
  // "1h", "Yesterday", or a short date once it's old enough that the exact
  // time isn't the useful part anymore).
  function timeAgoShort(dateStr) {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24 && d.getDate() === new Date().getDate()) return hrs + 'h';
    const days = Math.floor(hrs / 24);
    if (days === 1 || (days === 0 && d.getDate() !== new Date().getDate())) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString('en-NG', { weekday: 'short' });
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
  }

  // Full date label used for the sticky date separators inside a thread.
  function dateSeparatorLabel(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yest)) return 'Yesterday';
    return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  }

  // Sent (single check) / delivered (double check) / read (double check,
  // accent color) — see handleGetThread on the backend for how each status
  // is genuinely determined, not simulated.
  function statusTicks(status) {
    if (status === 'read') return '<svg class="ticks ticks--read" viewBox="0 0 20 12" fill="none"><path d="M1 6.5L4.5 10L11 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6.5L11.5 10L18 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (status === 'delivered') return '<svg class="ticks ticks--delivered" viewBox="0 0 20 12" fill="none"><path d="M1 6.5L4.5 10L11 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6.5L11.5 10L18 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<svg class="ticks ticks--sent" viewBox="0 0 20 12" fill="none"><path d="M1 6.5L4.5 10L11 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--show'));
    setTimeout(() => { el.classList.remove('toast--show'); setTimeout(() => el.remove(), 250); }, 2600);
  }

  function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

  // ---- Login ----
  // Single screen: email + the 6-digit code currently showing in the
  // person's own authenticator app — no waiting on an emailed code, and no
  // separate "enter code" step, since the code is already sitting on their
  // phone before they even open this app.
  function renderLogin() {
    currentView = 'login';
    stopPolling();
    app.innerHTML = `
      <div class="login-screen">
        <div class="login-logo">🏠</div>
        <div class="login-title">GeoEstate Support</div>
        <div class="login-sub">Sign in with your own email and the code from your authenticator app.</div>
        <div class="field">
          <label>Email</label>
          <input class="input" id="login-email" type="email" placeholder="your.email@example.com" autocomplete="username">
        </div>
        <div class="field">
          <label>Authenticator code</label>
          <input class="input" id="login-code" type="tel" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code">
        </div>
        <button class="btn btn-primary btn-block" id="signin-btn">Sign In</button>
        <div class="login-hint">Not enrolled yet? Ask an admin to add you in the Support Staff panel.</div>
      </div>
    `;
    const email = document.getElementById('login-email');
    const code = document.getElementById('login-code');
    const submit = async (e) => {
      const emailVal = email.value.trim();
      const codeVal = code.value.trim();
      if (!emailVal) { toast('Enter your email', 'error'); return; }
      if (codeVal.length !== 6) { toast('Enter the 6-digit code', 'error'); return; }
      const btn = document.getElementById('signin-btn');
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        await API.login(emailVal, codeVal);
        toast('Signed in', 'success');
        if (window.SupportPush) window.SupportPush.init();
        renderConversations();
      } catch (err) {
        toast(err.message || 'Could not sign in', 'error');
        btn.disabled = false; btn.textContent = 'Sign In';
      }
    };
    document.getElementById('signin-btn').onclick = submit;
    code.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  }

  // ---- Conversations list ----
  async function renderConversations() {
    currentView = 'list';
    stopPolling();
    app.innerHTML = `
      <div class="header">
        <div class="header-title">💬 GeoEstate Support</div>
        <button class="icon-btn" id="logout-btn">⏻</button>
      </div>
      <div id="conv-list" class="conv-list"><div class="spinner-wrap"><div class="spinner"></div></div></div>
    `;
    document.getElementById('logout-btn').onclick = () => {
      API.logout();
      stopPolling();
      renderLogin();
    };
    await loadConversations();
    pollTimer = setInterval(loadConversations, 15000);
  }

  async function loadConversations() {
    const list = document.getElementById('conv-list');
    if (!list) { stopPolling(); return; }
    try {
      const conversations = await API.getConversations();
      list.innerHTML = conversations.length ? conversations.map(c => `
        <div class="conv-row" onclick="SupportApp.openThread('${c.other_id}','${esc(c.other_name||'Customer').replace(/'/g,"\\'")}','${c.property_id||''}','${esc(c.property_title||'').replace(/'/g,"\\'")}')">
          <div class="conv-avatar" style="background:${avatarGradient(c.other_id)}">${esc((c.other_name||'C')[0].toUpperCase())}</div>
          <div class="conv-body">
            <div class="conv-top-row">
              <div class="conv-name">${esc(c.other_name || 'Customer')}</div>
              <div class="conv-time">${c.last_at ? timeAgoShort(c.last_at) : ''}</div>
            </div>
            ${c.property_title ? `<div class="conv-property">${esc(c.property_title)}</div>` : ''}
            <div class="conv-preview-row">
              <div class="conv-preview">${esc(c.last_message || '')}</div>
              ${c.unread ? '<div class="conv-badge">1</div>' : ''}
            </div>
          </div>
        </div>
      `).join('') : `<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-title">No conversations yet</div><div class="empty-sub">New customer chats will show up here.</div></div>`;
    } catch (e) {
      // keep showing whatever was last loaded rather than clearing on a transient failure
    }
  }

  // ---- Chat thread ----
  let currentThread = null;

  function openThread(otherId, otherName, propertyId, propertyTitle) {
    currentView = 'thread';
    stopPolling();
    currentThread = { otherId, propertyId };
    app.innerHTML = `
      <div class="header">
        <button class="icon-btn" id="back-to-list">←</button>
        <div class="header-avatar" style="background:${avatarGradient(otherId)}">${esc((otherName||'C')[0].toUpperCase())}</div>
        <div class="header-title-block">
          <div class="header-title">${esc(otherName)}</div>
          ${propertyTitle ? `<div class="header-sub">${esc(propertyTitle)}</div>` : ''}
        </div>
      </div>
      <div id="thread-messages" class="thread-messages"></div>
      <div class="thread-input-row">
        <input class="input" id="thread-input" placeholder="Type a message…" onkeydown="if(event.key==='Enter')SupportApp.send()">
        <button class="send-fab" id="send-btn" onclick="SupportApp.send()" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" width="19" height="19"><path d="M4 12L20 4L14 20L11 13L4 12Z" fill="currentColor"/></svg>
        </button>
      </div>
    `;
    document.getElementById('back-to-list').onclick = renderConversations;
    loadThread();
    pollTimer = setInterval(loadThread, 8000);
  }

  async function loadThread() {
    if (!currentThread) { stopPolling(); return; }
    const box = document.getElementById('thread-messages');
    if (!box) { stopPolling(); return; }
    try {
      const messages = await API.getThread(currentThread.otherId, currentThread.propertyId);
      const session = API.getSession();
      const myId = session ? session.owner.id : null;
      const wasNearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;

      if (!messages.length) {
        box.innerHTML = `<div class="empty-state"><div class="empty-icon">👋</div><div class="empty-sub">No messages yet</div></div>`;
        return;
      }

      // Group consecutive messages from the same sender within 3 minutes of
      // each other (tighter spacing, connected corner treatment — reads as
      // one "turn" instead of a wall of separately-boxed bubbles), and drop
      // in a sticky date separator whenever the calendar day changes.
      let html = '';
      let lastDay = null;
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const mine = m.sender_id === myId;
        const day = new Date(m.created_at).toDateString();
        if (day !== lastDay) {
          html += `<div class="date-sep"><span>${dateSeparatorLabel(m.created_at)}</span></div>`;
          lastDay = day;
        }
        const groupedWithPrev = prev && prev.sender_id === m.sender_id && new Date(m.created_at) - new Date(prev.created_at) < 180000 && new Date(prev.created_at).toDateString() === day;
        const groupedWithNext = next && next.sender_id === m.sender_id && new Date(next.created_at) - new Date(m.created_at) < 180000 && new Date(next.created_at).toDateString() === day;
        const posClass = groupedWithPrev && groupedWithNext ? 'mid' : groupedWithPrev ? 'last' : groupedWithNext ? 'first' : 'solo';
        html += `
          <div class="bubble-row ${mine ? 'mine' : ''} grp-${posClass}">
            <div class="bubble ${mine ? 'bubble--mine' : 'bubble--theirs'}">${esc(m.body || '')}</div>
            ${!groupedWithNext ? `<div class="bubble-meta">
              <span class="bubble-time">${new Date(m.created_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</span>
              ${mine ? statusTicks(m.status) : ''}
            </div>` : ''}
          </div>
        `;
      }
      box.innerHTML = html;
      if (wasNearBottom) box.scrollTop = box.scrollHeight;
    } catch (e) { /* keep showing whatever loaded last */ }
  }

  async function send() {
    if (!currentThread) return;
    const input = document.getElementById('thread-input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    input.disabled = true;
    try {
      await API.sendMessage(currentThread.otherId, body, currentThread.propertyId, 'GeoEstate Support');
      await loadThread();
    } catch (err) {
      toast(err.message || 'Could not send', 'error');
      input.value = body;
    }
    input.disabled = false;
    input.focus();
  }

  window.SupportApp = { openThread, send, toast };

  // ---- Back button / edge-swipe gesture ----
  // This is a single-page app with no browser history entries (screens are
  // swapped via direct innerHTML replacement, not pushState), so Android's
  // default back handling has nothing to go back to and just falls through
  // to backgrounding the app — which is why the hardware back button and
  // the edge-swipe gesture (Capacitor's backButton listener fires for both,
  // they're unified at the OS level) appeared to "do nothing" from a chat
  // thread. Wires it to currentView instead: back from a thread returns to
  // the conversations list; back from the list (or login) exits the app.
  function wireBackButton() {
    const CapApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!CapApp) return; // web preview, or native module not linked yet
    CapApp.addListener('backButton', () => {
      if (currentView === 'thread') {
        renderConversations();
      } else {
        CapApp.exitApp();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireBackButton();
    if (API.isLoggedIn()) {
      renderConversations();
      if (window.SupportPush) window.SupportPush.init();
    } else {
      renderLogin();
    }
  });
})(window);
