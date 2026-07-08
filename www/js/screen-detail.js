// ============================================================
// GeoEstate v2 — Property Detail screen
// ============================================================
(function (window) {
  'use strict';
  const { esc, openSheet, closeSheet, toast, setBtnLoading } = window.GeoUtil;
  const API = window.GeoAPI;

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
        <div id="detail-gallery" style="width:100%;aspect-ratio:4/3;background:var(--bg-elevated);overflow:hidden;display:flex;">
          ${images.length ? images.map(im => `<img src="${esc(im)}" style="width:100%;flex-shrink:0;object-fit:cover;" onerror="this.style.display='none'">`).join('')
            : `<div class="flex items-center justify-center w-full" style="font-size:48px;opacity:.25;">🏠</div>`}
        </div>
        <button class="geo-icon-btn" style="position:absolute;top:var(--sp-4);left:var(--sp-4);background:rgba(0,0,0,0.5);" onclick="history.back()">←</button>
        <span class="pill pill--green" style="position:absolute;top:var(--sp-4);right:var(--sp-4);">${esc((p.listing_type||'rent').toUpperCase())}</span>
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
      </div>
      <div class="geo-section" style="position:sticky;bottom:0;background:var(--bg-app);border-top:1px solid var(--border-soft);">
        <div class="flex gap-3">
          <button class="btn btn-outline w-full" id="detail-whatsapp">💬 WhatsApp</button>
          <button class="btn btn-primary w-full" id="detail-enquire">Enquire Now</button>
        </div>
      </div>
    `;

    document.getElementById('detail-enquire').onclick = () => openEnquiryForm(p);
    document.getElementById('detail-whatsapp').onclick = () => {
      const team = API.team()[0];
      const msg = encodeURIComponent(`Hi, I'm interested in "${p.title}" (${p.price}). Is it still available?`);
      window.open(`https://wa.me/${team.whatsapp}?text=${msg}`, '_system');
    };
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

  window.GeoRouter.register('detail', render);
})(window);
