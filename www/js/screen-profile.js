// ============================================================
// GeoEstate v2 — Profile screen
// ============================================================
(function (window) {
  'use strict';
  const { esc, confirmDialog } = window.GeoUtil;
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
    const initials = ((person.fname||person.name||'U')[0] + (person.lname?person.lname[0]:'')).toUpperCase();
    main.innerHTML = `
      <div class="geo-section text-center">
        ${person.photo_url ? `<img class="geo-avatar" style="width:72px;height:72px;margin:0 auto;" src="${esc(person.photo_url)}">`
          : `<div class="geo-avatar geo-avatar--placeholder" style="width:72px;height:72px;font-size:24px;margin:0 auto;">${esc(initials)}</div>`}
        <div class="h4 mt-3">${esc((person.fname||person.name||'')+' '+(person.lname||''))}</div>
        <div class="text-muted text-sm">${esc(person.email||'')}</div>
        ${person.is_verified || ownerSession ? '<span class="pill pill--green mt-2">✓ Verified</span>' : ''}
      </div>
      <div class="geo-section" style="padding-top:0;">
        ${ownerSession ? renderRow('🗂️','Owner Dashboard','Manage your listings',"GeoRouter.go('owner')") : ''}
        ${ownerSession && !ownerSession.owner.is_verified ? renderRow('🪪','Verify Identity','Required to list properties',"GeoRouter.go('verify')") : ''}
        ${renderRow('👥','Our Team','','GeoRouter.go(\'team\')')}
        ${renderRow('📞','Contact Us','','GeoRouter.go(\'contact\')')}
        ${renderRow('📄','Privacy Policy','','GeoUtil.toast(\'Opens Privacy Policy\')')}
        ${renderRow('📃','Terms of Service','','GeoUtil.toast(\'Opens Terms\')')}
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

  window.GeoRouter.register('profile', render);
})(window);
