// ============================================================
// GeoEstate v2 — Property Detail screen
// ============================================================
(function (window) {
  'use strict';
  const { esc, openSheet, closeSheet, toast, setBtnLoading } = window.GeoUtil;
  const API = window.GeoAPI;

  // ---- Start Transaction / escrow transfer (mirrors website's payment modal) ----
  const GEOESTATE_ACCOUNT = { name: 'GeoEstate NIG Limited', bank: 'Guaranty Trust Bank (GTB)', number: '0264374326' };
  function generateRef() { return 'GEO-' + Math.random().toString(36).substr(2, 4).toUpperCase() + '-' + new Date().getFullYear(); }

  function amenityIcon(a) {
    const map = { parking:'🚗', water:'💧', security:'🛡️', generator:'⚡', pool:'🏊', gym:'🏋️', furnished:'🛋️', wifi:'📶', gated:'🚧', ac:'❄️' };
    const key = String(a).toLowerCase().replace(/\s+/g,'');
    for (const k in map) if (key.includes(k)) return map[k];
    return '✓';
  }

  async function render(main, params) {
    const id = params.id;
    if (!id) { window.GeoRouter.go('browse'); return; }
    main.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`;
    let p;
    try { p = await API.getProperty(id); }
    catch (e) {
      main.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Property not found</div><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
      return;
    }
    const images = (p.images && p.images.length ? p.images : (p.img ? [p.img] : []));
    const amenities = p.amenities || [];

    main.innerHTML = `
      <div style="position:relative;">
        <div id="detail-gallery" style="width:100%;aspect-ratio:4/3;background:var(--bg-elevated);overflow-x:auto;overflow-y:hidden;display:flex;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
          ${images.length ? images.map(im => `<img src="${esc(im)}" style="width:100%;flex:0 0 100%;scroll-snap-align:start;object-fit:cover;" onerror="this.style.display='none'">`).join('')
            : `<div class="flex items-center justify-center" style="width:100%;flex:0 0 100%;font-size:48px;opacity:.25;">🏠</div>`}
        </div>
        <button class="geo-icon-btn" style="position:absolute;top:var(--sp-4);left:var(--sp-4);background:rgba(0,0,0,0.5);z-index:2;" onclick="history.back()">←</button>
        <span class="pill pill--green" style="position:absolute;top:var(--sp-4);right:var(--sp-4);z-index:2;">${esc((p.listing_type||'rent').toUpperCase())}</span>
        ${images.length > 1 ? `<div id="gallery-counter" style="position:absolute;bottom:var(--sp-3);right:var(--sp-3);background:rgba(0,0,0,.6);color:#fff;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;z-index:2;">1 / ${images.length}</div>` : ''}
        ${p.video_url ? `<button id="detail-video-btn" style="position:absolute;bottom:var(--sp-3);left:var(--sp-3);background:rgba(26,107,60,.9);color:#fff;border:none;border-radius:999px;padding:5px 14px;font-size:11px;font-weight:700;z-index:2;cursor:pointer;">▶ Video Tour</button>` : ''}
      </div>
      <div class="geo-section">
        <div class="h2">${esc(p.price)}</div>
        <div class="h4 mt-2" style="font-weight:600;">${esc(p.title)}</div>
        <div class="text-muted text-sm mt-2">📍 ${esc(p.address || p.location)}</div>

        <div class="grid-3 mt-4">
          ${p.bedrooms ? `<div class="geo-card text-center"><div class="h4">${esc(p.bedrooms)}</div><div class="text-xs text-muted">Bedrooms</div></div>` : ''}
          ${p.bathrooms ? `<div class="geo-card text-center"><div class="h4">${esc(p.bathrooms)}</div><div class="text-xs text-muted">Bathrooms</div></div>` : ''}
          ${p.size_sqm ? `<div class="geo-card text-center"><div class="h4">${esc(p.size_sqm)}</div><div class="text-xs text-muted">sqm</div></div>` : ''}
        </div>

        ${p.description ? `<div class="mt-6"><div class="h4 mb-2">Description</div><div class="text-muted text-sm" style="line-height:1.6;">${esc(p.description)}</div></div>` : ''}

        ${amenities.length ? `<div class="mt-6"><div class="h4 mb-3">Amenities</div><div class="grid-2">
          ${amenities.map(a => `<div class="flex items-center gap-2 text-sm"><span>${amenityIcon(a)}</span>${esc(a)}</div>`).join('')}
        </div></div>` : ''}

        ${p.units && p.units.length ? `<div class="mt-6"><div class="h4 mb-3">Units (${p.units.length})</div>
          <div class="prop-list">
          ${p.units.map(u => `<div class="geo-card flex justify-between items-center">
            <div><div class="font-bold">${esc(u.unit_label)}</div><div class="text-xs text-muted">${esc(u.unit_type||'')}</div></div>
            <span class="pill ${u.status==='vacant'?'pill--green':'pill--gray'}">${esc(u.status||'—')}</span>
          </div>`).join('')}
          </div></div>` : ''}

        <div class="mt-6">
          <div class="verified-banner">
            <div style="font-size:22px;">✅</div>
            <div><div class="font-bold text-sm">Owner Identity Verified</div><div class="text-xs text-muted">NIN checked. Title documents on file.</div></div>
          </div>
        </div>

        <div class="mt-6">
          <div class="geo-card" style="background:linear-gradient(135deg,var(--g-600),var(--g-700));">
            <div class="h4 mb-2" style="color:#fff;">Start Transaction</div>
            <div class="text-xs mb-3" style="color:rgba(255,255,255,.85);">Transfer funds to our verified account. Team confirms within 2 hours.</div>
            <button class="btn w-full" id="detail-start-txn" style="background:#fff;color:var(--g-700);font-weight:700;">Start Transaction →</button>
            <div class="text-xs mt-2" style="color:rgba(255,255,255,.7);">🔒 10% platform fee · Lawyer review on high-value deals</div>
          </div>
        </div>
      </div>
      <div class="geo-section" style="position:sticky;bottom:0;background:var(--bg-app);border-top:1px solid var(--border-soft);">
        <div class="flex gap-3">
          <button class="btn btn-outline w-full" id="detail-whatsapp">💬 WhatsApp</button>
          <button class="btn btn-primary w-full" id="detail-enquire">Enquire Now</button>
        </div>
      </div>
    `;

    document.getElementById('detail-enquire').onclick = () => openEnquiryForm(p);
    document.getElementById('detail-start-txn').onclick = () => openPaymentSheet(p);
    document.getElementById('detail-whatsapp').onclick = () => {
      const team = API.team()[0];
      const msg = encodeURIComponent(`Hi, I'm interested in "${p.title}" (${p.price}). Is it still available?`);
      window.open(`https://wa.me/${team.whatsapp}?text=${msg}`, '_system');
    };
    if (images.length > 1) {
      const galEl = document.getElementById('detail-gallery');
      const counterEl = document.getElementById('gallery-counter');
      galEl.addEventListener('scroll', () => {
        const idx = Math.round(galEl.scrollLeft / galEl.clientWidth);
        if (counterEl) counterEl.textContent = (Math.min(idx, images.length - 1) + 1) + ' / ' + images.length;
      });
    }
    if (p.video_url) {
      document.getElementById('detail-video-btn').onclick = () => openVideoSheet(p.video_url, p.title);
    }
  }

  function openVideoSheet(url, title) {
    const html = `
      <div class="sheet__header"><div class="h4">${esc(title)} — Video Tour</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4">
        <video src="${esc(url)}" controls playsinline style="width:100%;max-height:60vh;border-radius:var(--r-md);background:#000;"></video>
      </div>
    `;
    openSheet(html);
  }

  function openEnquiryForm(p) {
    const user = API.getUser();
    const html = `
      <div class="sheet__header"><div class="h4">Enquire about this property</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4">
        <div class="field"><label>Full Name</label><input class="input" id="enq-name" value="${esc(user ? (user.fname+' '+(user.lname||'')) : '')}"></div>
        <div class="field"><label>Email</label><input class="input" id="enq-email" type="email" value="${esc(user ? user.email : '')}"></div>
        <div class="field"><label>Phone</label><input class="input" id="enq-phone" type="tel" value="${esc(user ? user.phone||'' : '')}"></div>
        <div class="field"><label>Message</label><textarea class="input" id="enq-msg" placeholder="I'm interested in this property…"></textarea></div>
        <button class="btn btn-primary btn-block" id="enq-submit">Send Enquiry</button>
      </div>
    `;
    openSheet(html);
    document.getElementById('enq-submit').onclick = async (e) => {
      const name = document.getElementById('enq-name').value.trim();
      const email = document.getElementById('enq-email').value.trim();
      const phone = document.getElementById('enq-phone').value.trim();
      const message = document.getElementById('enq-msg').value.trim();
      if (!name || !email) return toast('Name and email are required', 'error');
      setBtnLoading(e.target, true);
      try {
        await API.submitEnquiry({ property_id: p.id, property_title: p.title, name, email, phone, message });
        toast('Enquiry sent! Our team will reach out shortly.', 'success');
        closeSheet();
      } catch (err) { toast(err.message || 'Could not send enquiry', 'error'); }
      setBtnLoading(e.target, false, 'Send Enquiry');
    };
  }

  function openPaymentSheet(p) {
    const rawAmount = parseInt(String(p.price || '0').replace(/[^0-9]/g, '')) || 0;
    const ref = generateRef();
    const html = `
      <div class="sheet__header"><div class="h4">Complete Your Payment</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4">
        <div class="geo-card mb-4" style="background:#3a2a0a;box-shadow:inset 0 0 0 1px var(--amber-400);font-size:var(--fs-xs);line-height:1.6;color:var(--amber-400);">
          📢 <strong>Phase 1 — Manual Bank Transfer:</strong> Our sales team will contact you with the correct payment account details before any transaction is finalised. Do not transfer to any account unless confirmed by GeoEstate staff.
        </div>
        <div class="geo-card text-center mb-4" style="background:linear-gradient(135deg,var(--g-600),var(--g-700));">
          <div class="text-xs" style="color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.06em;">Total Amount to Transfer</div>
          <div class="h2" style="color:#fff;margin:6px 0;">${rawAmount ? '₦' + rawAmount.toLocaleString('en-NG') : 'Contact us for amount'}</div>
          <div class="text-xs" style="color:rgba(255,255,255,.65);">Includes 10% GeoEstate platform fee</div>
        </div>
        <div class="geo-card mb-3">
          <div class="flex justify-between items-center mb-2"><span class="text-sm text-muted">Account Name</span><span class="text-sm font-bold">${esc(GEOESTATE_ACCOUNT.name)}</span></div>
          <div class="flex justify-between items-center mb-2"><span class="text-sm text-muted">Bank</span><span class="text-sm font-bold">${esc(GEOESTATE_ACCOUNT.bank)}</span></div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-muted">Account Number</span>
            <span class="flex items-center gap-2">
              <span class="font-bold" style="font-family:monospace;letter-spacing:.06em;">${esc(GEOESTATE_ACCOUNT.number)}</span>
              <button class="pill pill--green" id="pay-copy-btn" style="cursor:pointer;border:none;">Copy</button>
            </span>
          </div>
          <div class="flex justify-between items-center"><span class="text-sm text-muted">Transfer Narration</span><span class="text-sm font-bold" style="color:var(--g-400);font-family:monospace;">${ref}</span></div>
        </div>
        <div class="geo-card mb-4" style="background:#3a2a0a;box-shadow:inset 0 0 0 1px var(--amber-400);font-size:var(--fs-xs);line-height:1.6;color:var(--amber-400);">
          ⚠️ <strong>Important:</strong> Include reference <strong>${ref}</strong> in your transfer narration so we can match your payment.
        </div>
        <input type="file" id="receipt-file-input" accept="image/*,.pdf" style="display:none">
        <div id="receipt-dropzone" style="border:2px dashed var(--border-soft);border-radius:var(--r-md);padding:14px;text-align:center;color:var(--text-muted);font-size:var(--fs-xs);margin-bottom:var(--sp-4);cursor:pointer;">
          📎 Tap to upload transfer receipt / screenshot <strong>(required)</strong><br>
          <span style="font-size:10px;">JPG, PNG or PDF</span>
        </div>
        <button class="btn btn-primary w-full" id="pay-confirm-btn">✅ I've Made the Transfer — Notify GeoEstate</button>
        <div class="text-xs text-muted text-center mt-3">Questions? Call or WhatsApp us — +234 916 042 0100</div>
      </div>
    `;
    openSheet(html);
    let receiptUrl = null;
    const dz = document.getElementById('receipt-dropzone');
    const fileInput = document.getElementById('receipt-file-input');
    dz.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      dz.innerHTML = '⏳ Uploading receipt…';
      try {
        receiptUrl = await API.uploadFile(file, 'geoestate/payment-receipts');
        dz.innerHTML = '✅ ' + esc(file.name) + ' uploaded<br><span style="font-size:10px;color:var(--g-400);">Tap to replace</span>';
      } catch (err) {
        receiptUrl = null;
        dz.innerHTML = '⚠️ Upload failed — tap to try again<br><span style="font-size:10px;">JPG, PNG or PDF</span>';
        toast(err.message || 'Could not upload receipt', 'error');
      }
    };
    document.getElementById('pay-copy-btn').onclick = () => {
      navigator.clipboard.writeText(GEOESTATE_ACCOUNT.number).then(() => {
        const b = document.getElementById('pay-copy-btn');
        if (b) { b.textContent = 'Copied ✓'; setTimeout(() => { if (b) b.textContent = 'Copy'; }, 2000); }
      }).catch(() => {});
    };
    document.getElementById('pay-confirm-btn').onclick = async (e) => {
      if (!receiptUrl) {
        toast('Please upload your transfer receipt/screenshot before continuing', 'error');
        return;
      }
      const user = API.getUser();
      const buyerName = user ? (user.fname + ' ' + (user.lname || '')).trim() : '';
      setBtnLoading(e.target, true);
      try {
        await API.submitPayment({
          ref, property_id: p.id, property_title: p.title,
          buyer_name: buyerName, buyer_email: user ? user.email : '', buyer_phone: user ? (user.phone || '') : '',
          owner: p.owner || '', amount: rawAmount, receipt_url: receiptUrl,
          prop: p.title, buyer: buyerName, phone: user ? (user.phone || '') : ''
        });
        closeSheet();
        openPaymentSuccessSheet(ref);
      } catch (err) {
        toast(err.message || 'Could not notify GeoEstate — try again', 'error');
        setBtnLoading(e.target, false, "✅ I've Made the Transfer — Notify GeoEstate");
      }
    };
  }

  function openPaymentSuccessSheet(ref) {
    const html = `
      <div class="px-4 text-center" style="padding-top:var(--sp-4);padding-bottom:var(--sp-6);">
        <div style="font-size:48px;margin-bottom:12px;">🎉</div>
        <div class="h3 mb-2">Payment Notification Sent!</div>
        <div class="text-sm text-muted mb-4" style="line-height:1.6;">Our team will confirm your transfer within <strong>2 hours</strong> and contact you to proceed with the handover.</div>
        <div class="geo-card mb-4" style="background:var(--bg-elevated);">
          <div class="text-xs text-muted">Your Reference Number</div>
          <div class="h4" style="color:var(--g-400);font-family:monospace;">${ref}</div>
        </div>
        <div class="text-xs text-muted mb-4">Save this reference. You'll need it if you contact us about this transaction.</div>
        <button class="btn btn-primary w-full" onclick="GeoUtil.closeSheet()">Done</button>
      </div>
    `;
    openSheet(html);
  }

  window.GeoRouter.register('detail', render);
})(window);
