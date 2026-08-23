// ============================================================
// GeoEstate v2 — Profile screen
// ============================================================
(function (window) {
  'use strict';
  const { esc, confirmDialog, openSheet, closeSheet, toast } = window.GeoUtil;
  const API = window.GeoAPI;

  function renderRow(icon, title, sub, onclick) {
    return `<div class="list-row" onclick="${onclick}">
      <div class="list-row__icon">${icon}</div>
      <div class="list-row__body"><div class="list-row__title">${esc(title)}</div>${sub ? `<div class="list-row__sub">${esc(sub)}</div>` : ''}</div>
      <div class="list-row__chevron">›</div>
    </div>`;
  }

  async function render(main) {
    const user = API.getUser();
    const ownerSession = API.getOwnerSession();
    const person = ownerSession ? ownerSession.owner : user;

    if (!person) {
      main.innerHTML = `<div class="empty-state"><div class="empty-state__icon">👤</div><div class="empty-state__title">Not signed in</div><div class="empty-state__sub mb-6">Sign in to manage your profile, saved properties, and settings.</div><button class="btn btn-primary" onclick="GeoApp.openAuth('login')">Sign In</button></div>`;
      return;
    }

    // person.is_verified (and ownerSession.owner.is_verified) is whatever
    // was cached at login time — it never updates on its own, so someone
    // verified *after* logging in would keep seeing "Verify Identity"
    // here indefinitely until they logged out and back in. /owner/profile
    // works for any registered user regardless of role (not owner-specific
    // despite the URL), so fetch it fresh and sync the result back into
    // the cached session too, so other screens benefit from this same
    // navigation instead of only this one render.
    let isVerified = !!person.is_verified;
    try {
      const fresh = await API.ownerProfile();
      if (fresh && typeof fresh.is_verified === 'boolean') {
        isVerified = fresh.is_verified;
        if (ownerSession) { ownerSession.owner.is_verified = isVerified; API.setOwnerSession(ownerSession); }
        if (user) { user.is_verified = isVerified; user.verified = isVerified; API.setUser(user); }
      }
    } catch (e) { /* keep showing whatever was cached rather than blocking the whole screen on a transient failure */ }

    const initials = ((person.fname||person.name||'U')[0] + (person.lname?person.lname[0]:'')).toUpperCase();
    main.innerHTML = `
      <div class="geo-section text-center">
        ${person.photo_url ? `<img class="geo-avatar" style="width:72px;height:72px;margin:0 auto;" src="${esc(person.photo_url)}">`
          : `<div class="geo-avatar geo-avatar--placeholder" style="width:72px;height:72px;font-size:24px;margin:0 auto;">${esc(initials)}</div>`}
        <div class="h4 mt-3">${esc((person.fname||person.name||'')+' '+(person.lname||''))}</div>
        <div class="text-muted text-sm">${esc(person.email||'')}</div>
        ${isVerified ? '<span class="pill pill--green mt-2">✓ Verified</span>' : ''}
      </div>
      <div class="geo-section" style="padding-top:0;">
        ${ownerSession ? renderRow('🗂️','Owner Dashboard','Manage your listings',"GeoRouter.go('owner')") : ''}
        ${!isVerified ? renderRow('🪪','Verify Identity','Required to list properties',"GeoRouter.go('verify')") : ''}
        ${renderRow('❤️','Saved Properties','',"GeoProfile.showSaved()")}
        ${renderRow('💬','Messages','Chat with owners about listings',"GeoChat.openConversationsList()")}
        ${renderRow('🕒','Recently Viewed','',"GeoProfile.showRecentlyViewed()")}
        ${renderRow('🔔','Saved Searches','Get matched automatically',"GeoProfile.showSavedSearches()")}
        ${renderRow('📁','Document Vault','Your ID, receipts & documents',"GeoProfile.showDocumentVault()")}
        ${renderRow('🧮','Affordability Calculator','What can I afford?',"GeoProfile.showAffordabilityCalculator()")}
        ${renderRow('🔒','Biometric Lock','Fingerprint / Face ID app lock',"GeoProfile.showBiometricSettings()")}
        ${renderRow('👥','Our Team','','GeoRouter.go(\'team\')')}
        ${renderRow('📞','Contact Us','','GeoRouter.go(\'contact\')')}
        ${renderRow('📄','Privacy Policy','','GeoProfile.showPrivacyPolicy()')}
        ${renderRow('📃','Terms of Service','','GeoProfile.showTermsOfService()')}
      </div>
      <div class="geo-section" style="padding-top:0;">
        <button class="btn btn-outline btn-block" id="profile-logout">Sign Out</button>
      </div>
    `;
    document.getElementById('profile-logout').onclick = async () => {
      const ok = await confirmDialog({ title: 'Sign Out', message: 'Are you sure you want to sign out?', okLabel: 'Sign Out', danger: true });
      if (ok) window.GeoApp.logout();
    };
  }

  function propCardCompact(p, opts) {
    opts = opts || {};
    const img = p.img ? `<img src="${esc(p.img)}" style="width:64px;height:64px;object-fit:cover;border-radius:10px;flex-shrink:0;" onerror="this.style.display='none'">` : `<div style="width:64px;height:64px;border-radius:10px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;flex-shrink:0;">🏠</div>`;
    return `
      <div class="geo-card flex items-center gap-3" style="cursor:pointer;" onclick="GeoUtil.closeSheet();GeoRouter.go('detail',{id:'${esc(p.id)}'})">
        ${img}
        <div style="flex:1;min-width:0;">
          <div class="font-bold text-sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.title||'')}</div>
          <div class="text-xs text-muted">${esc(p.price||'')}</div>
          <div class="text-xs text-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 ${esc(p.location||'')}</div>
        </div>
        ${opts.removeBtn ? `<button class="geo-icon-btn" onclick="event.stopPropagation();${opts.removeBtn}" style="flex-shrink:0;">✕</button>` : ''}
      </div>`;
  }

  async function showSaved() {
    if (!API.getUser() && !API.getOwnerSession()) { toast('Please log in to view saved properties', 'error'); window.GeoApp.openAuth('login'); return; }
    openSheet(`
      <div class="sheet__header"><div class="h4">Saved Properties</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" id="saved-body" style="min-height:200px;"><div class="page-loading"><div class="spinner"></div></div></div>
    `);
    try {
      const list = await API.getFavorites();
      const body = document.getElementById('saved-body');
      if (!list.length) {
        body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">❤️</div><div class="empty-state__title">No saved properties yet</div><div class="empty-state__sub">Tap the heart icon on any listing to save it here.</div></div>`;
        return;
      }
      body.innerHTML = `<div class="prop-list">` + list.map(p => propCardCompact(p, { removeBtn: `GeoProfile.unsaveAndRefresh('${esc(p.id)}')` })).join('') + `</div>`
        + (list.length >= 2 ? `<button class="btn btn-outline w-full mt-3" onclick="GeoProfile.showCompare()">⚖️ Compare Saved Properties</button>` : '');
    } catch (e) {
      document.getElementById('saved-body').innerHTML = `<div class="empty-state"><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
    }
  }

  async function unsaveAndRefresh(propertyId) {
    try { await API.removeFavorite(propertyId); toast('Removed from Saved'); showSaved(); }
    catch (e) { toast(e.message || 'Could not remove', 'error'); }
  }

  function showRecentlyViewed() {
    const list = API.getRecentlyViewed();
    openSheet(`
      <div class="sheet__header"><div class="h4">Recently Viewed</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4">
        ${list.length ? `<div class="prop-list">${list.map(p => propCardCompact(p)).join('')}</div>
          <button class="btn btn-outline w-full mt-3" onclick="GeoAPI.clearRecentlyViewed();GeoUtil.closeSheet();GeoUtil.toast('Cleared')">Clear History</button>`
          : `<div class="empty-state"><div class="empty-state__icon">🕒</div><div class="empty-state__title">Nothing viewed yet</div><div class="empty-state__sub">Properties you look at will show up here.</div></div>`}
      </div>
    `);
  }

  async function showSavedSearches() {
    if (!API.getUser() && !API.getOwnerSession()) { toast('Please log in to manage saved searches', 'error'); window.GeoApp.openAuth('login'); return; }
    openSheet(`
      <div class="sheet__header"><div class="h4">Saved Searches</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4 text-xs text-muted mb-3">We'll highlight matching properties when you browse. To save a new search, apply filters on the Browse tab and tap "Save this search".</div>
      <div class="px-4" id="searches-body" style="min-height:120px;"><div class="page-loading"><div class="spinner"></div></div></div>
    `);
    try {
      const list = await API.getSavedSearches();
      const body = document.getElementById('searches-body');
      if (!list.length) {
        body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔔</div><div class="empty-state__title">No saved searches yet</div></div>`;
        return;
      }
      body.innerHTML = `<div class="prop-list">` + list.map(s => {
        const f = s.filters || {};
        const parts = [f.type, f.state, f.lga, f.beds ? f.beds+' bed' : '', f.min_price || f.max_price ? '₦'+(f.min_price||0).toLocaleString()+' - ₦'+(f.max_price||'∞') : ''].filter(Boolean);
        return `<div class="geo-card flex justify-between items-center">
          <div><div class="font-bold text-sm">${esc(s.label || 'Search')}</div><div class="text-xs text-muted">${esc(parts.join(' · '))}</div></div>
          <button class="geo-icon-btn" onclick="GeoProfile.removeSearchAndRefresh(${s.id})">✕</button>
        </div>`;
      }).join('') + `</div>`;
    } catch (e) {
      document.getElementById('searches-body').innerHTML = `<div class="empty-state"><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
    }
  }

  async function removeSearchAndRefresh(id) {
    try { await API.removeSavedSearch(id); toast('Removed'); showSavedSearches(); }
    catch (e) { toast(e.message || 'Could not remove', 'error'); }
  }

  async function showDocumentVault() {
    const ownerSession = API.getOwnerSession();
    openSheet(`
      <div class="sheet__header"><div class="h4">Document Vault</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4">
        ${ownerSession && (ownerSession.owner.photo_url || ownerSession.owner.id_doc_url) ? `
          <div class="text-xs text-muted mb-2" style="text-transform:uppercase;letter-spacing:.06em;">Identity Verification</div>
          <div class="prop-list mb-4">
            ${ownerSession.owner.photo_url ? `<a class="geo-card flex items-center gap-3" href="${esc(ownerSession.owner.photo_url)}" target="_blank" style="text-decoration:none;color:inherit;"><span style="font-size:20px;">🤳</span><div class="font-bold text-sm">Selfie</div><span class="text-xs text-muted" style="margin-left:auto;">View →</span></a>` : ''}
            ${ownerSession.owner.id_doc_url ? `<a class="geo-card flex items-center gap-3" href="${esc(ownerSession.owner.id_doc_url)}" target="_blank" style="text-decoration:none;color:inherit;"><span style="font-size:20px;">🪪</span><div class="font-bold text-sm">ID Document</div><span class="text-xs text-muted" style="margin-left:auto;">View →</span></a>` : ''}
          </div>` : `<div class="text-xs text-muted mb-4">Complete identity verification to see your documents here.</div>`}
        <div class="text-xs text-muted mb-2" style="text-transform:uppercase;letter-spacing:.06em;">Transactions & Receipts</div>
        <div class="empty-state"><div class="empty-state__icon">🧾</div><div class="empty-state__sub">Your payment receipts will appear here after you start a transaction on a property.</div></div>
      </div>
    `);
  }

  function showAffordabilityCalculator() {
    openSheet(`
      <div class="sheet__header"><div class="h4">Affordability Calculator</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4">
        <div class="field">
          <label>Your monthly income (₦)</label>
          <input type="number" id="afc-income" class="input" placeholder="e.g. 350000" inputmode="numeric">
        </div>
        <div class="field">
          <label>What are you budgeting for?</label>
          <select id="afc-type" class="input">
            <option value="rent">Annual Rent</option>
            <option value="buy">Property Purchase</option>
          </select>
        </div>
        <button class="btn btn-primary w-full" id="afc-calc-btn">Calculate</button>
        <div id="afc-result" class="mt-4"></div>
        <div class="text-xs text-muted mt-3">Rule of thumb: rent shouldn't exceed ~30% of monthly income (paid as one annual lump sum in Nigeria); a mortgage-worthy purchase price is typically 3-5x annual income, assuming a reasonable down payment.</div>
      </div>
    `);
    document.getElementById('afc-calc-btn').onclick = () => {
      const income = Number(document.getElementById('afc-income').value) || 0;
      const type = document.getElementById('afc-type').value;
      const resultEl = document.getElementById('afc-result');
      if (!income) { resultEl.innerHTML = `<div class="text-sm" style="color:var(--danger);">Enter your monthly income first</div>`; return; }
      if (type === 'rent') {
        const annualBudget = Math.round(income * 0.30 * 12);
        resultEl.innerHTML = `<div class="geo-card text-center" style="background:linear-gradient(135deg,var(--g-600),var(--g-700));">
          <div class="text-xs" style="color:rgba(255,255,255,.7);">Comfortable annual rent budget</div>
          <div class="h2" style="color:#fff;margin:6px 0;">₦${annualBudget.toLocaleString()}/yr</div>
        </div>`;
      } else {
        const low = Math.round(income * 12 * 3), high = Math.round(income * 12 * 5);
        resultEl.innerHTML = `<div class="geo-card text-center" style="background:linear-gradient(135deg,var(--g-600),var(--g-700));">
          <div class="text-xs" style="color:rgba(255,255,255,.7);">Comfortable purchase price range</div>
          <div class="h3" style="color:#fff;margin:6px 0;">₦${low.toLocaleString()} - ₦${high.toLocaleString()}</div>
        </div>`;
      }
    };
  }

  async function showCompare() {
    let list;
    try { list = (await API.getFavorites()).slice(0, 3); } catch (e) { toast('Could not load properties', 'error'); return; }
    if (list.length < 2) { toast('Save at least 2 properties to compare', 'error'); return; }
    const rows = [
      { label: 'Price', get: p => p.price || '—' },
      { label: 'Type', get: p => (p.listing_type || 'rent').toUpperCase() },
      { label: 'Bedrooms', get: p => p.bedrooms || '—' },
      { label: 'Bathrooms', get: p => p.bathrooms || '—' },
      { label: 'Size (sqm)', get: p => p.size_sqm || '—' },
      { label: 'Location', get: p => p.location || p.lga || '—' },
    ];
    openSheet(`
      <div class="sheet__header"><div class="h4">Compare Properties</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:${list.length * 140}px;">
          <thead><tr>
            <td></td>
            ${list.map(p => `<td style="padding:8px;vertical-align:top;">
              ${p.img ? `<img src="${esc(p.img)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;margin-bottom:6px;" onerror="this.style.display='none'">` : ''}
              <div class="font-bold text-xs" style="cursor:pointer;" onclick="GeoUtil.closeSheet();GeoRouter.go('detail',{id:'${esc(p.id)}'})">${esc(p.title)}</div>
            </td>`).join('')}
          </tr></thead>
          <tbody>
            ${rows.map(r => `<tr style="border-top:1px solid var(--border-soft);">
              <td class="text-xs text-muted" style="padding:8px 8px 8px 0;white-space:nowrap;">${r.label}</td>
              ${list.map(p => `<td class="text-xs font-bold" style="padding:8px;text-align:center;">${esc(String(r.get(p)))}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `);
  }

  async function showBiometricSettings() {
    openSheet(`
      <div class="sheet__header"><div class="h4">Biometric Lock</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" id="bio-settings-body"><div class="page-loading"><div class="spinner"></div></div></div>
    `);
    const body = document.getElementById('bio-settings-body');
    const info = await window.GeoBiometric.checkAvailable();
    if (!info.isAvailable) {
      body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔒</div><div class="empty-state__title">Not available</div><div class="empty-state__sub">${esc(info.reason || 'Your device has no fingerprint or face unlock set up, or this app doesn\'t have permission to use it. Set up biometrics in your device settings first.')}</div></div>`;
      return;
    }
    const enabled = window.GeoBiometric.isEnabled();
    body.innerHTML = `
      <div class="geo-card flex justify-between items-center mb-3">
        <div>
          <div class="font-bold text-sm">Require unlock on launch</div>
          <div class="text-xs text-muted mt-1">Use your fingerprint or face to open GeoEstate instead of staying signed in automatically.</div>
        </div>
        <label style="display:flex;align-items:center;flex-shrink:0;margin-left:12px;">
          <input type="checkbox" id="bio-toggle" ${enabled ? 'checked' : ''} style="width:20px;height:20px;">
        </label>
      </div>
      <div class="text-xs text-muted">This only locks the app on this device — it doesn't change how you sign in to your account.</div>
    `;
    document.getElementById('bio-toggle').onchange = async (e) => {
      const cb = e.target;
      if (cb.checked) {
        // Confirm biometrics actually work on this device before relying on
        // them to gate the whole app — avoids a user enabling this and then
        // getting stuck unable to unlock because of a misconfigured sensor.
        try {
          await window.GeoBiometric.authenticate('Confirm to enable Biometric Lock');
          window.GeoBiometric.setEnabled(true);
          toast('Biometric Lock enabled', 'success');
        } catch (err) {
          cb.checked = false;
          toast(err.message || 'Could not verify biometrics — lock not enabled', 'error');
        }
      } else {
        window.GeoBiometric.setEnabled(false);
        toast('Biometric Lock disabled');
      }
    };
  }

  // ── Privacy Policy & Terms of Service ────────────────────────────────
  // Real content, replacing what were previously literal placeholder
  // toasts ("Opens Privacy Policy" / "Opens Terms" as their actual text,
  // never any real content). Written for GeoEstate specifically, but this
  // is not a substitute for a lawyer's review before relying on it.
  const PRIVACY_POLICY = `Last updated: 2026

GeoEstate ("we", "our", "us") operates a property listing and rental/sale platform for Nigeria. This policy explains what information we collect and how we use it.

INFORMATION WE COLLECT
• Account details: name, email, phone number, and password (stored securely, never in plain text).
• Identity verification: NIN, date of birth, occupation, address, and a selfie/ID photo, submitted when you verify your identity as required to list a property.
• Property information: listings, photos, videos, and documents you upload as an owner.
• Transaction records: payment references, receipts, and tenancy/agreement details for properties you rent, lease, or buy through the platform.
• Messages: conversations sent through in-app chat.
• Usage data: which listings you view, so owners can see basic performance stats on their own properties.

HOW WE USE YOUR INFORMATION
• To verify property owners and reduce fraud on the platform.
• To connect you with the GeoEstate team regarding a listing you're interested in.
• To process and confirm payments, and to generate tenancy agreements.
• To send you notifications about enquiries, payments, and tenancy renewals.
• To improve the platform based on how it's actually used.

WHO WE SHARE IT WITH
• Property owners, only the information relevant to a specific enquiry or transaction.
• Service providers we rely on to run the platform (secure file storage, push notification delivery) — they only receive what's needed to provide that service.
• Law enforcement, where legally required, particularly in connection with our fraud/dispute resolution process.

We do not sell your personal information to third parties.

YOUR RIGHTS
You can request a copy of your data, ask us to correct inaccurate information, or request account deletion by contacting us. Some information (like transaction records) may be retained where we have a legal obligation to keep it.

DATA SECURITY
We use industry-standard measures to protect your data, including encrypted storage and secure authentication. No system is 100% secure, and we encourage you to use a strong, unique password.

CONTACT US
Questions about this policy can be sent through the Contact Us page in this app.`;

  const TERMS_OF_SERVICE = `Last updated: 2026

By using GeoEstate, you agree to these terms.

1. WHAT GEOESTATE IS
GeoEstate is a platform connecting property owners with people looking to rent, lease, or buy property in Nigeria. We verify property owners' identities and, where noted, conduct a physical site visit — but we do not own, manage, or guarantee any property listed by a third-party owner.

2. ACCOUNTS
You must provide accurate information when registering. You're responsible for keeping your login credentials secure, including any biometric lock you enable on your device.

3. LISTING A PROPERTY
Owners must complete identity verification before listing. Listings must be accurate — misrepresenting a property's condition, ownership, or availability may result in the listing being removed and the account suspended.

4. PAYMENTS
Payments made through GeoEstate are manually confirmed by our team before being released to an owner. Always use the reference code provided and never transfer money outside the process shown in the app. GeoEstate charges a platform fee, shown before you complete a transaction.

5. TENANCY AGREEMENTS
Once a rent or lease payment is confirmed, a tenancy agreement is generated automatically from the transaction details and can be signed electronically by both parties within the app. This is a convenience feature; for high-value or complex agreements, we recommend independent legal advice.

6. DISPUTES
If something goes wrong, use the in-app enquiry/support channels first. Serious disputes (fraud, non-delivery, safety concerns) may be escalated through our dispute resolution process, which can involve referral to the appropriate authorities.

7. PROHIBITED CONDUCT
You may not use GeoEstate to list property you don't have the right to list, to harass another user, to circumvent our payment process, or to attempt to defraud another party.

8. LIMITATION OF LIABILITY
GeoEstate facilitates connections and transactions between owners and customers but is not a party to the tenancy or sale itself. We work to verify owners and properties, but we cannot guarantee every detail of a listing is accurate.

9. CHANGES TO THESE TERMS
We may update these terms as the platform evolves. Continued use of the app after a change means you accept the updated terms.

10. CONTACT
Questions about these terms can be sent through the Contact Us page in this app.`;

  function showPrivacyPolicy() {
    openSheet(`
      <div class="sheet__header"><div class="h4">Privacy Policy</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" style="max-height:65vh;overflow-y:auto;white-space:pre-wrap;font-size:.82rem;line-height:1.6;color:var(--text-secondary,#a9c2b3)">${esc(PRIVACY_POLICY)}</div>
    `);
  }

  function showTermsOfService() {
    openSheet(`
      <div class="sheet__header"><div class="h4">Terms of Service</div><button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button></div>
      <div class="px-4" style="max-height:65vh;overflow-y:auto;white-space:pre-wrap;font-size:.82rem;line-height:1.6;color:var(--text-secondary,#a9c2b3)">${esc(TERMS_OF_SERVICE)}</div>
    `);
  }

  window.GeoProfile = { showSaved, unsaveAndRefresh, showRecentlyViewed, showSavedSearches, removeSearchAndRefresh, showDocumentVault, showAffordabilityCalculator, showCompare, showBiometricSettings, showPrivacyPolicy, showTermsOfService };

  window.GeoRouter.register('profile', render);
})(window);
