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

  // Consistent, distinguishable avatar color per person (hashed from their
  // id, not random) — mirrors the standalone Support app's redesign so the
  // two feel like the same product.
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

  function dateSeparatorLabel(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yest)) return 'Yesterday';
    return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  }

  // Sent (single check) / delivered (double check, gray) / read (double
  // check, blue) — see handleGetThread on the backend for how each status
  // is genuinely determined, not simulated.
  function statusTicks(status) {
    const color = status === 'read' ? '#53bdeb' : 'var(--text-muted)';
    const paths = status === 'sent'
      ? '<path d="M1 6.5L4.5 10L11 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M1 6.5L4.5 10L11 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6.5L11.5 10L18 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    return `<svg viewBox="0 0 20 12" fill="none" style="width:15px;height:9px;flex-shrink:0;color:${color}">${paths}</svg>`;
  }

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
        <div class="geo-card flex items-start mb-2" style="cursor:pointer;gap:12px" onclick='GeoChat.openChatThread(${JSON.stringify(c.other_id)}, ${JSON.stringify(c.other_name||"User")}, ${JSON.stringify(c.property_id||"")}, ${JSON.stringify(c.property_title||"")})'>
          <div style="width:44px;height:44px;border-radius:50%;background:${avatarGradient(c.other_id)};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#06170d;flex-shrink:0">${esc((c.other_name||'U')[0].toUpperCase())}</div>
          <div style="min-width:0;flex:1">
            <div class="flex justify-between items-baseline" style="gap:8px">
              <div class="font-bold text-sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.other_name || 'User')}</div>
              <div class="text-xs text-muted" style="flex-shrink:0">${c.last_at ? timeAgoShort(c.last_at) : ''}</div>
            </div>
            ${c.property_title ? `<div class="text-xs" style="color:var(--g-400);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.property_title)}</div>` : ''}
            <div class="flex justify-between items-center" style="gap:8px;margin-top:3px">
              <div class="text-xs text-muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">${esc(c.last_message || '')}</div>
              ${c.unread ? '<div style="min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--g-400);color:#06170d;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div>' : ''}
            </div>
          </div>
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
        <div class="flex items-center" style="gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:${avatarGradient(otherId)};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#06170d;flex-shrink:0">${esc((otherName||'U')[0].toUpperCase())}</div>
          <div>
            <div class="h4">${esc(otherName || 'User')}</div>
            ${propertyTitle ? `<div class="text-xs text-muted">${esc(propertyTitle)}</div>` : ''}
          </div>
        </div>
        <button class="geo-icon-btn" onclick="GeoChat.closeThread()">✕</button>
      </div>
      <div id="chat-messages" style="height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding:0 4px 12px"></div>
      <div class="flex gap-2 px-4 items-center" style="padding-bottom:calc(var(--sp-4) + var(--safe-bottom))">
        <input class="input" id="chat-input" placeholder="Type a message…" style="flex:1;border-radius:22px" onkeydown="if(event.key==='Enter')GeoChat.send()">
        <button onclick="GeoChat.send()" style="width:42px;height:42px;border-radius:50%;border:none;background:var(--g-400);color:#06170d;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M4 12L20 4L14 20L11 13L4 12Z" fill="currentColor"/></svg>
        </button>
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

    if (!messages.length) {
      box.innerHTML = `<div class="empty-state"><div class="empty-state__icon">👋</div><div class="empty-state__sub">Say hello</div></div>`;
      return;
    }

    // Group consecutive messages from the same sender within 3 minutes
    // (tighter spacing, connected corner treatment) and drop in a date
    // separator whenever the calendar day changes — mirrors the standalone
    // Support app's chat redesign so both feel like the same product.
    let html = '';
    let lastDay = null;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const mine = m.sender_id === currentUserId;
      const day = new Date(m.created_at).toDateString();
      if (day !== lastDay) {
        html += `<div class="flex justify-center" style="margin:14px 0 10px"><span class="text-xs text-muted" style="background:rgba(255,255,255,0.06);padding:5px 14px;border-radius:999px;font-weight:600">${dateSeparatorLabel(m.created_at)}</span></div>`;
        lastDay = day;
      }
      const groupedWithPrev = prev && prev.sender_id === m.sender_id && new Date(m.created_at) - new Date(prev.created_at) < 180000 && new Date(prev.created_at).toDateString() === day;
      const groupedWithNext = next && next.sender_id === m.sender_id && new Date(next.created_at) - new Date(m.created_at) < 180000 && new Date(next.created_at).toDateString() === day;
      // Only the "connecting" side flattens (right side for mine, left side
      // for theirs) — the other side always stays fully rounded.
      let bubbleRadius;
      if (mine) {
        bubbleRadius = (groupedWithPrev && groupedWithNext) ? '16px 4px 4px 16px'
          : groupedWithPrev ? '16px 4px 16px 16px'
          : '16px 16px 4px 16px'; // first or solo
      } else {
        bubbleRadius = (groupedWithPrev && groupedWithNext) ? '4px 16px 16px 4px'
          : groupedWithPrev ? '4px 16px 16px 16px'
          : '16px 16px 16px 4px'; // first or solo
      }
      const isEditable = mine && !m.deleted_at;
      const bodyDisplay = m.deleted_at
        ? '<span style="font-style:italic;color:var(--text-muted);opacity:0.75">This message was deleted</span>'
        : esc(m.body || '');
      html += `
        <div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:78%;display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'};margin-top:2px">
          <div class="chat-bubble" ${isEditable ? `data-msg-id="${m.id}" data-msg-body="${esc(m.body || '')}"` : ''} style="background:${mine ? 'var(--g-400)' : 'rgba(255,255,255,0.06)'};color:${mine ? '#06170d' : 'inherit'};padding:9px 13px;border-radius:${bubbleRadius};font-size:.87rem;line-height:1.4;word-wrap:break-word;box-shadow:0 1px 1px rgba(0,0,0,0.15);${isEditable ? 'cursor:pointer;-webkit-touch-callout:none;user-select:none' : ''}">${bodyDisplay}</div>
          ${!groupedWithNext ? `<div class="flex items-center" style="gap:4px;margin-top:3px;padding:0 2px">
            <span class="text-xs text-muted">${new Date(m.created_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</span>
            ${m.edited_at && !m.deleted_at ? '<span class="text-xs text-muted" style="font-style:italic">edited</span>' : ''}
            ${mine ? statusTicks(m.status) : ''}
          </div>` : ''}
        </div>
      `;
    }
    box.innerHTML = html;
    if (wasNearBottom) box.scrollTop = box.scrollHeight;
    wireMessageLongPress(box);
  }

  let editingMessageId = null;

  async function send() {
    const sheet = document.getElementById('active-sheet');
    const input = document.getElementById('chat-input');
    if (!sheet || !input) return;
    const body = input.value.trim();
    if (!body) return;
    const otherId = sheet.dataset.otherId;
    const propertyId = sheet.dataset.propertyId;
    input.disabled = true;
    if (editingMessageId) {
      const idBeingEdited = editingMessageId;
      try {
        await API.editMessage(idBeingEdited, body);
        cancelEdit();
        await loadThread();
      } catch (e) {
        toast('Could not save edit — check your connection', 'error');
      }
      input.disabled = false;
      input.focus();
      return;
    }
    const user = API.getUser() || (API.getOwnerSession() || {}).owner;
    const senderName = user ? (user.fname + ' ' + (user.lname || '')).trim() : '';
    input.value = '';
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

  // ---- Edit / delete message flow ----
  // Long-press (pointer events, so mouse works too during development) on
  // any of my own bubbles opens a small action sheet — mirrors the
  // standalone Support app's chat redesign so both feel like the same
  // product, not two different apps bolted together.
  function wireMessageLongPress(container) {
    let pressTimer = null;
    const LONG_PRESS_MS = 480;
    function start(e) {
      const bubble = e.target.closest('.chat-bubble[data-msg-id]');
      if (!bubble) return;
      pressTimer = setTimeout(() => showMessageActions(bubble.dataset.msgId, bubble.dataset.msgBody), LONG_PRESS_MS);
    }
    function cancel() { clearTimeout(pressTimer); }
    container.addEventListener('pointerdown', start);
    container.addEventListener('pointerup', cancel);
    container.addEventListener('pointerleave', cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('scroll', cancel);
  }

  function showMessageActions(messageId, currentBody) {
    const el = document.createElement('div');
    el.className = 'geo-action-sheet-backdrop';
    el.innerHTML = `
      <div class="geo-action-sheet">
        <button class="geo-action-sheet-item" id="geo-act-edit">Edit</button>
        <button class="geo-action-sheet-item geo-action-sheet-item--danger" id="geo-act-delete">Delete</button>
        <button class="geo-action-sheet-item geo-action-sheet-item--cancel" id="geo-act-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.getElementById('geo-act-cancel').onclick = close;
    document.getElementById('geo-act-edit').onclick = () => { close(); startEditMessage(messageId, currentBody); };
    document.getElementById('geo-act-delete').onclick = () => { close(); showDeleteConfirm(messageId); };
  }

  function startEditMessage(messageId, currentBody) {
    editingMessageId = messageId;
    const input = document.getElementById('chat-input');
    if (input) { input.value = currentBody; input.focus(); }
    renderEditBanner();
  }

  function cancelEdit() {
    editingMessageId = null;
    const input = document.getElementById('chat-input');
    if (input) input.value = '';
    renderEditBanner();
  }

  function renderEditBanner() {
    const existing = document.getElementById('geo-edit-banner');
    if (existing) existing.remove();
    if (!editingMessageId) return;
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const banner = document.createElement('div');
    banner.id = 'geo-edit-banner';
    banner.className = 'flex items-center justify-between';
    banner.style.cssText = 'padding:8px 14px;font-size:12.5px;font-weight:600;background:var(--bg-card);color:var(--g-300);border-radius:10px;margin:0 4px 8px';
    banner.innerHTML = `<span>Editing message</span><button id="geo-cancel-edit-btn" aria-label="Cancel edit" style="background:none;border:none;color:var(--text-secondary);font-size:15px;cursor:pointer;padding:2px 6px">\u2715</button>`;
    box.parentNode.insertBefore(banner, box.nextSibling);
    document.getElementById('geo-cancel-edit-btn').onclick = cancelEdit;
  }

  function showDeleteConfirm(messageId) {
    const el = document.createElement('div');
    el.className = 'geo-action-sheet-backdrop';
    el.innerHTML = `
      <div class="geo-action-sheet">
        <div class="geo-action-sheet-warning">Delete this message? This can't be undone.</div>
        <button class="geo-action-sheet-item geo-action-sheet-item--danger" id="geo-act-confirm-delete">Delete</button>
        <button class="geo-action-sheet-item geo-action-sheet-item--cancel" id="geo-act-cancel-delete">Cancel</button>
      </div>
    `;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.getElementById('geo-act-cancel-delete').onclick = close;
    document.getElementById('geo-act-confirm-delete').onclick = async () => {
      close();
      try {
        if (editingMessageId === messageId) cancelEdit();
        await API.deleteMessage(messageId);
        await loadThread();
      } catch (e) {
        toast('Could not delete message', 'error');
      }
    };
  }

  window.GeoChat = { openConversationsList, openChatThread, closeThread, send };
})(window);
