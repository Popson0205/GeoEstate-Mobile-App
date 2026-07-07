// ============================================================
// GeoEstate v2 — Home screen
// ============================================================
(function (window) {
  'use strict';
  const { esc } = window.GeoUtil;
  const API = window.GeoAPI;

  function propCard(p) {
    const img = p.img
      ? `<img src="${esc(p.img)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=no-img>🏠</div>'">`
      : `<div class="no-img">🏠</div>`;
    return `
      <div class="prop-card" onclick="GeoRouter.go('detail',{id:'${esc(p.id)}'})">
        <div class="prop-card__img">
          ${img}
          <span class="pill pill--green prop-card__badge">${esc((p.listing_type||'rent').toUpperCase())}</span>
        </div>
        <div class="prop-card__body">
          <div class="prop-card__price">${esc(p.price)}</div>
          <div class="prop-card__title">${esc(p.title)}</div>
          <div class="prop-card__loc">📍 ${esc(p.location)}</div>
        </div>
      </div>`;
  }

  function skeletonCards(n) {
    return Array.from({ length: n }).map(() => `
      <div class="prop-card">
        <div class="skeleton" style="aspect-ratio:4/3;border-radius:0;"></div>
        <div class="prop-card__body">
          <div class="skeleton" style="height:16px;width:60%;margin-bottom:8px;"></div>
          <div class="skeleton" style="height:12px;width:90%;"></div>
        </div>
      </div>`).join('');
  }

  async function render(main) {
    main.innerHTML = `
      <div class="geo-section" style="background:linear-gradient(160deg, var(--g-800), var(--bg-app) 60%);padding-bottom:var(--sp-7);">
        <span class="pill pill--green">🇳🇬 Nigeria's First Geospatial Property Platform</span>
        <div class="h1 mt-4">Real Estate You Can <span class="text-accent">Actually Trust</span></div>
        <div class="text-muted text-sm mt-3">Every property owner identity-verified. Every title document checked. Lawyer-backed. Police-linked. Secure payments. No illegal fees. Ever.</div>

        <div class="geo-card mt-4" style="padding:var(--sp-3);">
          <div class="chip-row mb-3" id="home-type-chips">
            ${['rent','buy','lease'].map((t,i) => `<div class="chip ${i===0?'active':''}" data-type="${t}">${t[0].toUpperCase()+t.slice(1)}</div>`).join('')}
          </div>
          <div class="input-group mb-3">
            <span class="input-icon">🔍</span>
            <input class="input" id="home-search" placeholder="Search by state, LGA, or neighbourhood…">
          </div>
          <button class="btn btn-primary btn-block" id="home-search-btn">Search Properties →</button>
        </div>

        <div class="stat-grid mt-6" id="home-stats">
          <div><div class="stat-num" id="stat-verified">0</div><div class="stat-label">Verified Properties</div></div>
          <div><div class="stat-num">36</div><div class="stat-label">States Covered</div></div>
          <div><div class="stat-num">₦0</div><div class="stat-label">Illegal Agent Fees</div></div>
          <div><div class="stat-num">100%</div><div class="stat-label">NIN-Verified</div></div>
        </div>
      </div>

      <div class="geo-section">
        <div class="geo-section-title">
          <div class="h3">Fresh Listings</div>
          <a class="text-accent text-sm font-bold" onclick="GeoRouter.go('browse')">See all →</a>
        </div>
        <div class="prop-list" id="home-listings">${skeletonCards(3)}</div>
      </div>

      <div class="geo-section">
        <div class="geo-card verified-banner">
          <div style="font-size:26px;">🛡️</div>
          <div>
            <div class="font-bold">NIN Verified Owners</div>
            <div class="text-xs text-muted">Every owner's identity checked before listing goes live.</div>
          </div>
        </div>
      </div>

      <div class="geo-section">
        <div class="geo-card" style="background:linear-gradient(135deg,var(--g-600),var(--g-700));cursor:pointer;" onclick="GeoRouter.go('owner')">
          <div class="h4">List Your Property →</div>
          <div class="text-sm mt-2" style="color:rgba(255,255,255,0.85)">Verified. Secure. Zero illegal fees. Reach thousands of renters and buyers.</div>
        </div>
      </div>
    `;

    document.querySelectorAll('#home-type-chips .chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('#home-type-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      };
    });
    document.getElementById('home-search-btn').onclick = () => {
      const type = document.querySelector('#home-type-chips .chip.active').dataset.type;
      const q = document.getElementById('home-search').value.trim();
      window.GeoRouter.go('browse', { type, q });
    };

    try {
      const props = await API.listProperties({});
      document.getElementById('stat-verified').textContent = props.length;
      const list = document.getElementById('home-listings');
      if (!props.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🏘️</div><div class="empty-state__title">No listings yet</div><div class="empty-state__sub">New verified properties are added regularly — check back soon.</div></div>`;
      } else {
        list.innerHTML = props.slice(0, 6).map(propCard).join('');
      }
    } catch (e) {
      document.getElementById('home-listings').innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Couldn't load listings</div><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
    }
  }

  window.GeoRouter.register('home', render);
  window.GeoScreens = window.GeoScreens || {};
  window.GeoScreens.propCard = propCard;
  window.GeoScreens.skeletonCards = skeletonCards;
})(window);
