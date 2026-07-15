// ============================================================
// GeoEstate v2 — App shell: router, header, tab bar, auth modals
// ============================================================
(function (window) {
  'use strict';
  const { esc, toast, openSheet, closeSheet, setBtnLoading } = window.GeoUtil;
  const API = window.GeoAPI;

  const TABS = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'browse', label: 'Browse', icon: '🗺️' },
    { id: 'owner', label: 'Dashboard', icon: '🗂️' },
    { id: 'profile', label: 'Profile', icon: '👤' }
  ];

  const state = {
    route: 'home',
    params: {},
    stack: []  // for back navigation on detail-style pages
  };

  function renderShell() {
    document.getElementById('app').innerHTML = `
      <header class="geo-header">
        <div class="geo-header__row">
          <div class="geo-header__brand clickable" onclick="GeoRouter.go('home')">
            <div class="geo-header__logo">🏡</div>
            <div>
              <div class="geo-header__title">GeoEstate</div>
              <div class="geo-header__sub" id="header-sub">RC: 9631300</div>
            </div>
          </div>
          <div class="geo-header__actions">
            <button class="geo-icon-btn" onclick="GeoApp.openNotifications()">
              🔔<span class="dot hidden" id="notif-dot"></span>
            </button>
            <div id="header-avatar"></div>
          </div>
        </div>
      </header>
      <main class="geo-main" id="main"></main>
      <nav class="geo-tabbar" id="tabbar"></nav>
    `;
    renderTabbar();
    renderHeaderAvatar();
  }

  function renderTabbar() {
    const bar = document.getElementById('tabbar');
    bar.innerHTML = TABS.map(t => `
      <button class="geo-tab ${state.route === t.id ? 'active' : ''}" onclick="GeoRouter.go('${t.id}')">
        <span class="geo-tab__icon">${t.icon}</span>
        <span>${t.label}</span>
      </button>
    `).join('');
  }

  function renderHeaderAvatar() {
    const user = API.getUser();
    const owner = API.getOwnerSession();
    const box = document.getElementById('header-avatar');
    const person = owner ? owner.owner : user;
    if (person) {
      const initials = ((person.fname || person.name || 'U')[0] + (person.lname ? person.lname[0] : '')).toUpperCase();
      box.innerHTML = person.photo_url
        ? `<img class="geo-avatar" src="${esc(person.photo_url)}" onclick="GeoRouter.go('profile')">`
        : `<div class="geo-avatar geo-avatar--placeholder" onclick="GeoRouter.go('profile')">${esc(initials)}</div>`;
    } else {
      box.innerHTML = `<button class="btn btn-primary btn-sm" onclick="GeoApp.openAuth('login')">Sign In</button>`;
    }
  }

  // ---- Router ----
  const routes = {}; // id -> render(container, params) => Promise|void
  function register(id, fn) { routes[id] = fn; }

  async function renderRoute(id, params) {
    const main = document.getElementById('main');
    try {
      const fn = routes[id];
      if (!fn) { main.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🚧</div><div class="empty-state__title">Coming soon</div></div>`; return; }
      await fn(main, params);
    } catch (e) {
      console.error('Route error', id, e);
      main.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Something went wrong</div><div class="empty-state__sub">${esc(e.message || '')}</div></div>`;
    }
  }

  async function go(id, params) {
    state.route = id;
    state.params = params || {};
    renderTabbar();
    renderHeaderAvatar();
    const main = document.getElementById('main');
    main.scrollTop = 0;
    main.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`;
    await renderRoute(id, state.params);
    window.history.pushState({ route: id, params: params }, '', '#' + id);
  }

  // Re-render whatever screen is currently active, in place, without a full
  // loading-spinner swap or a duplicate history entry — used by pull-to-refresh
  // so the current content stays visible until fresh content is ready.
  async function refreshCurrent() {
    renderHeaderAvatar();
    await renderRoute(state.route, state.params);
  }

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.route) { go(e.state.route, e.state.params); }
    else { go('home'); }
  });

  // Android hardware back button
  document.addEventListener('backbutton', () => {
    if (document.getElementById('active-sheet')) { closeSheet(); return; }
    if (state.route !== 'home') { window.history.back(); }
    else if (window.Capacitor && window.Capacitor.Plugins.App) { window.Capacitor.Plugins.App.exitApp(); }
  }, false);

  window.GeoRouter = { register, go, state, refreshCurrent };

  // ============================================================
  // Pull-to-refresh — attached once to #main (which persists across
  // route changes; only its innerHTML is swapped), so it works on every
  // screen automatically with no per-screen code.
  // ============================================================
  function initPullToRefresh() {
    const main = document.getElementById('main');
    if (!main || main.dataset.ptrBound) return;
    main.dataset.ptrBound = '1';

    const indicator = document.createElement('div');
    indicator.id = 'ptr-indicator';
    indicator.innerHTML = '<div class="spinner spinner--dark"></div>';
    main.parentNode.insertBefore(indicator, main);

    const THRESHOLD = 64;   // px of pull needed to trigger a refresh
    const MAX_PULL = 96;    // visual cap, with resistance beyond this
    let startY = 0, pulling = false, dragging = false, refreshing = false;

    main.addEventListener('touchstart', (e) => {
      if (refreshing) return;
      // Only start tracking a pull if the user is already at the very top —
      // otherwise this is just a normal scroll gesture.
      if (main.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        dragging = true;
        pulling = false;
        indicator.classList.add('active'); // disable CSS transition while dragging
      }
    }, { passive: true });

    main.addEventListener('touchmove', (e) => {
      if (!dragging || refreshing) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        // User scrolled back up past the top instead of pulling down further —
        // collapse the indicator and let normal scrolling resume.
        pulling = false;
        indicator.style.height = '0px';
        return;
      }
      // Resistance curve so the indicator doesn't track 1:1 with the finger —
      // makes the pull feel bounded rather than infinite.
      const resisted = Math.min(MAX_PULL, delta * 0.5);
      pulling = true;
      indicator.style.height = resisted + 'px';
      // Prevent the WebView's native overscroll/bounce only while actively
      // pulling, so normal scrolling elsewhere is never affected.
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    async function endPull() {
      dragging = false;
      indicator.classList.remove('active'); // re-enable CSS transition for the settle animation
      if (!pulling) { indicator.style.height = '0px'; return; }
      pulling = false;
      const indicatorHeight = parseFloat(indicator.style.height) || 0;
      if (indicatorHeight >= THRESHOLD) {
        refreshing = true;
        indicator.style.height = '48px';
        indicator.classList.add('spinning');
        try {
          await refreshCurrent();
        } finally {
          indicator.classList.remove('spinning');
          indicator.style.height = '0px';
          refreshing = false;
        }
      } else {
        indicator.style.height = '0px';
      }
    }

    main.addEventListener('touchend', endPull, { passive: true });
    main.addEventListener('touchcancel', endPull, { passive: true });
  }

  // ============================================================
  // Auth modals (email/password + OTP register)
  // ============================================================
  function openAuth(mode) {
    mode = mode || 'login';
    const html = `
      <div class="sheet__header">
        <div class="h4" id="auth-title">${mode === 'login' ? 'Sign In' : 'Create Account'}</div>
        <button class="geo-icon-btn" onclick="GeoUtil.closeSheet()">✕</button>
      </div>
      <div class="px-4" id="auth-body"></div>
    `;
    openSheet(html);
    renderAuthBody(mode);
  }

  function renderAuthBody(mode) {
    const body = document.getElementById('auth-body');
    document.getElementById('auth-title').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    if (mode === 'login') {
      body.innerHTML = `
        <div class="field"><label>Email</label><input class="input" id="li-email" type="email" placeholder="you@example.com"></div>
        <div class="field"><label>Password</label><input class="input" id="li-pass" type="password" placeholder="••••••••"></div>
        <button class="btn btn-primary btn-block" id="li-submit">Sign In</button>
        <div class="text-center text-sm text-muted mt-4">No account? <a class="text-accent font-bold" onclick="GeoApp.switchAuth('register')">Register</a></div>
        <div class="divider"></div>
        <button class="btn btn-outline btn-block" onclick="GeoApp.switchAuth('owner')">Sign in as Property Owner</button>
      `;
      document.getElementById('li-submit').onclick = async (e) => {
        const email = document.getElementById('li-email').value.trim();
        const pass = document.getElementById('li-pass').value;
        if (!email || !pass) return toast('Enter email and password', 'error');
        setBtnLoading(e.target, true);
        try {
          await API.userLogin(email, pass);
          toast('Welcome back!', 'success');
          closeSheet(); renderHeaderAvatar(); go(state.route, state.params);
        } catch (err) { toast(err.message || 'Login failed', 'error'); }
        setBtnLoading(e.target, false, 'Sign In');
      };
    } else if (mode === 'owner') {
      body.innerHTML = `
        <div class="text-sm text-muted mb-4">Enter the email you registered with. We'll send a one-time code.</div>
        <div class="field"><label>Email</label><input class="input" id="ow-email" type="email" placeholder="you@example.com"></div>
        <button class="btn btn-primary btn-block" id="ow-send">Send Code</button>
        <div class="text-center text-sm mt-4"><a class="text-accent font-bold" onclick="GeoApp.switchAuth('login')">← Back to Sign In</a></div>
      `;
      document.getElementById('ow-send').onclick = async (e) => {
        const email = document.getElementById('ow-email').value.trim();
        if (!email) return toast('Enter your email', 'error');
        setBtnLoading(e.target, true);
        try {
          await API.ownerRequestOTP(email);
          toast('Code sent to ' + email, 'success');
          renderOwnerOtpStep(email);
        } catch (err) { toast(err.message || 'Could not send code', 'error'); }
        setBtnLoading(e.target, false, 'Send Code');
      };
    } else if (mode === 'register') {
      body.innerHTML = `
        <div class="input-row">
          <div class="field w-full"><label>First name</label><input class="input" id="r-fname"></div>
          <div class="field w-full"><label>Last name</label><input class="input" id="r-lname"></div>
        </div>
        <div class="field"><label>Email</label><input class="input" id="r-email" type="email"></div>
        <div class="field"><label>Phone</label><input class="input" id="r-phone" type="tel"></div>
        <div class="field"><label>Password</label><input class="input" id="r-pass" type="password"></div>
        <div class="field"><label>I am a</label>
          <select class="input" id="r-role"><option value="renter">Renter / Buyer</option><option value="owner">Property Owner</option></select>
        </div>
        <button class="btn btn-primary btn-block" id="r-submit">Create Account</button>
        <div class="text-center text-sm text-muted mt-4">Already have an account? <a class="text-accent font-bold" onclick="GeoApp.switchAuth('login')">Sign in</a></div>
      `;
      document.getElementById('r-submit').onclick = async (e) => {
        const fname = document.getElementById('r-fname').value.trim();
        const lname = document.getElementById('r-lname').value.trim();
        const email = document.getElementById('r-email').value.trim();
        const phone = document.getElementById('r-phone').value.trim();
        const pass = document.getElementById('r-pass').value;
        const role = document.getElementById('r-role').value;
        if (!fname || !email || !pass) return toast('Fill in required fields', 'error');
        setBtnLoading(e.target, true);
        try {
          const passB64 = btoa(pass);
          await API.register({ fname, lname, email, phone, role, pass: passB64, registeredAt: new Date().toISOString() });
          toast('Account created — signing you in…', 'success');
          try { await API.userLogin(email, pass); } catch (e2) {}
          closeSheet(); renderHeaderAvatar(); go(state.route, state.params);
        } catch (err) { toast(err.message || 'Registration failed', 'error'); }
        setBtnLoading(e.target, false, 'Create Account');
      };
    }
  }

  function renderOwnerOtpStep(email) {
    const body = document.getElementById('auth-body');
    body.innerHTML = `
      <div class="text-sm text-muted mb-4">Enter the 6-digit code sent to <b>${esc(email)}</b></div>
      <div class="field"><input class="input" id="ow-code" maxlength="6" placeholder="000000" style="text-align:center;letter-spacing:8px;font-size:22px;"></div>
      <button class="btn btn-primary btn-block" id="ow-verify">Verify & Sign In</button>
      <div class="text-center text-sm mt-4"><a class="text-accent font-bold" onclick="GeoApp.switchAuth('owner')">← Use a different email</a></div>
    `;
    document.getElementById('ow-verify').onclick = async (e) => {
      const code = document.getElementById('ow-code').value.trim();
      if (code.length !== 6) return toast('Enter the 6-digit code', 'error');
      setBtnLoading(e.target, true);
      try {
        await API.ownerVerifyOTP(email, code);
        toast('Welcome, owner!', 'success');
        closeSheet(); renderHeaderAvatar(); go('owner');
      } catch (err) { toast(err.message || 'Invalid code', 'error'); }
      setBtnLoading(e.target, false, 'Verify & Sign In');
    };
  }

  window.GeoApp = {
    openAuth,
    switchAuth: renderAuthBody,
    openNotifications() { toast('No new notifications'); },
    logout() {
      API.logoutUser(); API.logoutOwner();
      toast('Signed out');
      renderHeaderAvatar();
      go('home');
    }
  };

  // ---- Boot ----
  // ---- First-launch onboarding walkthrough ----
  const ONBOARDING_SLIDES = [
    { icon: '🏡', title: 'Welcome to GeoEstate', body: 'Verified real estate in Nigeria — every owner ID-checked before a listing goes live.' },
    { icon: '🪪', title: 'Verified, Not Just Listed', body: 'No more fake agents or ghost listings. Owners complete identity verification before you ever see their property.' },
    { icon: '💳', title: 'Pay With Confidence', body: 'Transfers are matched to a receipt and confirmed by our team before funds are released — never blind.' },
    { icon: '📋', title: "You're Ready", body: 'Browse, save your favorites, and start your first transaction whenever you\'re ready.' }
  ];

  function showOnboarding(onDone) {
    let idx = 0;
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-app);z-index:99999;display:flex;flex-direction:column;';
    function render() {
      const s = ONBOARDING_SLIDES[idx];
      overlay.innerHTML = `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;">
          <div style="font-size:64px;margin-bottom:24px;">${s.icon}</div>
          <div class="h2 mb-3">${s.title}</div>
          <div class="text-muted" style="max-width:320px;line-height:1.6;">${s.body}</div>
        </div>
        <div style="padding:24px;">
          <div style="display:flex;justify-content:center;gap:6px;margin-bottom:20px;">
            ${ONBOARDING_SLIDES.map((_, i) => `<div style="width:${i===idx?20:6}px;height:6px;border-radius:3px;background:${i===idx?'var(--g-400)':'var(--border-soft)'};transition:width .2s;"></div>`).join('')}
          </div>
          <button class="btn btn-primary w-full" id="ob-next">${idx === ONBOARDING_SLIDES.length - 1 ? 'Get Started' : 'Next'}</button>
          ${idx < ONBOARDING_SLIDES.length - 1 ? `<button class="btn btn-outline w-full mt-2" id="ob-skip">Skip</button>` : ''}
        </div>
      `;
      document.getElementById('ob-next').onclick = () => {
        if (idx === ONBOARDING_SLIDES.length - 1) finish();
        else { idx++; render(); }
      };
      const skipBtn = document.getElementById('ob-skip');
      if (skipBtn) skipBtn.onclick = finish;
    }
    function finish() {
      localStorage.setItem('geo_onboarding_seen', '1');
      overlay.remove();
      if (onDone) onDone();
    }
    document.body.appendChild(overlay);
    render();
  }

  // ---- Biometric lock screen — shown before app content if the user has
  // enabled it in Profile and there's an existing session to protect ----
  function showBiometricLockScreen(onUnlocked) {
    const overlay = document.createElement('div');
    overlay.id = 'biometric-lock-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-app);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;';
    function render(errorMsg) {
      overlay.innerHTML = `
        <div style="font-size:64px;margin-bottom:24px;">🔒</div>
        <div class="h2 mb-2">GeoEstate Locked</div>
        <div class="text-muted mb-6" style="max-width:280px;line-height:1.6;">${errorMsg ? errorMsg : 'Use your fingerprint or face to continue'}</div>
        <button class="btn btn-primary w-full" id="bio-unlock-btn" style="max-width:280px;">🔓 Unlock</button>
        <button class="btn btn-outline w-full mt-3" id="bio-signout-btn" style="max-width:280px;">Sign Out Instead</button>
      `;
      document.getElementById('bio-unlock-btn').onclick = attempt;
      document.getElementById('bio-signout-btn').onclick = () => {
        window.GeoApp.logout();
        window.GeoBiometric.setEnabled(false);
        overlay.remove();
        onUnlocked();
      };
    }
    async function attempt() {
      try {
        await window.GeoBiometric.authenticate('Unlock GeoEstate');
        overlay.remove();
        onUnlocked();
      } catch (e) {
        render(e.message || 'Authentication failed — try again');
      }
    }
    document.body.appendChild(overlay);
    render();
    attempt(); // prompt immediately on cold start, no extra tap required
  }

  document.addEventListener('DOMContentLoaded', () => {
    function boot() {
      renderShell();
      initPullToRefresh();
      const initial = (location.hash || '#home').replace('#', '') || 'home';
      go(initial);
    }
    function bootWithBiometricGate() {
      const hasSession = !!(window.GeoAPI.getUser() || window.GeoAPI.getOwnerSession());
      if (hasSession && window.GeoBiometric.isEnabled()) {
        showBiometricLockScreen(boot);
      } else {
        boot();
      }
    }
    if (!localStorage.getItem('geo_onboarding_seen')) {
      showOnboarding(bootWithBiometricGate);
    } else {
      bootWithBiometricGate();
    }
  });
})(window);
