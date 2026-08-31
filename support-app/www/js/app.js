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
  let presencePingTimer = null;
  let currentView = 'login'; // 'login' | 'list' | 'thread' — drives the back-button handler below

  // Live state fed by the SSE connection (see connectLiveUpdates in api.js),
  // merged into whatever the REST polling last loaded rather than waiting
  // for the next poll cycle to reflect a claim change or a presence ping.
  let liveDisconnect = null;
  let conversationsCache = [];           // last list response, patched live
  const presenceByCustomer = {};         // customerId -> { staffId, staffName, ts }
  const PRESENCE_TIMEOUT_MS = 20000;     // matches the ~10s ping interval with margin

  function myStaffId() {
    const s = API.getSession();
    return s ? s.staffId : null;
  }
  function myStaffName() {
    const s = API.getSession();
    return s ? s.staffName : null;
  }

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

  // ---- Live updates (claims + presence, via SSE) ----
  // Connected once per session (idempotent — safe to call again on resume),
  // torn down on logout. Patches whatever's currently cached/rendered
  // rather than forcing a full reload, so a claim or presence change from
  // a colleague shows up within a second or two instead of waiting for the
  // next 15s poll.
  function startLiveUpdates() {
    if (liveDisconnect) return; // already connected
    liveDisconnect = API.connectLiveUpdates(
      (evt) => { // support_claim_changed: { customerId, claimedBy: {staffId,staffName} | null }
        const row = conversationsCache.find(c => c.other_id === evt.customerId);
        if (row) row.claimedBy = evt.claimedBy;
        if (currentView === 'list') renderConversationRows();
        if (currentView === 'thread' && currentThread && currentThread.otherId === evt.customerId) renderClaimBanner(evt.claimedBy);
      },
      (evt) => { // support_presence: { customerId, staffId, staffName, ts }
        if (evt.staffId === myStaffId()) return; // ignore our own pings
        presenceByCustomer[evt.customerId] = { staffId: evt.staffId, staffName: evt.staffName, ts: evt.ts };
        if (currentView === 'list') renderConversationRows();
        if (currentView === 'thread' && currentThread && currentThread.otherId === evt.customerId) renderThreadPresence();
      },
      (evt) => { // message_edited: { id, body, otherId } - reload if this thread is open
        if (currentView === 'thread' && currentThread && currentThread.otherId === evt.otherId) loadThread();
      },
      (evt) => { // message_deleted: { id, otherId }
        if (currentView === 'thread' && currentThread && currentThread.otherId === evt.otherId) loadThread();
      }
    );
  }
  function stopLiveUpdates() {
    if (liveDisconnect) { liveDisconnect(); liveDisconnect = null; }
  }
  function isPresenceRecent(entry) {
    return entry && (Date.now() - entry.ts) < PRESENCE_TIMEOUT_MS;
  }

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
        startLiveUpdates();
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
      stopLiveUpdates();
      hasLoadedConversationsOnce = false;
      renderLogin();
    };
    await loadConversations();
    pollTimer = setInterval(loadConversations, 15000);
  }

  let hasLoadedConversationsOnce = false;

  async function loadConversations() {
    const list = document.getElementById('conv-list');
    if (!list) { stopPolling(); return; }
    try {
      conversationsCache = await API.getConversations();
      hasLoadedConversationsOnce = true;
      renderConversationRows();
    } catch (e) {
      // A failure on the very first load has nothing to fall back to
      // showing - leaving the loading spinner in place forever looks like
      // the app is frozen. Once something has loaded successfully at
      // least once, a later transient failure (a dropped poll) can stay
      // silent and just keep showing the last good state instead.
      if (!hasLoadedConversationsOnce) {
        list.innerHTML = `<div class="empty-state">
          <div class="empty-icon">\u26a0\ufe0f</div>
          <div class="empty-title">Couldn't load conversations</div>
          <div class="empty-sub">${esc(e.message || 'Check your connection and try again.')}</div>
          <button class="claim-btn" style="margin-top:14px" onclick="SupportApp.retryLoadConversations()">Retry</button>
        </div>`;
      }
    }
  }

  function retryLoadConversations() { loadConversations(); }

  function renderConversationRows() {
    const list = document.getElementById('conv-list');
    if (!list) return;
    const myId = myStaffId();
    list.innerHTML = conversationsCache.length ? conversationsCache.map(c => {
      const claim = c.claimedBy;
      const claimedByMe = claim && claim.staffId === myId;
      const viewing = presenceByCustomer[c.other_id];
      const viewingNow = isPresenceRecent(viewing) ? viewing : null;
      const attribution = c.last_message_staff_name ? `${esc(c.last_message_staff_name)}: ` : '';
      return `
        <div class="conv-row" onclick="SupportApp.openThread('${c.other_id}','${esc(c.other_name||'Customer').replace(/'/g,"\\'")}','${c.property_id||''}','${esc(c.property_title||'').replace(/'/g,"\\'")}')">
          <div class="conv-avatar" style="background:${avatarGradient(c.other_id)}">${esc((c.other_name||'C')[0].toUpperCase())}</div>
          <div class="conv-body">
            <div class="conv-top-row">
              <div class="conv-name">${esc(c.other_name || 'Customer')}</div>
              <div class="conv-time">${c.last_at ? timeAgoShort(c.last_at) : ''}</div>
            </div>
            ${c.property_title ? `<div class="conv-property">${esc(c.property_title)}</div>` : ''}
            <div class="conv-preview-row">
              <div class="conv-preview">${attribution}${esc(c.last_message || '')}</div>
              ${c.unread ? '<div class="conv-badge">1</div>' : ''}
            </div>
            <div class="conv-status-row">
              ${claim ? `<span class="claim-chip ${claimedByMe ? 'claim-chip--mine' : ''}">${claimedByMe ? 'You\u2019re handling this' : 'Claimed by ' + esc(claim.staffName)}</span>` : ''}
              ${viewingNow ? `<span class="presence-chip">\u{1F440} ${esc(viewingNow.staffName)} viewing</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('') : `<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-title">No conversations yet</div><div class="empty-sub">New customer chats will show up here.</div></div>`;
  }

  // ---- Chat thread ----
  let currentThread = null;

  function openThread(otherId, otherName, propertyId, propertyTitle) {
    currentView = 'thread';
    stopPolling();
    stopPresencePing();
    // Claim status comes from whatever the list last loaded — good enough
    // to paint the banner immediately; live updates (SSE) keep it correct
    // from here even if a colleague claims or releases it while this is open.
    const cached = conversationsCache.find(c => c.other_id === otherId);
    currentThread = { otherId, propertyId, claimedBy: cached ? cached.claimedBy : null };
    app.innerHTML = `
      <div class="header">
        <button class="icon-btn" id="back-to-list">←</button>
        <div class="header-avatar" style="background:${avatarGradient(otherId)}">${esc((otherName||'C')[0].toUpperCase())}</div>
        <div class="header-title-block">
          <div class="header-title">${esc(otherName)}</div>
          ${propertyTitle ? `<div class="header-sub">${esc(propertyTitle)}</div>` : ''}
        </div>
      </div>
      <div id="claim-banner" class="claim-banner"></div>
      <div id="thread-presence" class="thread-presence"></div>
      <div id="thread-messages" class="thread-messages"></div>
      <div class="thread-input-row">
        <input class="input" id="thread-input" placeholder="Type a message…" onkeydown="if(event.key==='Enter')SupportApp.send()">
        <button class="send-fab" id="send-btn" onclick="SupportApp.send()" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" width="19" height="19"><path d="M4 12L20 4L14 20L11 13L4 12Z" fill="currentColor"/></svg>
        </button>
      </div>
    `;
    document.getElementById('back-to-list').onclick = () => { stopPresencePing(); renderConversations(); };
    renderClaimBanner(currentThread.claimedBy);
    renderThreadPresence();
    loadThread();
    pollTimer = setInterval(loadThread, 8000);
    startPresencePing(otherId);
  }

  // Deliberate claim/release — not automatic on first reply, so a staff
  // member always sees a clear, honest "is anyone already on this?" signal
  // before choosing to engage, rather than the system silently deciding
  // for them.
  function renderClaimBanner(claimedBy) {
    const el = document.getElementById('claim-banner');
    if (!el || !currentThread) return;
    currentThread.claimedBy = claimedBy;
    const myId = myStaffId();
    if (!claimedBy) {
      el.innerHTML = `<span class="claim-banner-text">Unclaimed</span><button class="claim-btn" id="claim-btn">Claim</button>`;
      document.getElementById('claim-btn').onclick = doClaim;
    } else if (claimedBy.staffId === myId) {
      el.innerHTML = `<span class="claim-banner-text claim-banner-text--mine">You're handling this</span><button class="claim-btn claim-btn--release" id="release-btn">Release</button>`;
      document.getElementById('release-btn').onclick = doRelease;
    } else {
      el.innerHTML = `<span class="claim-banner-text claim-banner-text--other">Claimed by ${esc(claimedBy.staffName)}</span><button class="claim-btn" id="claim-btn">Take over</button>`;
      document.getElementById('claim-btn').onclick = doClaim;
    }
  }

  async function doClaim() {
    if (!currentThread) return;
    try {
      const r = await API.claimConversation(currentThread.otherId);
      renderClaimBanner(r.claimedBy);
    } catch (err) { toast(err.message || 'Could not claim conversation', 'error'); }
  }
  async function doRelease() {
    if (!currentThread) return;
    try {
      await API.releaseConversation(currentThread.otherId);
      renderClaimBanner(null);
    } catch (err) { toast(err.message || 'Could not release conversation', 'error'); }
  }

  // ---- Presence (live "someone's viewing this too") ----
  function startPresencePing(customerId) {
    API.pingPresence(customerId);
    presencePingTimer = setInterval(() => API.pingPresence(customerId), 10000);
  }
  function stopPresencePing() { clearInterval(presencePingTimer); presencePingTimer = null; }
  function renderThreadPresence() {
    const el = document.getElementById('thread-presence');
    if (!el || !currentThread) return;
    const viewing = presenceByCustomer[currentThread.otherId];
    el.innerHTML = isPresenceRecent(viewing) ? `\u{1F440} ${esc(viewing.staffName)} is also viewing this conversation` : '';
  }

  async function loadThread() {
    if (!currentThread) { stopPolling(); return; }
    const box = document.getElementById('thread-messages');
    if (!box) { stopPolling(); return; }
    try {
      const messages = await API.getThread(currentThread.otherId, currentThread.propertyId);
      const session = API.getSession();
      const myId = session ? session.owner.id : null;   // the shared SUPPORT_USER_ID when logged in as staff
      const myStaff = myStaffId();
      const wasNearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;

      if (!messages.length) {
        box.innerHTML = `<div class="empty-state"><div class="empty-icon">👋</div><div class="empty-sub">No messages yet</div></div>`;
        return;
      }

      // A message's real "identity" for grouping/alignment purposes: the
      // shared support account sends every staff member's messages under
      // the same sender_id, so sender_id alone can't tell two colleagues
      // apart, or tell a colleague's message apart from the customer's.
      // sender_staff_id (set server-side from the verified login token,
      // see handleSendMessage) is what actually distinguishes them.
      function identity(m) {
        return m.sender_id === myId && m.sender_staff_id ? ('staff:' + m.sender_staff_id) : m.sender_id;
      }
      function kind(m) {
        if (m.sender_id !== myId) return 'customer';
        return m.sender_staff_id === myStaff ? 'mine' : 'colleague';
      }

      // Group consecutive messages from the same real sender within 3
      // minutes of each other (tighter spacing, connected corner treatment
      // — reads as one "turn" instead of a wall of separately-boxed
      // bubbles), and drop in a sticky date separator whenever the
      // calendar day changes.
      let html = '';
      let lastDay = null;
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const k = kind(m);
        const day = new Date(m.created_at).toDateString();
        if (day !== lastDay) {
          html += `<div class="date-sep"><span>${dateSeparatorLabel(m.created_at)}</span></div>`;
          lastDay = day;
        }
        const groupedWithPrev = prev && identity(prev) === identity(m) && new Date(m.created_at) - new Date(prev.created_at) < 180000 && new Date(prev.created_at).toDateString() === day;
        const groupedWithNext = next && identity(next) === identity(m) && new Date(next.created_at) - new Date(m.created_at) < 180000 && new Date(next.created_at).toDateString() === day;
        const posClass = groupedWithPrev && groupedWithNext ? 'mid' : groupedWithPrev ? 'last' : groupedWithNext ? 'first' : 'solo';
        const aligned = k !== 'customer'; // both "mine" and "colleague" sit on the support side, matching what the customer actually sees
        // Editable/deletable from this app: any support-side message
        // (mine or a colleague's - the backend allows either, since all
        // staff share one account), as long as it isn't already deleted.
        // A customer's own message is never editable here regardless -
        // the backend would reject it anyway (sender_id wouldn't match).
        const isEditable = aligned && !m.deleted_at;
        const bodyDisplay = m.deleted_at
          ? '<span class="bubble-deleted">This message was deleted</span>'
          : esc(m.body || '');
        html += `
          <div class="bubble-row ${aligned ? 'mine' : ''} grp-${posClass}">
            ${k === 'colleague' && !groupedWithPrev ? `<div class="bubble-staff-label">${esc(m.sender_staff_name || 'Teammate')}</div>` : ''}
            <div class="bubble bubble--${k}" ${isEditable ? `data-msg-id="${m.id}" data-msg-body="${esc(m.body || '')}"` : ''}>${bodyDisplay}</div>
            ${!groupedWithNext ? `<div class="bubble-meta">
              <span class="bubble-time">${new Date(m.created_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</span>
              ${m.edited_at && !m.deleted_at ? '<span class="bubble-edited">edited</span>' : ''}
              ${aligned ? statusTicks(m.status) : ''}
            </div>` : ''}
          </div>
        `;
      }
      box.innerHTML = html;
      if (wasNearBottom) box.scrollTop = box.scrollHeight;
      wireMessageLongPress(box);
    } catch (e) { /* keep showing whatever loaded last */ }
  }

  let editingMessageId = null;

  async function send() {
    if (!currentThread) return;
    const input = document.getElementById('thread-input');
    const body = input.value.trim();
    if (!body) return;
    input.disabled = true;
    if (editingMessageId) {
      const idBeingEdited = editingMessageId;
      try {
        await API.editMessage(idBeingEdited, body);
        cancelEdit();
        await loadThread();
      } catch (err) {
        toast(err.message || 'Could not save edit', 'error');
      }
      input.disabled = false;
      input.focus();
      return;
    }
    input.value = '';
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

  // ---- Edit / delete message flow ----
  // Long-press (touch-and-hold, matching WhatsApp/Telegram/iMessage
  // convention) on any editable bubble opens a small action sheet. Uses
  // pointer events rather than touch-specific ones so this also works with
  // a mouse during development/testing, not just on a real device.
  function wireMessageLongPress(container) {
    let pressTimer = null;
    let pressedEl = null;
    const LONG_PRESS_MS = 480;

    function start(e) {
      const bubble = e.target.closest('.bubble[data-msg-id]');
      if (!bubble) return;
      pressedEl = bubble;
      pressTimer = setTimeout(() => {
        pressedEl = null;
        showMessageActions(bubble.dataset.msgId, bubble.dataset.msgBody);
      }, LONG_PRESS_MS);
    }
    function cancel() {
      clearTimeout(pressTimer);
      pressedEl = null;
    }
    container.addEventListener('pointerdown', start);
    container.addEventListener('pointerup', cancel);
    container.addEventListener('pointerleave', cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('scroll', cancel);
  }

  function showMessageActions(messageId, currentBody) {
    const sheet = document.createElement('div');
    sheet.className = 'action-sheet-backdrop';
    sheet.innerHTML = `
      <div class="action-sheet">
        <button class="action-sheet-item" id="act-edit">Edit</button>
        <button class="action-sheet-item action-sheet-item--danger" id="act-delete">Delete</button>
        <button class="action-sheet-item action-sheet-item--cancel" id="act-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(sheet);
    const close = () => sheet.remove();
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    document.getElementById('act-cancel').onclick = close;
    document.getElementById('act-edit').onclick = () => { close(); startEditMessage(messageId, currentBody); };
    document.getElementById('act-delete').onclick = () => { close(); showDeleteConfirm(messageId); };
  }

  function startEditMessage(messageId, currentBody) {
    editingMessageId = messageId;
    const input = document.getElementById('thread-input');
    if (input) { input.value = currentBody; input.focus(); }
    renderEditBanner();
  }

  function cancelEdit() {
    editingMessageId = null;
    const input = document.getElementById('thread-input');
    if (input) input.value = '';
    renderEditBanner();
  }

  function renderEditBanner() {
    const existing = document.getElementById('edit-banner');
    if (existing) existing.remove();
    if (!editingMessageId) return;
    const inputRow = document.querySelector('.thread-input-row');
    if (!inputRow) return;
    const banner = document.createElement('div');
    banner.id = 'edit-banner';
    banner.className = 'edit-banner';
    banner.innerHTML = `<span>Editing message</span><button id="cancel-edit-btn" aria-label="Cancel edit">\u2715</button>`;
    inputRow.parentNode.insertBefore(banner, inputRow);
    document.getElementById('cancel-edit-btn').onclick = cancelEdit;
  }

  function showDeleteConfirm(messageId) {
    const sheet = document.createElement('div');
    sheet.className = 'action-sheet-backdrop';
    sheet.innerHTML = `
      <div class="action-sheet">
        <div class="action-sheet-warning">Delete this message? This can't be undone.</div>
        <button class="action-sheet-item action-sheet-item--danger" id="act-confirm-delete">Delete</button>
        <button class="action-sheet-item action-sheet-item--cancel" id="act-cancel-delete">Cancel</button>
      </div>
    `;
    document.body.appendChild(sheet);
    const close = () => sheet.remove();
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    document.getElementById('act-cancel-delete').onclick = close;
    document.getElementById('act-confirm-delete').onclick = async () => {
      close();
      try {
        if (editingMessageId === messageId) cancelEdit();
        await API.deleteMessage(messageId);
        await loadThread();
      } catch (err) {
        toast(err.message || 'Could not delete message', 'error');
      }
    };
  }

  window.SupportApp = { openThread, send, toast, retryLoadConversations };

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
        stopPresencePing();
        renderConversations();
      } else {
        CapApp.exitApp();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireBackButton();
    if (API.isLoggedIn()) {
      startLiveUpdates();
      renderConversations();
      if (window.SupportPush) window.SupportPush.init();
    } else {
      renderLogin();
    }
  });
})(window);
