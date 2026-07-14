// ============================================================
// GeoEstate v2 — Browse screen (list + simple map-style filter view)
// ============================================================
(function (window) {
  'use strict';
  const { esc, debounce, toast } = window.GeoUtil;
  const API = window.GeoAPI;
  const { propCard, skeletonCards } = window.GeoScreens;

  const NG_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];

  async function render(main, params) {
    params = params || {};
    const type = params.type || 'rent';
    main.innerHTML = `
      <div class="geo-section" style="padding-bottom:var(--sp-2);">
        <div class="h3 mb-3">Browse Properties</div>
        <div class="chip-row mb-3" id="browse-type-chips">
          ${['rent','buy','lease'].map(t => `<div class="chip ${t===type?'active':''}" data-type="${t}">${t[0].toUpperCase()+t.slice(1)}</div>`).join('')}
        </div>
        <div class="input-group mb-3">
          <span class="input-icon">🔍</span>
          <input class="input" id="browse-search" placeholder="Search state, LGA, address…" value="${esc(params.q||'')}">
        </div>
        <select class="input mb-3" id="browse-state">
          <option value="">All States</option>
          ${NG_STATES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div class="geo-section" style="padding-top:0;">
        <div class="flex justify-between items-center mb-3">
          <span class="text-sm text-muted" id="browse-count">Loading…</span>
          <button class="btn btn-outline btn-sm" id="browse-save-search">🔔 Save search</button>
        </div>
        <div class="prop-list" id="browse-results">${skeletonCards(4)}</div>
      </div>
    `;

    let currentType = type;
    const doSearch = debounce(runSearch, 350);

    document.querySelectorAll('#browse-type-chips .chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('#browse-type-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentType = chip.dataset.type;
        runSearch();
      };
    });
    document.getElementById('browse-search').oninput = doSearch;
    document.getElementById('browse-state').onchange = runSearch;
    document.getElementById('browse-save-search').onclick = async () => {
      if (!API.getUser() && !API.getOwnerSession()) {
        toast('Please log in to save searches', 'error');
        window.GeoApp.openAuth('login');
        return;
      }
      const q = document.getElementById('browse-search').value.trim();
      const st = document.getElementById('browse-state').value;
      const filters = { type: currentType, state: st, q };
      const label = [currentType, st].filter(Boolean).join(' · ') || 'My search';
      try {
        await API.addSavedSearch(label, filters);
        toast('Search saved 🔔 — find it under Profile > Saved Searches');
      } catch (e) { toast(e.message || 'Could not save search', 'error'); }
    };
    if (params.q) document.getElementById('browse-search').value = params.q;

    async function runSearch() {
      const q = document.getElementById('browse-search').value.trim();
      const st = document.getElementById('browse-state').value;
      const resultsEl = document.getElementById('browse-results');
      resultsEl.innerHTML = skeletonCards(3);
      try {
        const props = await API.listProperties({ type: currentType, q, state: st });
        document.getElementById('browse-count').textContent = props.length + ' propert' + (props.length === 1 ? 'y' : 'ies') + ' found';
        if (!props.length) {
          resultsEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__title">No ${esc(currentType)} listings yet</div><div class="empty-state__sub">Inventory is growing — try a different type or check back soon.</div></div>`;
        } else {
          resultsEl.innerHTML = props.map(propCard).join('');
        }
      } catch (e) {
        resultsEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Couldn't load properties</div><div class="empty-state__sub">${esc(e.message||'')}</div></div>`;
      }
    }
    runSearch();
  }

  window.GeoRouter.register('browse', render);
})(window);
