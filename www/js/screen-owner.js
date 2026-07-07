// ============================================================
// GeoEstate v2 — Native Owner Dashboard
// Add/Manage Property, Units, Enquiries — all in-app, no browser hand-off
// ============================================================
(function (window) {
  'use strict';
  const { esc, openSheet, closeSheet, toast, setBtnLoading, timeAgo, confirmDialog } = window.GeoUtil;
  const API = window.GeoAPI;

  async function render(main) {
    if (!API.isOwnerLoggedIn()) {
      main.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🗂️</div>
          <div class="empty-state__title">Owner Dashboard</div>
          <div class="empty-state__sub mb-6">Sign in as a property owner to list and manage properties, track enquiries, and view units — all natively, right here.</div>
          <button class="btn btn-primary" onclick="GeoApp.openAuth('owner')">Sign in as Owner</button>
        </div>`;
      return;
    }
    main.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`;
    let profile;
    try { profile = await API.ownerProfile(); }
    catch (e) {
      main.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Could not load dashboard</div><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="geo-section">
        <div class="flex justify-between items-center mb-4">
          <div>
            <div class="h3">Hi, ${esc(profile.fname)} 👋</div>
            <div class="text-muted text-sm">${esc(profile.propertyCount)} propert${profile.propertyCount===1?'y':'ies'} listed</div>
          </div>
          ${profile.is_verified ? '<span class="pill pill--green">✓ Verified</span>' : '<span class="pill pill--amber">Unverified</span>'}
        </div>
        ${!profile.is_verified ? `
          <div class="geo-card mb-4" style="border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.08);">
            <div class="font-bold text-sm mb-1">⚠️ Identity verification required</div>
            <div class="text-xs text-muted mb-3">You must verify your identity once before you can list properties.</div>
            <button class="btn btn-sm btn-primary" onclick="GeoRouter.go('verify')">Verify Now</button>
          </div>` : ''}
        <div class="grid-2">
          <button class="geo-card clickable" style="text-align:left;" onclick="GeoOwner.openAddProperty()">
            <div style="font-size:22px;">➕</div><div class="font-bold text-sm mt-2">Add Property</div>
          </button>
          <button class="geo-card clickable" style="text-align:left;" onclick="GeoOwner.showEnquiries()">
            <div style="font-size:22px;">📬</div><div class="font-bold text-sm mt-2">Enquiries</div>
          </button>
        </div>
      </div>
      <div class="geo-section" style="padding-top:0;">
        <div class="chip-row mb-3" id="owner-type-chips">
          ${['all','rent','buy','lease'].map((t,i) => `<div class="chip ${i===0?'active':''}" data-type="${t}">${t[0].toUpperCase()+t.slice(1)}</div>`).join('')}
        </div>
        <div id="owner-properties">${window.GeoScreens.skeletonCards(2)}</div>
      </div>
    `;

    document.querySelectorAll('#owner-type-chips .chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('#owner-type-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        loadOwnerProperties(chip.dataset.type);
      };
    });
    loadOwnerProperties('all');
  }

  async function loadOwnerProperties(type) {
    const box = document.getElementById('owner-properties');
    if (!box) return;
    box.innerHTML = window.GeoScreens.skeletonCards(2);
    try {
      const props = await API.ownerProperties(type === 'all' ? null : type);
      if (!props.length) {
        box.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🏘️</div><div class="empty-state__title">No properties yet</div><div class="empty-state__sub">Tap "Add Property" to list your first one.</div></div>`;
        return;
      }
      box.innerHTML = `<div class="prop-list">` + props.map(p => `
        <div class="geo-card">
          <div class="flex justify-between items-start">
            <div style="min-width:0;flex:1;">
              <div class="font-bold truncate">${esc(p.title)}</div>
              <div class="text-sm text-accent font-bold mt-1">${esc(p.price)}</div>
              <div class="text-xs text-muted mt-1">📍 ${esc(p.location)}</div>
            </div>
            <span class="pill ${p.status==='live'?'pill--green':p.status==='pending'?'pill--amber':'pill--gray'}">${esc(p.status||'pending')}</span>
          </div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-sm btn-ghost w-full" onclick="GeoRouter.go('detail',{id:'${esc(p.id)}'})">View</button>
            <button class="btn btn-sm btn-outline w-full" onclick="GeoOwner.openUnits('${esc(p.id)}','${esc(p.title)}')">Units${p.unit_count?' ('+p.unit_count+')':''}</button>
          </div>
        </div>
      `).join('') + `</div>`;
    } catch (e) {
      box.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Couldn't load properties</div><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
    }
  }

  // ---- Add Property flow (multi-step, in-app) ----
  function openAddProperty() {
    const html = `
      <div class="sheet__header"><div class="h4">List a Property</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" id="addprop-body"></div>
    `;
    openSheet(html, { persistent: true });
    renderAddPropStep1();
  }

  function renderAddPropStep1() {
    const body = document.getElementById('addprop-body');
    body.innerHTML = `
      <div class="field"><label>Listing Type</label>
        <select class="input" id="ap-type">
          <option value="rent">Rent</option><option value="buy">Buy / Sale</option><option value="lease">Lease</option>
        </select>
      </div>
      <div class="field"><label>Property Title</label><input class="input" id="ap-title" placeholder="e.g. 3-Bed Duplex, Lekki"></div>
      <div class="input-row">
        <div class="field w-full"><label>State</label><input class="input" id="ap-state"></div>
        <div class="field w-full"><label>LGA</label><input class="input" id="ap-lga"></div>
      </div>
      <div class="field"><label>Address</label><input class="input" id="ap-address"></div>
      <div class="input-row">
        <div class="field w-full"><label>Bedrooms</label><input class="input" id="ap-bed" type="number"></div>
        <div class="field w-full"><label>Bathrooms</label><input class="input" id="ap-bath" type="number"></div>
      </div>
      <div class="field" id="ap-price-field"><label>Monthly Rent (₦)</label><input class="input" id="ap-price" type="number"></div>
      <div class="field"><label>Description</label><textarea class="input" id="ap-desc"></textarea></div>
      <button class="btn btn-primary btn-block" id="ap-next">Continue</button>
    `;
    document.getElementById('ap-type').onchange = (e) => {
      const t = e.target.value;
      const field = document.getElementById('ap-price-field');
      field.innerHTML = t === 'rent' ? '<label>Monthly Rent (₦)</label><input class="input" id="ap-price" type="number">'
        : t === 'buy' ? '<label>Sale Price (₦)</label><input class="input" id="ap-price" type="number">'
        : '<label>Annual Lease Price (₦)</label><input class="input" id="ap-price" type="number">';
    };
    document.getElementById('ap-next').onclick = async (e) => {
      const title = document.getElementById('ap-title').value.trim();
      const listing_type = document.getElementById('ap-type').value;
      const price = document.getElementById('ap-price').value;
      if (!title) return toast('Property title is required', 'error');
      if (!price) return toast('Price is required', 'error');
      const payload = {
        title, listing_type,
        state: document.getElementById('ap-state').value.trim(),
        lga: document.getElementById('ap-lga').value.trim(),
        address: document.getElementById('ap-address').value.trim(),
        bedrooms: document.getElementById('ap-bed').value || null,
        bathrooms: document.getElementById('ap-bath').value || null,
        description: document.getElementById('ap-desc').value.trim()
      };
      if (listing_type === 'rent') payload.monthly_rent = price;
      else if (listing_type === 'buy') payload.sale_price = price;
      else payload.lease_price = price;

      setBtnLoading(e.target, true);
      try {
        const res = await API.ownerAddProperty(payload);
        toast(res.message || 'Property submitted for review', 'success');
        closeSheet();
        loadOwnerProperties('all');
      } catch (err) {
        if (err.data && err.data.needsVerification) {
          toast('Please verify your identity first', 'error');
          closeSheet();
          window.GeoRouter.go('verify');
        } else {
          toast(err.message || 'Could not submit property', 'error');
        }
      }
      setBtnLoading(e.target, false, 'Continue');
    };
  }

  // ---- Units management ----
  async function openUnits(propId, title) {
    const html = `
      <div class="sheet__header"><div class="h4">Units — ${esc(title)}</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" id="units-body"><div class="page-loading"><div class="spinner"></div></div></div>
    `;
    openSheet(html);
    try {
      const d = await API.ownerUnits(propId);
      const units = d.units || [];
      const body = document.getElementById('units-body');
      body.innerHTML = `
        ${units.length ? `<div class="stat-grid mb-4" style="grid-template-columns:repeat(3,1fr);">
          <div><div class="stat-num">${d.stats?.total||units.length}</div><div class="stat-label">Total</div></div>
          <div><div class="stat-num text-accent">${d.stats?.vacant||0}</div><div class="stat-label">Vacant</div></div>
          <div><div class="stat-num">${d.stats?.occupied||0}</div><div class="stat-label">Occupied</div></div>
        </div>` : ''}
        <div class="prop-list mb-4">
        ${units.length ? units.map(u => `
          <div class="geo-card flex justify-between items-center">
            <div><div class="font-bold">${esc(u.unit_label)}</div><div class="text-xs text-muted">${esc(u.unit_type||'')} ${u.monthly_price?'· ₦'+Number(u.monthly_price).toLocaleString():''}</div></div>
            <span class="pill ${u.status==='vacant'?'pill--green':'pill--gray'}">${esc(u.status||'vacant')}</span>
          </div>
        `).join('') : `<div class="empty-state"><div class="empty-state__icon">🏢</div><div class="empty-state__title">No units yet</div><div class="empty-state__sub">Add units below to manage multi-unit properties.</div></div>`}
        </div>
        <div class="field"><label>Unit Label</label><input class="input" id="unit-label" placeholder="e.g. Room 3, Flat 2B"></div>
        <div class="input-row">
          <div class="field w-full"><label>Type</label><input class="input" id="unit-type" placeholder="Room / Flat / Shop"></div>
          <div class="field w-full"><label>Price (₦/mo)</label><input class="input" id="unit-price" type="number"></div>
        </div>
        <button class="btn btn-primary btn-block" id="unit-add">Add Unit</button>
      `;
      document.getElementById('unit-add').onclick = async (e) => {
        const unit_label = document.getElementById('unit-label').value.trim();
        if (!unit_label) return toast('Unit label required', 'error');
        setBtnLoading(e.target, true);
        try {
          await API.ownerAddUnit(propId, {
            unit_label,
            unit_type: document.getElementById('unit-type').value.trim(),
            monthly_price: document.getElementById('unit-price').value || null
          });
          toast('Unit added', 'success');
          openUnits(propId, title);
        } catch (err) { toast(err.message || 'Could not add unit', 'error'); }
        setBtnLoading(e.target, false, 'Add Unit');
      };
    } catch (e) {
      document.getElementById('units-body').innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
    }
  }

  // ---- Enquiries ----
  async function showEnquiries() {
    const html = `
      <div class="sheet__header"><div class="h4">Enquiries</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" id="enq-body" style="min-height:200px;"><div class="page-loading"><div class="spinner"></div></div></div>
    `;
    openSheet(html);
    try {
      const list = await API.ownerEnquiries();
      const body = document.getElementById('enq-body');
      if (!list.length) {
        body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__title">No enquiries yet</div><div class="empty-state__sub">Enquiries from interested renters/buyers will show up here.</div></div>`;
        return;
      }
      body.innerHTML = `<div class="prop-list">` + list.map(en => `
        <div class="geo-card">
          <div class="flex justify-between items-start">
            <div class="font-bold">${esc(en.name)}</div>
            <span class="text-xs text-muted">${timeAgo(en.created_at)}</span>
          </div>
          <div class="text-xs text-muted mt-1">${esc(en.property_title || en.property_id)}</div>
          <div class="text-sm mt-2">${esc(en.message||'')}</div>
          <div class="flex gap-3 mt-3 text-xs text-accent">
            <a href="mailto:${esc(en.email)}">✉️ ${esc(en.email)}</a>
            ${en.phone ? `<a href="tel:${esc(en.phone)}">📞 ${esc(en.phone)}</a>` : ''}
          </div>
        </div>
      `).join('') + `</div>`;
    } catch (e) {
      document.getElementById('enq-body').innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
    }
  }

  window.GeoOwner = { openAddProperty, openUnits, showEnquiries, loadOwnerProperties };
  window.GeoRouter.register('owner', render);
})(window);
