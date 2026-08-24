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
  let pendingEmail = '';

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    return new Date(dateStr).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
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
  function renderLogin() {
    stopPolling();
    app.innerHTML = `
      <div class="login-screen">
        <div class="login-logo">🏠</div>
        <div class="login-title">GeoEstate Support</div>
        <div class="login-sub">Sign in with the shared support email to answer customer chats.</div>
        <div class="field">
          <label>Email</label>
          <input class="input" id="login-email" type="email" placeholder="geoestate.ng@gmail.com" autocomplete="username">
        </div>
        <button class="btn btn-primary btn-block" id="send-code-btn">Send Code</button>
      </div>
    `;
    document.getElementById('send-code-btn').onclick = async (e) => {
      const email = document.getElementById('login-email').value.trim();
      if (!email) { toast('Enter the support email', 'error'); return; }
      e.target.disabled = true; e.target.textContent = 'Sending…';
      try {
        await API.requestOTP(email);
        pendingEmail = email;
        toast('Code sent — check that inbox', 'success');
        renderOtpStep();
      } catch (err) {
        toast(err.message || 'Could not send code', 'error');
        e.target.disabled = false; e.target.textContent = 'Send Code';
      }
    };
  }

  function renderOtpStep() {
    app.innerHTML = `
      <div class="login-screen">
        <div class="login-logo">📩</div>
        <div class="login-title">Enter the code</div>
        <div class="login-sub">Sent to ${esc(pendingEmail)}</div>
        <div class="field">
          <label>6-digit code</label>
          <input class="input" id="login-otp" type="tel" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code">
        </div>
        <button class="btn btn-primary btn-block" id="verify-btn">Verify & Sign In</button>
        <button class="btn btn-outline btn-block mt-2" id="back-btn">Use a different email</button>
      </div>
    `;
    document.getElementById('back-btn').onclick = renderLogin;
    document.getElementById('verify-btn').onclick = async (e) => {
      const code = document.getElementById('login-otp').value.trim();
      if (code.length !== 6) { toast('Enter the 6-digit code', 'error'); return; }
      e.target.disabled = true; e.target.textContent = 'Verifying…';
      try {
        await API.verifyOTP(pendingEmail, code);
        toast('Signed in', 'success');
        if (window.SupportPush) window.SupportPush.init();
        renderConversations();
      } catch (err) {
        toast(err.message || 'Invalid code', 'error');
        e.target.disabled = false; e.target.textContent = 'Verify & Sign In';
      }
    };
  }

  // ---- Conversations list ----
  async function renderConversations() {
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
          <div class="conv-avatar">${esc((c.other_name||'C')[0].toUpperCase())}</div>
          <div class="conv-body">
            <div class="conv-name">${esc(c.other_name || 'Customer')}${c.property_title ? ' · ' + esc(c.property_title) : ''}</div>
            <div class="conv-preview">${esc(c.last_message || '')}</div>
          </div>
          ${c.unread ? '<div class="conv-dot"></div>' : ''}
        </div>
      `).join('') : `<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-title">No conversations yet</div><div class="empty-sub">New customer chats will show up here.</div></div>`;
    } catch (e) {
      // keep showing whatever was last loaded rather than clearing on a transient failure
    }
  }

  // ---- Chat thread ----
  let currentThread = null;

  function openThread(otherId, otherName, propertyId, propertyTitle) {
    stopPolling();
    currentThread = { otherId, propertyId };
    app.innerHTML = `
      <div class="header">
        <button class="icon-btn" id="back-to-list">←</button>
        <div class="header-title-block">
          <div class="header-title">${esc(otherName)}</div>
          ${propertyTitle ? `<div class="header-sub">${esc(propertyTitle)}</div>` : ''}
        </div>
      </div>
      <div id="thread-messages" class="thread-messages"></div>
      <div class="thread-input-row">
        <input class="input" id="thread-input" placeholder="Type a message…" onkeydown="if(event.key==='Enter')SupportApp.send()">
        <button class="btn btn-primary" id="send-btn" onclick="SupportApp.send()">Send</button>
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
      box.innerHTML = messages.length ? messages.map(m => {
        const mine = m.sender_id === myId;
        return `
          <div class="bubble-row ${mine ? 'mine' : ''}">
            <div class="bubble ${mine ? 'bubble--mine' : 'bubble--theirs'}">${esc(m.body || '')}</div>
            <div class="bubble-time">${new Date(m.created_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        `;
      }).join('') : `<div class="empty-state"><div class="empty-icon">👋</div><div class="empty-sub">No messages yet</div></div>`;
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

  window.SupportApp = { openThread, send };

  document.addEventListener('DOMContentLoaded', () => {
    if (API.isLoggedIn()) {
      renderConversations();
      if (window.SupportPush) window.SupportPush.init();
    } else {
      renderLogin();
    }
  });
})(window);
