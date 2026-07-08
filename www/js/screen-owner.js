// ============================================================
// GeoEstate v2 — Native Owner Dashboard
// Add/Manage Property, Units, Enquiries — all in-app, no browser hand-off
//
// The "Add Property" flow below mirrors the website's
// owner-dashboard.html workflow field-for-field: pick a
// transaction type (Rent / Sell / Lease), fill the type-specific
// form, and submit the same payload shape to POST /owner/add-property.
// ============================================================
(function (window) {
  'use strict';
  const { esc, openSheet, closeSheet, toast, setBtnLoading, timeAgo, confirmDialog } = window.GeoUtil;
  const API = window.GeoAPI;
  const NG = window.GeoNigeria;

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

  // ══════════════════════════════════════════════════════════
  // Add Property — transaction-type aware (Rent / Sell / Lease)
  // Mirrors owner-dashboard.html's submitAddProperty() workflow.
  // ══════════════════════════════════════════════════════════

  function openAddProperty() {
    const html = `
      <div class="sheet__header"><div class="h4">List a Property</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" id="addprop-body"><div class="page-loading"><div class="spinner"></div></div></div>
    `;
    openSheet(html, { persistent: true });
    renderAddPropGate();
  }

  async function renderAddPropGate() {
    const body = document.getElementById('addprop-body');
    if (!body) return;
    let profile = null;
    try { const p = await API.ownerProfile(); profile = p; } catch (e) { profile = null; }

    let banner = '';
    if (profile && !profile.is_verified) {
      if (profile.status === 'review') {
        banner = `<div class="geo-card mb-4" style="border-color:rgba(59,130,246,0.35);background:rgba(59,130,246,0.08);">
          <div class="font-bold text-sm mb-1">🔍 Verification under review</div>
          <div class="text-xs text-muted">Your identity documents are being reviewed (usually 24–48 hours). You can keep filling this in — it'll only go live once approved.</div>
        </div>`;
      } else {
        body.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">🪪</div>
            <div class="empty-state__title">Verify Your Identity to List a Property</div>
            <div class="empty-state__sub mb-6">This only needs to be done once, and usually takes a few minutes.</div>
            <button class="btn btn-primary" onclick="GeoUtil.closeSheet();GeoRouter.go('verify')">Verify Now</button>
          </div>`;
        return;
      }
    }

    body.innerHTML = `
      ${banner}
      <div class="field">
        <label>What type of transaction is this?</label>
        <div class="chip-row" id="ap-txn-chips">
          <div class="chip active" data-type="rent">🔑 Rent</div>
          <div class="chip" data-type="buy">🏠 Sell</div>
          <div class="chip" data-type="lease">📋 Lease</div>
        </div>
      </div>
      <div id="ap-form-area"></div>
    `;
    document.querySelectorAll('#ap-txn-chips .chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('#ap-txn-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderFormArea(chip.dataset.type);
      };
    });
    renderFormArea('rent');
  }

  function sectionTitle(label) {
    return `<div class="text-xs font-bold text-muted mt-4 mb-3" style="text-transform:uppercase;letter-spacing:.04em;padding-top:14px;border-top:1px solid var(--border-soft);">${label}</div>`;
  }

  function uploadBox(label, sub, hiddenId, btnLabel, statusId) {
    return `
      <div class="geo-card mb-3" id="${hiddenId}-wrap" style="border-style:dashed;">
        <div class="font-bold text-sm mb-1">${label}</div>
        <div class="text-xs text-muted mb-3">${sub}</div>
        <button type="button" class="btn btn-outline btn-sm w-full" data-upload-btn="${hiddenId}">${btnLabel}</button>
        <input type="hidden" id="${hiddenId}">
        <div id="${statusId}" style="display:none;margin-top:8px;font-size:12px;color:var(--g-400);font-weight:600;">✅ Uploaded</div>
      </div>`;
  }

  const RENT_PROP_TYPES = [
    ['flat','Flat / Apartment'],['house','House / Duplex'],['room','Self-Contain / Room'],
    ['bungalow','Bungalow'],['shortlet-apartment','Shortlet Apartment'],['shortlet-studio','Studio Apartment'],
    ['shortlet-villa','Villa / Luxury Home'],['office','Office Space'],['shop','Shop / Store'],
    ['warehouse','Warehouse'],['land','Land']
  ];
  const BUY_PROP_TYPES = [
    ['flat','Flat / Apartment'],['house','House / Duplex'],['bungalow','Bungalow'],['terraced','Terraced House'],
    ['detached','Detached House'],['semi-detached','Semi-Detached'],['mansion','Mansion / Villa'],
    ['office','Commercial Office'],['shop','Shop / Plaza'],['warehouse','Warehouse / Factory'],
    ['land','Land / Plot'],['estate','Estate Unit']
  ];
  const LEASE_PROP_TYPES = [
    ['office','Office Space'],['shop','Shop / Retail Space'],['warehouse','Warehouse / Storage'],
    ['factory','Factory / Industrial'],['land','Land / Plot'],['plaza','Plaza / Mall Unit'],
    ['residential','Residential Property'],['mixed-use','Mixed-Use Building']
  ];

  function optHTML(list) {
    return '<option value="">Select type</option>' + list.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');
  }

  function renderFormArea(type) {
    const area = document.getElementById('ap-form-area');
    if (!area) return;
    if (type === 'rent') area.innerHTML = rentFormHTML();
    else if (type === 'buy') area.innerHTML = buyFormHTML();
    else area.innerHTML = leaseFormHTML();
    wireFormArea(type);
  }

  function rentFormHTML() {
    return `
      <div class="field"><label>Property Title *</label><input class="input" id="fp-title" placeholder="e.g. 3-Bedroom Flat in Lekki Phase 1"></div>

      <div class="field">
        <label>Rental Category *</label>
        <div class="input-row" id="rent-cat-chips">
          <button type="button" class="btn btn-outline w-full" data-cat="standard" style="border-color:var(--g-500);color:var(--g-400);">🏠 Standard Tenancy</button>
          <button type="button" class="btn btn-outline w-full" data-cat="shortlet">🌟 Shortlet</button>
        </div>
        <input type="hidden" id="fp-rent-category" value="standard">
      </div>

      <div class="field"><label>Property Type *</label><select class="input" id="fp-prop-type">${optHTML(RENT_PROP_TYPES)}</select></div>

      <div id="fp-price-standard-wrap" class="field"><label>Annual Rent (₦) *</label><input class="input" id="fp-annual-rent" type="number" placeholder="e.g. 1200000"></div>
      <div id="fp-price-shortlet-wrap" class="field hidden"><label>Price per Night (₦) *</label><input class="input" id="fp-nightly-rate" type="number" placeholder="e.g. 35000"></div>

      <div id="fp-standard-fields">
        <div class="input-row">
          <div class="field w-full"><label>Tenancy Duration</label>
            <select class="input" id="fp-rent-frequency">
              <option value="annual" selected>Annual — 1 Year</option>
              <option value="biannual">Bi-Annual — 6 Months</option>
              <option value="quarterly">Quarterly — 3 Months</option>
              <option value="monthly">Monthly</option>
              <option value="2years">2 Years</option>
              <option value="3years">3 Years</option>
            </select>
          </div>
          <div class="field w-full"><label>Advance Payment</label>
            <select class="input" id="fp-advance">
              <option value="1year">1 Year Advance</option>
              <option value="2years">2 Years Advance</option>
              <option value="6months">6 Months Advance</option>
              <option value="3months">3 Months Advance</option>
              <option value="negotiable">Negotiable</option>
            </select>
          </div>
        </div>
      </div>

      <div id="fp-shortlet-fields" class="hidden">
        <div class="input-row">
          <div class="field w-full"><label>Minimum Stay (Nights)</label>
            <select class="input" id="fp-min-nights">
              <option value="1">1 Night</option><option value="2">2 Nights</option>
              <option value="3" selected>3 Nights</option><option value="5">5 Nights</option>
              <option value="7">1 Week</option><option value="14">2 Weeks</option><option value="30">1 Month</option>
            </select>
          </div>
          <div class="field w-full"><label>Maximum Stay (Nights)</label>
            <select class="input" id="fp-max-nights">
              <option value="7">7 Nights</option><option value="14">14 Nights</option>
              <option value="30" selected>30 Nights</option><option value="60">60 Nights</option>
              <option value="90">90 Nights</option><option value="none">No Limit</option>
            </select>
          </div>
        </div>
        <div class="input-row">
          <div class="field w-full"><label>Weekend Rate (₦/night)</label><input class="input" id="fp-weekend-rate" type="number" placeholder="Optional"></div>
          <div class="field w-full"><label>Cleaning Fee (₦)</label><input class="input" id="fp-cleaning-fee" type="number" placeholder="Optional"></div>
        </div>
        <div class="input-row">
          <div class="field w-full"><label>Check-in from</label><input class="input" id="fp-checkin-time" type="time" value="14:00"></div>
          <div class="field w-full"><label>Check-out by</label><input class="input" id="fp-checkout-time" type="time" value="11:00"></div>
        </div>
        <div class="field"><label>Shortlet House Rules</label><textarea class="input" id="fp-shortlet-rules" placeholder="e.g. No parties, no smoking indoors..."></textarea></div>
      </div>

      <div class="input-row">
        <div class="field w-full"><label>Caution / Security Deposit (₦)</label><input class="input" id="fp-caution-fee" type="number" placeholder="Optional"></div>
        <div class="field w-full"><label>Agency Fee (₦)</label><input class="input" id="fp-agency-fee" type="number" placeholder="Optional"></div>
      </div>

      <div class="field">
        <label>What's included in the rent?</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="ri-water" value="Water"> Water</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="ri-electricity" value="Electricity"> Electricity</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="ri-security" value="Security"> Security</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="ri-internet" value="Internet"> Internet</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="ri-waste" value="Waste Disposal"> Waste Disposal</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="ri-parking" value="Parking"> Parking</label>
        </div>
      </div>

      ${sectionTitle('📍 Location')}
      <div class="input-row">
        <div class="field w-full"><label>State *</label><select class="input" id="fp-state">${NG.stateOptionsHTML()}</select></div>
        <div class="field w-full"><label>LGA / Area *</label><select class="input" id="fp-lga" disabled><option value="">— Select State first —</option></select></div>
      </div>
      <div class="field"><label>Full Address *</label><input class="input" id="fp-address" placeholder="e.g. 12 Akin Adesola Street, Lekki Phase 1"></div>
      <div class="field"><label>Nearest Landmark</label><input class="input" id="fp-landmark" placeholder="e.g. Close to Shoprite"></div>

      ${sectionTitle('🏗️ Property Details')}
      <div class="input-row">
        <div class="field w-full"><label>Bedrooms</label><input class="input" id="fp-beds" type="number" min="0"></div>
        <div class="field w-full"><label>Bathrooms</label><input class="input" id="fp-baths" type="number" min="0"></div>
        <div class="field w-full"><label>Toilets</label><input class="input" id="fp-toilets" type="number" min="0"></div>
      </div>
      <div class="input-row">
        <div class="field w-full"><label>Size (sqm)</label><input class="input" id="fp-sqm" type="number" min="0"></div>
        <div class="field w-full"><label>Year Built</label><input class="input" id="fp-year-built" type="number" min="1900" max="2026"></div>
      </div>
      <div class="field"><label>Description *</label><textarea class="input" id="fp-desc" placeholder="Layout, condition, neighbourhood, access, security..."></textarea></div>
      <div class="field"><label>Amenities (comma-separated)</label><input class="input" id="fp-amenities" placeholder="e.g. Parking, Security, Generator, CCTV"></div>
      <div class="field"><label>Furnishing Status</label>
        <select class="input" id="fp-furnishing">
          <option value="unfurnished">Unfurnished</option><option value="semi-furnished">Semi-Furnished</option><option value="furnished">Fully Furnished</option>
        </select>
      </div>

      ${sectionTitle('👤 Tenant Requirements')}
      <div class="input-row">
        <div class="field w-full"><label>Who can rent this?</label>
          <select class="input" id="fp-tenant-type">
            <option value="anyone">Anyone</option><option value="family">Family only</option>
            <option value="single">Single occupant</option><option value="corporate">Corporate / Company</option><option value="students">Students</option>
          </select>
        </div>
        <div class="field w-full"><label>Pets Allowed?</label>
          <select class="input" id="fp-pets"><option value="no">No Pets</option><option value="yes">Pets Allowed</option><option value="negotiable">Negotiable</option></select>
        </div>
      </div>

      ${sectionTitle('📸 Media & Documents')}
      ${uploadBox('Main Property Photo', 'Optional — shown on the listing card', 'fp-img', '📸 Upload Photo', 'fp-img-status')}
      ${uploadBox('Tenancy Agreement', 'Optional — your standard agreement template', 'fp-rent-agreement', '📎 Upload Agreement', 'fp-rent-agreement-status')}

      <div class="field"><label>Notes for Admin (optional)</label><textarea class="input" id="fp-notes"></textarea></div>
      <button class="btn btn-primary btn-block" id="ap-submit-rent">Submit Rental Listing →</button>
    `;
  }

  function buyFormHTML() {
    return `
      <div class="field"><label>Property Title *</label><input class="input" id="buy-title" placeholder="e.g. 4-Bedroom Detached Duplex in Banana Island"></div>
      <div class="input-row">
        <div class="field w-full"><label>Property Type *</label><select class="input" id="buy-prop-type">${optHTML(BUY_PROP_TYPES)}</select></div>
        <div class="field w-full"><label>Asking Price (₦) *</label><input class="input" id="buy-sale-price" type="number" placeholder="e.g. 45000000"></div>
      </div>
      <div class="input-row">
        <div class="field w-full"><label>Price negotiable?</label>
          <select class="input" id="buy-negotiable">
            <option value="no">Fixed Price</option><option value="yes">Open to Negotiation</option><option value="installment">Installment Available</option>
          </select>
        </div>
        <div class="field w-full"><label>Property Tenure</label>
          <select class="input" id="buy-tenure">
            <option value="freehold">Freehold</option><option value="leasehold">Leasehold</option><option value="right-of-occupancy">Right of Occupancy (C of O)</option>
          </select>
        </div>
      </div>

      ${sectionTitle('📍 Location')}
      <div class="input-row">
        <div class="field w-full"><label>State *</label><select class="input" id="buy-state">${NG.stateOptionsHTML()}</select></div>
        <div class="field w-full"><label>LGA / Area *</label><select class="input" id="buy-lga" disabled><option value="">— Select State first —</option></select></div>
      </div>
      <div class="field"><label>Full Address *</label><input class="input" id="buy-address" placeholder="e.g. 12 Bourdillon Road, Ikoyi, Lagos"></div>
      <div class="field"><label>Nearest Landmark</label><input class="input" id="buy-landmark" placeholder="e.g. Opposite Silverbird Cinemas"></div>

      ${sectionTitle('🏗️ Property Details')}
      <div class="input-row">
        <div class="field w-full"><label>Bedrooms</label><input class="input" id="buy-beds" type="number" min="0"></div>
        <div class="field w-full"><label>Bathrooms</label><input class="input" id="buy-baths" type="number" min="0"></div>
        <div class="field w-full"><label>Toilets</label><input class="input" id="buy-toilets" type="number" min="0"></div>
      </div>
      <div class="input-row">
        <div class="field w-full"><label>Land Size (sqm)</label><input class="input" id="buy-land-sqm" type="number" min="0"></div>
        <div class="field w-full"><label>Building Size (sqm)</label><input class="input" id="buy-sqm" type="number" min="0"></div>
      </div>
      <div class="input-row">
        <div class="field w-full"><label>Year Built</label><input class="input" id="buy-year-built" type="number" min="1900" max="2026"></div>
        <div class="field w-full"><label>No. of Floors</label><input class="input" id="buy-floors" type="number" min="0"></div>
      </div>
      <div class="field"><label>Description *</label><textarea class="input" id="buy-desc" placeholder="Construction quality, finishes, estate facilities, access..."></textarea></div>
      <div class="field"><label>Amenities (comma-separated)</label><input class="input" id="buy-amenities" placeholder="e.g. Swimming Pool, BQ, Smart Home, Solar"></div>
      <div class="field"><label>Furnishing Status</label>
        <select class="input" id="buy-furnishing"><option value="unfurnished">Unfurnished</option><option value="semi-furnished">Semi-Furnished</option><option value="furnished">Fully Furnished</option></select>
      </div>

      ${sectionTitle('⚖️ Legal Documents — at least 1 required')}
      <div id="buy-doc-error" class="hidden mb-3" style="color:var(--danger);font-size:13px;font-weight:600;background:rgba(229,72,77,0.1);padding:10px 14px;border-radius:var(--r-md);">⚠️ Please upload at least one legal document before submitting a sale listing.</div>
      ${uploadBox('📜 Certificate of Occupancy (C of O)', 'Government issued land/property certificate', 'buy-doc-coo', '📎 Upload C of O', 'buy-doc-coo-status')}
      ${uploadBox('📝 Deed of Assignment', 'Transfer of ownership from seller to buyer', 'buy-doc-deed', '📎 Upload Deed', 'buy-doc-deed-status')}
      ${uploadBox('🗺️ Survey Plan', 'Registered land survey document', 'buy-doc-survey', '📎 Upload Survey', 'buy-doc-survey-status')}
      ${uploadBox('🏛️ Building Approval / Permit', 'Planning or development permit', 'buy-doc-approval', '📎 Upload Permit', 'buy-doc-approval-status')}

      ${sectionTitle('📸 Media & Sale Agreement')}
      ${uploadBox('Main Property Photo', 'Optional — shown on the listing card', 'buy-img', '📸 Upload Photo', 'buy-img-status')}
      ${uploadBox('Sale / Purchase Agreement', 'Optional — Sale and Purchase Agreement (SPA) template', 'buy-sale-agreement', '📎 Upload Sale Agreement', 'buy-sale-agreement-status')}

      <div class="field"><label>Notes for Admin (optional)</label><textarea class="input" id="buy-notes"></textarea></div>
      <button class="btn btn-primary btn-block" id="ap-submit-buy">Submit Sale Listing →</button>
    `;
  }

  function leaseFormHTML() {
    return `
      <div class="field"><label>Property Title *</label><input class="input" id="lease-title" placeholder="e.g. Commercial Property on Adeola Odeku for Lease"></div>
      <div class="input-row">
        <div class="field w-full"><label>Property Type *</label><select class="input" id="lease-prop-type">${optHTML(LEASE_PROP_TYPES)}</select></div>
        <div class="field w-full"><label>Lease Type</label>
          <select class="input" id="lease-type">
            <option value="commercial">Commercial Lease</option><option value="residential">Residential Lease</option>
            <option value="ground">Ground Lease (Land only)</option><option value="finance">Finance Lease</option>
          </select>
        </div>
      </div>

      ${sectionTitle('💰 Lease Pricing')}
      <div class="input-row">
        <div class="field w-full"><label>Lease Price / Annual Fee (₦) *</label><input class="input" id="lease-price" type="number" placeholder="e.g. 3600000"></div>
        <div class="field w-full"><label>Payment Frequency</label>
          <select class="input" id="lease-payment-freq">
            <option value="annual">Annual</option><option value="biannual">Bi-Annual</option><option value="quarterly">Quarterly</option><option value="lump-sum">Lump Sum</option>
          </select>
        </div>
      </div>
      <div class="input-row">
        <div class="field w-full"><label>Lease Duration (Years) *</label>
          <select class="input" id="lease-duration">
            <option value="1">1 Year</option><option value="2">2 Years</option><option value="3">3 Years</option><option value="5">5 Years</option>
            <option value="10">10 Years</option><option value="15">15 Years</option><option value="20">20 Years</option><option value="25">25 Years</option>
            <option value="50">50 Years</option><option value="99">99 Years</option><option value="custom">Custom (specify in notes)</option>
          </select>
        </div>
        <div class="field w-full"><label>Commencement Date</label><input class="input" id="lease-start-date" type="date"></div>
      </div>
      <div class="input-row">
        <div class="field w-full"><label>Renewal Option?</label>
          <select class="input" id="lease-renewal"><option value="no">No Renewal</option><option value="yes">Available</option><option value="negotiable">Negotiable</option></select>
        </div>
        <div class="field w-full"><label>Escalation (% annual)</label><input class="input" id="lease-escalation" type="number" min="0" max="100" placeholder="Optional"></div>
      </div>

      ${sectionTitle('📍 Location')}
      <div class="input-row">
        <div class="field w-full"><label>State *</label><select class="input" id="lease-state">${NG.stateOptionsHTML()}</select></div>
        <div class="field w-full"><label>LGA / Area *</label><select class="input" id="lease-lga" disabled><option value="">— Select State first —</option></select></div>
      </div>
      <div class="field"><label>Full Address *</label><input class="input" id="lease-address" placeholder="e.g. Plot 14, Adeola Odeku Street, VI"></div>
      <div class="field"><label>Nearest Landmark</label><input class="input" id="lease-landmark" placeholder="e.g. Opposite EcoBank HQ"></div>

      ${sectionTitle('🏗️ Property Specifications')}
      <div class="input-row">
        <div class="field w-full"><label>Total Land Area (sqm)</label><input class="input" id="lease-land-sqm" type="number"></div>
        <div class="field w-full"><label>Usable / Built-up Area (sqm)</label><input class="input" id="lease-sqm" type="number"></div>
      </div>
      <div class="input-row">
        <div class="field w-full"><label>No. of Floors</label><input class="input" id="lease-floors" type="number" min="0"></div>
        <div class="field w-full"><label>Parking Spaces</label><input class="input" id="lease-parking" type="number" min="0"></div>
      </div>
      <div class="field"><label>Current Usage / Condition</label>
        <select class="input" id="lease-condition">
          <option value="new">Brand New</option><option value="good">Good Condition</option><option value="fair">Fair Condition</option>
          <option value="shell">Shell (not finished)</option><option value="bare-land">Bare Land</option>
        </select>
      </div>
      <div class="field"><label>Permitted Use / Activity</label><input class="input" id="lease-permitted-use" placeholder="e.g. Office use, Retail, Residential"></div>
      <div class="field"><label>Description *</label><textarea class="input" id="lease-desc" placeholder="Structure, current state, facilities, access, zoning..."></textarea></div>
      <div class="field"><label>Facilities & Amenities (comma-separated)</label><input class="input" id="lease-amenities" placeholder="e.g. 3-phase power, Borehole, Generator"></div>

      ${sectionTitle('📋 Lease Agreement & Supporting Docs')}
      ${uploadBox('Lease Agreement', 'Optional — the lease agreement document', 'lease-agreement', '📎 Upload Lease Agreement', 'lease-agreement-status')}
      ${uploadBox('📜 C of O / Title Document', 'Optional — proof of ownership', 'lease-doc-coo', '📎 Upload', 'lease-doc-coo-status')}
      ${uploadBox('🗺️ Survey Plan', 'Optional — registered survey document', 'lease-doc-survey', '📎 Upload', 'lease-doc-survey-status')}

      ${sectionTitle('📸 Media')}
      ${uploadBox('Main Property Photo', 'Optional — shown on the listing card', 'lease-img', '📸 Upload Photo', 'lease-img-status')}

      <div class="field"><label>Notes for Admin (optional)</label><textarea class="input" id="lease-notes"></textarea></div>
      <button class="btn btn-primary btn-block" id="ap-submit-lease">Submit Lease Listing →</button>
    `;
  }

  // ---- Wiring: cascading state/LGA, rent-category toggle, uploads, submit ----
  function wireFormArea(type) {
    if (type === 'rent') {
      NG.wireStateLga('fp-state', 'fp-lga');
      wireRentCategoryToggle();
      wireUpload('fp-img', 'fp-img-status', 'geoestate/property-images', false);
      wireUpload('fp-rent-agreement', 'fp-rent-agreement-status', 'geoestate/documents', true);
      document.getElementById('ap-submit-rent').onclick = (e) => submitAddProperty('rent', e.target);
    } else if (type === 'buy') {
      NG.wireStateLga('buy-state', 'buy-lga');
      wireUpload('buy-img', 'buy-img-status', 'geoestate/property-images', false);
      ['buy-doc-coo','buy-doc-deed','buy-doc-survey','buy-doc-approval','buy-sale-agreement'].forEach(id => {
        wireUpload(id, id + '-status', 'geoestate/documents', true);
      });
      document.getElementById('ap-submit-buy').onclick = (e) => submitAddProperty('buy', e.target);
    } else {
      NG.wireStateLga('lease-state', 'lease-lga');
      wireUpload('lease-img', 'lease-img-status', 'geoestate/property-images', false);
      ['lease-agreement','lease-doc-coo','lease-doc-survey'].forEach(id => {
        wireUpload(id, id + '-status', 'geoestate/documents', true);
      });
      document.getElementById('ap-submit-lease').onclick = (e) => submitAddProperty('lease', e.target);
    }
  }

  function wireRentCategoryToggle() {
    const chips = document.querySelectorAll('#rent-cat-chips [data-cat]');
    chips.forEach(btn => {
      btn.onclick = () => {
        const cat = btn.dataset.cat;
        document.getElementById('fp-rent-category').value = cat;
        chips.forEach(b => {
          const active = b.dataset.cat === cat;
          b.style.borderColor = active ? 'var(--g-500)' : '';
          b.style.color = active ? 'var(--g-400)' : '';
        });
        const isShortlet = cat === 'shortlet';
        document.getElementById('fp-price-standard-wrap').classList.toggle('hidden', isShortlet);
        document.getElementById('fp-price-shortlet-wrap').classList.toggle('hidden', !isShortlet);
        document.getElementById('fp-standard-fields').classList.toggle('hidden', isShortlet);
        document.getElementById('fp-shortlet-fields').classList.toggle('hidden', !isShortlet);
      };
    });
  }

  // Generic upload wiring — no `capture` attribute (that broke camera-only
  // uploads before), lets the user pick from gallery/files as well as camera.
  function wireUpload(hiddenId, statusId, folder, isDoc) {
    const btn = document.querySelector(`[data-upload-btn="${hiddenId}"]`);
    if (!btn) return;
    btn.onclick = () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = isDoc ? '.pdf,.jpg,.jpeg,.png,.webp' : 'image/*';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        document.body.removeChild(fileInput);
        if (!file) return;
        setBtnLoading(btn, true);
        try {
          const url = await API.uploadFile(file, folder);
          document.getElementById(hiddenId).value = url;
          const statusEl = document.getElementById(statusId);
          if (statusEl) statusEl.style.display = 'block';
          const wrap = document.getElementById(hiddenId + '-wrap');
          if (wrap) { wrap.style.borderColor = 'var(--g-500)'; wrap.style.background = 'rgba(61,179,116,0.06)'; }
          toast(isDoc ? 'Document uploaded' : 'Photo uploaded', 'success');
        } catch (err) {
          toast('Upload failed: ' + (err.message || 'try again'), 'error');
        }
        setBtnLoading(btn, false, isDoc ? '📎 Uploaded ✓' : '📸 Uploaded ✓');
      };
      fileInput.click();
    };
  }

  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function num(id) { const v = document.getElementById(id) ? document.getElementById(id).value : ''; return v ? parseFloat(v) : null; }
  function intval(id) { const v = document.getElementById(id) ? document.getElementById(id).value : ''; return v ? parseInt(v, 10) : null; }
  function checked(id) { const el = document.getElementById(id); return el && el.checked; }

  async function submitAddProperty(lt, btn) {
    let payload = {};

    if (lt === 'rent') {
      const title = val('fp-title');
      if (!title) return toast('Please enter a property title', 'error');
      const rentCategory = val('fp-rent-category') || 'standard';
      const includes = ['ri-water','ri-electricity','ri-security','ri-internet','ri-waste','ri-parking']
        .filter(id => checked(id)).map(id => document.getElementById(id).value);

      if (rentCategory === 'shortlet') {
        const nightlyRate = num('fp-nightly-rate');
        if (!nightlyRate) return toast('Please enter the price per night', 'error');
        payload = {
          title, listing_type: 'rent', rent_category: 'shortlet',
          property_type: val('fp-prop-type'),
          nightly_rate: nightlyRate, monthly_rent: nightlyRate * 30,
          price: '₦' + nightlyRate.toLocaleString() + '/night',
          min_nights: intval('fp-min-nights') || 1,
          max_nights: val('fp-max-nights') || null,
          weekend_rate: num('fp-weekend-rate'),
          cleaning_fee: num('fp-cleaning-fee'),
          checkin_time: val('fp-checkin-time'),
          checkout_time: val('fp-checkout-time'),
          house_rules: val('fp-shortlet-rules'),
          caution_fee: num('fp-caution-fee'),
          rent_includes: includes,
          furnishing: val('fp-furnishing'),
          state: val('fp-state'), lga: val('fp-lga'), address: val('fp-address'), landmark: val('fp-landmark'),
          bedrooms: intval('fp-beds'), bathrooms: intval('fp-baths'), toilets: intval('fp-toilets'),
          size_sqm: num('fp-sqm'), year_built: intval('fp-year-built'),
          description: val('fp-desc'),
          amenities: val('fp-amenities').split(',').map(s => s.trim()).filter(Boolean),
          img: val('fp-img'), agreement_doc: val('fp-rent-agreement') || null,
          notes: val('fp-notes')
        };
      } else {
        const annualRent = num('fp-annual-rent');
        if (!annualRent) return toast('Please enter the annual rent amount', 'error');
        payload = {
          title, listing_type: 'rent', rent_category: 'standard',
          property_type: val('fp-prop-type'),
          annual_rent: annualRent, monthly_rent: Math.round(annualRent / 12),
          price: '₦' + annualRent.toLocaleString() + '/yr',
          rent_frequency: val('fp-rent-frequency'), advance_payment: val('fp-advance'),
          caution_fee: num('fp-caution-fee'), agency_fee: num('fp-agency-fee'),
          rent_includes: includes, tenant_type: val('fp-tenant-type'), pets_allowed: val('fp-pets'),
          state: val('fp-state'), lga: val('fp-lga'), address: val('fp-address'), landmark: val('fp-landmark'),
          bedrooms: intval('fp-beds'), bathrooms: intval('fp-baths'), toilets: intval('fp-toilets'),
          size_sqm: num('fp-sqm'), year_built: intval('fp-year-built'),
          description: val('fp-desc'),
          amenities: val('fp-amenities').split(',').map(s => s.trim()).filter(Boolean),
          img: val('fp-img'), agreement_doc: val('fp-rent-agreement') || null,
          notes: val('fp-notes')
        };
      }
    } else if (lt === 'buy') {
      const title = val('buy-title');
      if (!title) return toast('Please enter a property title', 'error');
      const salePrice = num('buy-sale-price');
      if (!salePrice) return toast('Please enter the asking price', 'error');
      const docUploaded = ['buy-doc-coo','buy-doc-deed','buy-doc-survey','buy-doc-approval'].some(id => val(id));
      if (!docUploaded) {
        document.getElementById('buy-doc-error').classList.remove('hidden');
        return toast('Please upload at least one legal document for a sale listing', 'error');
      }
      document.getElementById('buy-doc-error').classList.add('hidden');
      payload = {
        title, listing_type: 'buy', property_type: val('buy-prop-type'),
        sale_price: salePrice, price: '₦' + salePrice.toLocaleString(),
        negotiable: val('buy-negotiable'), tenure: val('buy-tenure'),
        state: val('buy-state'), lga: val('buy-lga'), address: val('buy-address'), landmark: val('buy-landmark'),
        bedrooms: intval('buy-beds'), bathrooms: intval('buy-baths'), toilets: intval('buy-toilets'),
        land_size_sqm: num('buy-land-sqm'), size_sqm: num('buy-sqm'),
        year_built: intval('buy-year-built'), floors: intval('buy-floors'),
        description: val('buy-desc'),
        amenities: val('buy-amenities').split(',').map(s => s.trim()).filter(Boolean),
        furnishing: val('buy-furnishing'),
        doc_coo: val('buy-doc-coo') || null, doc_deed: val('buy-doc-deed') || null,
        doc_survey: val('buy-doc-survey') || null, doc_approval: val('buy-doc-approval') || null,
        sale_agreement: val('buy-sale-agreement') || null,
        img: val('buy-img'), notes: val('buy-notes')
      };
    } else {
      const title = val('lease-title');
      if (!title) return toast('Please enter a property title', 'error');
      const leasePrice = num('lease-price');
      if (!leasePrice) return toast('Please enter the lease price / annual fee', 'error');
      payload = {
        title, listing_type: 'lease', property_type: val('lease-prop-type'),
        lease_type: val('lease-type'), lease_price: leasePrice,
        price: '₦' + leasePrice.toLocaleString() + '/yr',
        lease_payment_freq: val('lease-payment-freq'), lease_duration_years: val('lease-duration'),
        lease_start_date: val('lease-start-date') || null, renewal_option: val('lease-renewal'),
        escalation_pct: num('lease-escalation'),
        state: val('lease-state'), lga: val('lease-lga'), address: val('lease-address'), landmark: val('lease-landmark'),
        land_size_sqm: num('lease-land-sqm'), size_sqm: num('lease-sqm'),
        floors: intval('lease-floors'), parking_spaces: intval('lease-parking'),
        condition: val('lease-condition'), permitted_use: val('lease-permitted-use'),
        description: val('lease-desc'),
        amenities: val('lease-amenities').split(',').map(s => s.trim()).filter(Boolean),
        lease_agreement: val('lease-agreement') || null,
        doc_coo: val('lease-doc-coo') || null, doc_survey: val('lease-doc-survey') || null,
        img: val('lease-img'), notes: val('lease-notes')
      };
    }

    setBtnLoading(btn, true);
    try {
      const res = await API.ownerAddProperty(payload);
      const typeLabel = { rent: 'Rental', buy: 'Sale', lease: 'Lease' }[lt] || lt;
      toast(res.message || ('✅ ' + typeLabel + ' listing submitted for review'), 'success');
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
    setBtnLoading(btn, false, { rent: 'Submit Rental Listing →', buy: 'Submit Sale Listing →', lease: 'Submit Lease Listing →' }[lt]);
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
