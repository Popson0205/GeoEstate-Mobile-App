// ============================================================
// GeoEstate v2 — Shared UI utilities: toast, sheet, spinner, esc
// ============================================================
(function (window) {
  'use strict';

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function fmtDate(d) {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return '';
      return dt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function timeAgo(d) {
    try {
      const dt = new Date(d).getTime();
      const s = Math.floor((Date.now() - dt) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      if (s < 604800) return Math.floor(s / 86400) + 'd ago';
      return fmtDate(d);
    } catch (e) { return ''; }
  }

  // ---- Toast ----
  let toastWrap = null;
  function toast(msg, type) {
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'toast-wrap';
      document.body.appendChild(toastWrap);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast--' + type : '');
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, 2600);
  }

  // ---- Bottom sheet ----
  function openSheet(innerHtml, opts) {
    opts = opts || {};
    closeSheet();
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.id = 'active-sheet';
    backdrop.innerHTML = '<div class="sheet">' + (opts.noHandle ? '' : '<div class="sheet__handle"></div>') + innerHtml + '</div>';
    if (!opts.persistent) {
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });
    }
    document.body.appendChild(backdrop);
    return backdrop;
  }
  function closeSheet() {
    const el = document.getElementById('active-sheet');
    if (el) el.remove();
  }

  // ---- Center modal (confirm dialogs) ----
  function confirmDialog(opts) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-center-backdrop';
      backdrop.innerHTML = `
        <div class="modal-center">
          <div class="h4 mb-2">${esc(opts.title || 'Confirm')}</div>
          <div class="text-muted text-sm mb-4">${esc(opts.message || '')}</div>
          <div class="flex gap-3">
            <button class="btn btn-outline w-full" id="cd-cancel">${esc(opts.cancelLabel || 'Cancel')}</button>
            <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'} w-full" id="cd-ok">${esc(opts.okLabel || 'Confirm')}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      backdrop.querySelector('#cd-cancel').onclick = () => { backdrop.remove(); resolve(false); };
      backdrop.querySelector('#cd-ok').onclick = () => { backdrop.remove(); resolve(true); };
    });
  }

  function setBtnLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
    } else {
      btn.disabled = false;
      btn.innerHTML = label !== undefined ? label : (btn.dataset.label || btn.innerHTML);
    }
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  window.GeoUtil = { esc, fmtDate, timeAgo, toast, openSheet, closeSheet, confirmDialog, setBtnLoading, debounce };
})(window);
