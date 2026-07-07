// ============================================================
// GeoEstate v2 — Team & Contact screens
// ============================================================
(function (window) {
  'use strict';
  const { esc } = window.GeoUtil;
  const API = window.GeoAPI;

  function teamCard(m) {
    const avatar = m.img
      ? `<img class="avatar-sm" style="width:56px;height:56px;" src="${esc(m.img)}">`
      : `<div class="geo-avatar geo-avatar--placeholder" style="width:56px;height:56px;font-size:18px;">${esc(m.name[0])}</div>`;
    return `
      <div class="geo-card flex items-center gap-4">
        ${avatar}
        <div style="flex:1;min-width:0;">
          <div class="font-bold">${esc(m.name)}</div>
          <div class="text-xs text-muted">${esc(m.title)}</div>
        </div>
        ${m.whatsapp ? `<button class="geo-icon-btn" onclick="window.open('https://wa.me/${esc(m.whatsapp)}','_system')">💬</button>` : ''}
      </div>`;
  }

  function renderTeam(main) {
    const team = API.team();
    main.innerHTML = `
      <div class="geo-section">
        <div class="h3 mb-2">Our Team</div>
        <div class="text-muted text-sm mb-6">The people behind GeoEstate — verified, vetted, and here to help.</div>
        <div class="prop-list">${team.map(teamCard).join('')}</div>
      </div>
    `;
  }

  function renderContact(main) {
    main.innerHTML = `
      <div class="geo-section">
        <div class="h3 mb-2">Contact Us</div>
        <div class="text-muted text-sm mb-6">Reach out — we typically respond within a few hours.</div>
        <div class="geo-card mb-3 flex items-center gap-3"><span style="font-size:20px;">📧</span><div><div class="font-bold text-sm">Email</div><a class="text-accent text-sm" href="mailto:admin@geoestate.com.ng">admin@geoestate.com.ng</a></div></div>
        <div class="geo-card mb-3 flex items-center gap-3"><span style="font-size:20px;">📞</span><div><div class="font-bold text-sm">Sales Team</div><a class="text-accent text-sm" href="tel:+2348133343645">+234 813 334 3645</a></div></div>
        <div class="geo-card flex items-center gap-3 clickable" onclick="window.open('https://wa.me/2348133343645','_system')"><span style="font-size:20px;">💬</span><div><div class="font-bold text-sm">WhatsApp</div><div class="text-xs text-muted">Chat with our sales team</div></div></div>

        <div class="h4 mt-6 mb-3">Send us a message</div>
        <div class="field"><label>Name</label><input class="input" id="c-name"></div>
        <div class="field"><label>Email</label><input class="input" id="c-email" type="email"></div>
        <div class="field"><label>Message</label><textarea class="input" id="c-msg"></textarea></div>
        <button class="btn btn-primary btn-block" id="c-send">Send Message</button>
      </div>
    `;
    document.getElementById('c-send').onclick = () => {
      const name = document.getElementById('c-name').value.trim();
      const email = document.getElementById('c-email').value.trim();
      const msg = document.getElementById('c-msg').value.trim();
      if (!name || !email || !msg) return window.GeoUtil.toast('Fill in all fields', 'error');
      window.open(`mailto:admin@geoestate.com.ng?subject=Contact from ${encodeURIComponent(name)}&body=${encodeURIComponent(msg + '\n\nFrom: ' + email)}`, '_system');
    };
  }

  window.GeoRouter.register('team', renderTeam);
  window.GeoRouter.register('contact', renderContact);
})(window);
