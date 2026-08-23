// ============================================================
// GeoEstate v2 — In-app chat (mobile)
// Mirrors the website's chat UI, talking to the same polling-based backend
// (GET /owner/conversations, GET/POST /owner/messages) — a "conversation" is
// derived from message pairs (other_user_id + property_id), not a separate
// table. See server.js's ensureMessagesTable comment for why this is
// polling-based rather than SSE-driven, matching this app's existing
// 30s-refresh pattern elsewhere.
// ============================================================
(function (window) {
  'use strict';

  const { esc, toast, openSheet, closeSheet } = window.GeoUtil;
  const API = window.GeoAPI;

  let pollTimer = null;

  function openConversationsList() {
    const user = API.getUser() || (API.getOwnerSession() || {}).owner;
    if (!user) {
      toast('Please sign in to view your messages', 'error');
      window.GeoApp.openAuth('login');
      return;
    }
    openSheet(`
      <div class="sheet__header"><div class="h4">Messages</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" id="conversations-body" style="min-height:200px;"><div class="page-loading"><div class="spinner"></div></div></div>
    `);
    renderConversationsList();
  }

  async function renderConversationsList() {
    const body = document.getElementById('conversations-body');
    if (!body) return;
    try {
      const conversations = await API.getConversations();
      if (!conversations.length) {
        body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">💬</div><div class="empty-state__title">No conversations yet</div><div class="empty-state__sub">Message a property owner from any listing to get started.</div></div>`;
        return;
      }
      body.innerHTML = conversations.map(c => `
        <div class="geo-card flex justify-between items-center mb-2" style="cursor:pointer" onclick='GeoChat.openChatThread(${JSON.stringify(c.other_id)}, ${JSON.stringify(c.other_name||"User")}, ${JSON.stringify(c.property_id||"")}, ${JSON.stringify(c.property_title||"")})'>
          <div style="min-width:0">
            <div class="font-bold text-sm">${esc(c.other_name || 'User')}${c.property_title ? ' · ' + esc(c.property_title) : ''}</div>
            <div class="text-xs text-muted mt-1" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.last_message || '')}</div>
          </div>
          ${c.unread ? '<div style="width:9px;height:9px;border-radius:50%;background:var(--g-400);flex-shrink:0;margin-left:10px"></div>' : ''}
        </div>
      `).join('');
    } catch (e) {
      body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__sub">Could not load messages.</div></div>`;
    }
  }

  function openChatThread(otherId, otherName, propertyId, propertyTitle) {
    const user = API.getUser() || (API.getOwnerSession() || {}).owner;
    if (!user) {
      toast('Please sign in to send a message', 'error');
      window.GeoApp.openAuth('login');
      return;
    }
    if (otherId === user.id) { toast("You can't message yourself", 'error'); return; }
    openSheet(`
      <div class="sheet__header">
        <div>
          <div class="h4">${esc(otherName || 'User')}</div>
          ${propertyTitle ? `<div class="text-xs text-muted">${esc(propertyTitle)}</div>` : ''}
        </div>
        <button class="geo-icon-btn" onclick="GeoChat.closeThread()">✕</button>
      </div>
      <div id="chat-messages" style="height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:0 4px 12px"></div>
      <div class="flex gap-2 px-4" style="padding-bottom:calc(var(--sp-4) + var(--safe-bottom))">
        <input class="input" id="chat-input" placeholder="Type a message…" style="flex:1" onkeydown="if(event.key==='Enter')GeoChat.send()">
        <button class="btn btn-primary" onclick="GeoChat.send()" style="flex-shrink:0">Send</button>
      </div>
    `, { persistent: true });
    document.getElementById('active-sheet').dataset.otherId = otherId;
    document.getElementById('active-sheet').dataset.propertyId = propertyId || '';
    document.getElementById('active-sheet').dataset.userId = user.id;
    loadThread();
    clearInterval(pollTimer);
    pollTimer = setInterval(loadThread, 10000);
  }

  function closeThread() {
    clearInterval(pollTimer);
    pollTimer = null;
    closeSheet();
  }

  async function loadThread() {
    const sheet = document.getElementById('active-sheet');
    if (!sheet) { clearInterval(pollTimer); pollTimer = null; return; }
    const otherId = sheet.dataset.otherId;
    const propertyId = sheet.dataset.propertyId;
    try {
      const messages = await API.getThread(otherId, propertyId);
      renderMessages(messages, sheet.dataset.userId);
    } catch (e) { /* keep showing whatever loaded last rather than clearing on a transient failure */ }
  }

  function renderMessages(messages, currentUserId) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const wasNearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
    box.innerHTML = messages.length ? messages.map(m => {
      const mine = m.sender_id === currentUserId;
      return `
        <div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:78%">
          <div style="background:${mine ? 'var(--g-400)' : 'rgba(255,255,255,0.06)'};color:${mine ? '#06170d' : 'inherit'};padding:9px 14px;border-radius:14px;font-size:.87rem;line-height:1.4;word-wrap:break-word">${esc(m.body || '')}</div>
          <div class="text-xs text-muted mt-1" style="text-align:${mine ? 'right' : 'left'}">${new Date(m.created_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      `;
    }).join('') : `<div class="empty-state"><div class="empty-state__icon">👋</div><div class="empty-state__sub">Say hello</div></div>`;
    if (wasNearBottom) box.scrollTop = box.scrollHeight;
  }

  async function send() {
    const sheet = document.getElementById('active-sheet');
    const input = document.getElementById('chat-input');
    if (!sheet || !input) return;
    const body = input.value.trim();
    if (!body) return;
    const otherId = sheet.dataset.otherId;
    const propertyId = sheet.dataset.propertyId;
    const user = API.getUser() || (API.getOwnerSession() || {}).owner;
    const senderName = user ? (user.fname + ' ' + (user.lname || '')).trim() : '';
    input.value = '';
    input.disabled = true;
    try {
      await API.sendMessage(otherId, body, propertyId, senderName);
      await loadThread();
    } catch (e) {
      toast('Could not send message — check your connection', 'error');
      input.value = body; // give it back so nothing typed gets lost
    }
    input.disabled = false;
    input.focus();
  }

  window.GeoChat = { openConversationsList, openChatThread, closeThread, send };
})(window);
