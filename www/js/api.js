// ============================================================
// GeoEstate v2 — API Client
// Wraps every live backend endpoint discovered in server.js.
// No backend changes. Base: https://api.geoestate.com.ng
// ============================================================
(function (window) {
  'use strict';

  const BASE = 'https://api.geoestate.com.ng';
  const USER_KEY = 'gv2_user_session';
  const OWNER_KEY = 'gv2_owner_session';

  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; } }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function clearUser() { localStorage.removeItem(USER_KEY); }
  function getOwnerSession() { try { return JSON.parse(localStorage.getItem(OWNER_KEY) || 'null'); } catch (e) { return null; } }
  function setOwnerSession(s) { localStorage.setItem(OWNER_KEY, JSON.stringify(s)); }
  function clearOwnerSession() { localStorage.removeItem(OWNER_KEY); }
  function ownerHeaders() {
    const s = getOwnerSession();
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s ? s.token : '') };
  }

  async function req(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    let res;
    try {
      res = await fetch(BASE + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (netErr) {
      throw { networkError: true, message: 'Could not reach GeoEstate servers. Check your connection.' };
    }
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
      const err = new Error(data.error || ('Request failed (' + res.status + ')'));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }
  function ownerReq(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, ownerHeaders(), opts.headers || {});
    return req(path, opts);
  }

  function safeParseArr(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { return JSON.parse(v) || []; } catch (e) { return []; } }
    return [];
  }

  function mapProperty(p) {
    if (!p) return p;
    const lt = p.listing_type || p.type || 'rent';
    // p.price is the authoritative, already-correctly-formatted price the
    // backend saves at submission time (e.g. "₦1,200,000/yr" for standard
    // tenancy rentals — Nigerian rent is paid annually upfront, not
    // monthly). monthly_rent only exists as a derived-for-DB-compat value
    // (annual ÷ 12) and must never be preferred over it, or displayed as
    // "/mo" — that's actively misleading about how the rent is actually paid.
    let displayPrice = p.price ? (/^\d+$/.test(String(p.price)) ? '₦' + Number(p.price).toLocaleString() : p.price) : '';
    if (!displayPrice) {
      if (lt === 'rent' && p.annual_rent) displayPrice = '₦' + Number(p.annual_rent).toLocaleString() + '/yr';
      else if (lt === 'rent' && p.nightly_rate) displayPrice = '₦' + Number(p.nightly_rate).toLocaleString() + '/night';
      else if (lt === 'rent' && p.monthly_rent) displayPrice = '₦' + Number(p.monthly_rent * 12).toLocaleString() + '/yr';
      else if (lt === 'buy' && p.sale_price) displayPrice = '₦' + Number(p.sale_price).toLocaleString();
      else if (lt === 'lease' && p.lease_price) displayPrice = '₦' + Number(p.lease_price).toLocaleString() + '/yr';
    }
    const images = safeParseArr(p.images);
    const amenities = safeParseArr(p.amenities);
    return Object.assign({}, p, {
      listing_type: lt, type: lt,
      price: displayPrice || p.price || '—',
      location: [p.lga, p.state].filter(Boolean).join(', ') || p.address || '—',
      images, amenities,
      img: p.img || images[0] || ''
    });
  }

  const GeoAPI = {
    BASE,
    // ---- session ----
    getUser, setUser, clearUser, isLoggedIn: () => !!getUser(),
    getOwnerSession, setOwnerSession, clearOwnerSession, isOwnerLoggedIn: () => !!getOwnerSession(),

    // ---- Public ----
    async listProperties(opts) {
      opts = opts || {};
      const params = [];
      if (opts.type && opts.type !== 'all') params.push('type=' + encodeURIComponent(opts.type));
      if (opts.state) params.push('state=' + encodeURIComponent(opts.state));
      if (opts.q) params.push('q=' + encodeURIComponent(opts.q));
      const qs = params.length ? '?' + params.join('&') : '';
      const d = await req('/properties' + qs);
      return (d.properties || []).map(mapProperty);
    },
    async getProperty(id) {
      const d = await req('/properties/' + encodeURIComponent(id));
      return mapProperty(d.property);
    },
    async submitEnquiry(payload) { return req('/enquiry', { method: 'POST', body: payload }); },
    async submitPayment(payload) { return req('/submit-payment', { method: 'POST', body: payload }); },
    async getAvailability(propertyId) {
      const d = await req('/properties/' + encodeURIComponent(propertyId) + '/availability');
      return d.booked || [];
    },
    async sendOTP(email, name, purpose) { return req('/send-otp', { method: 'POST', body: { email, name, purpose } }); },
    async verifyOTP(email, code) { return req('/verify-otp', { method: 'POST', body: { email, code } }); },
    async register(payload) {
      const d = await req('/register', { method: 'POST', body: payload });
      // Backend now issues an owner-session token straight from /register (no
      // "user" object though — just submissionId), so build the session owner
      // from the payload we just sent, mirroring the website's doRegister().
      if (d.token) {
        const owner = {
          id: d.submissionId || ('USR-' + Date.now()),
          fname: payload.fname, lname: payload.lname,
          email: payload.email, phone: payload.phone, role: payload.role
        };
        setOwnerSession({ token: d.token, owner, loginTime: Date.now() });
      }
      return d;
    },
    async userLogin(email, password) {
      const d = await req('/user/login', { method: 'POST', body: { email, password } });
      if (d.user) setUser(d.user);
      // Bridge straight into an owner session (mirrors the website's doLogin()):
      // backend now returns a token here too, so returning users skip the OTP screen.
      if (d.token) setOwnerSession({ token: d.token, owner: d.user, loginTime: Date.now() });
      return d.user;
    },
    logoutUser() { clearUser(); },

    // ---- Owner ----
    async ownerRequestOTP(email) { return req('/owner/login', { method: 'POST', body: { email } }); },
    async ownerVerifyOTP(email, code) {
      const d = await req('/owner/login', { method: 'POST', body: { email, code } });
      if (d.token) setOwnerSession({ token: d.token, owner: d.owner });
      return d;
    },
    logoutOwner() { clearOwnerSession(); },
    async ownerProfile() { const d = await ownerReq('/owner/profile'); return d.profile; },
    async ownerProperties(type) {
      const qs = type && type !== 'all' ? '?type=' + type : '';
      const d = await ownerReq('/owner/properties' + qs);
      return (d.properties || []).map(mapProperty);
    },
    async ownerPropertyDetail(id) {
      const d = await ownerReq('/owner/property/' + encodeURIComponent(id) + '/detail');
      return mapProperty(d.property || d);
    },
    async ownerAddProperty(payload) { return ownerReq('/owner/add-property', { method: 'POST', body: payload }); },
    async ownerVerifyIdentity(payload) { return ownerReq('/owner/verify-identity', { method: 'POST', body: payload }); },
    async ownerEnquiries() { const d = await ownerReq('/owner/enquiries'); return d.enquiries || []; },
    async ownerTenancies() { const d = await ownerReq('/owner/tenancies'); return d.tenancies || []; },
    async ownerUnits(propId) { return ownerReq('/owner/property/' + encodeURIComponent(propId) + '/units'); },
    async ownerAddUnit(propId, payload) { return ownerReq('/owner/property/' + encodeURIComponent(propId) + '/units', { method: 'POST', body: payload }); },
    async ownerUpdateUnit(propId, unitId, payload) { return ownerReq('/owner/property/' + encodeURIComponent(propId) + '/units/' + unitId, { method: 'PATCH', body: payload }); },

    // ---- Uploads (Supabase signed PUT) ----
    async uploadSign(folder, ext) { return req('/upload-sign', { method: 'POST', body: { folder, ext } }); },
    async uploadFile(file, folder, attempt = 1) {
      const MAX_ATTEMPTS = 3;
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const sign = await this.uploadSign(folder, ext);
        const putRes = await fetch(sign.signedUrl || sign.signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        });
        if (!putRes.ok) throw new Error('Upload failed');
        return sign.publicUrl || sign.public_url;
      } catch (e) {
        // Mobile connections frequently hand off between wifi/cellular mid-upload
        // (net::ERR_NETWORK_CHANGED); retry a couple of times before giving up
        // rather than failing on the first transient blip.
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 600 * attempt));
          return this.uploadFile(file, folder, attempt + 1);
        }
        throw new Error('Could not upload "' + file.name + '" — check your connection and try again');
      }
    },

    // ---- Team (static fallback — no public team endpoint on backend) ----
    team() {
      return [
        { name: 'Majekodunmi Lateefat', title: 'Sales Manager', email: 'mlateefat95@gmail.com', phone: '+2348133343645', whatsapp: '2348133343645', img: 'assets/Majekodunmi Lateefah - Sales Manager.jpeg' },
        { name: 'Adesina Faridat Adenike', title: 'Sales Manager', email: 'faridat3008@gmail.com', phone: '+2349131916831', whatsapp: '2349131916831', img: '' },
        { name: 'AbdulAzeez Hassan', title: 'Project Team Lead', email: '', phone: '', whatsapp: '', img: 'assets/AbdulAzeez Hassan - Project Team Lead.jpeg' },
        { name: 'Idris Popoola', title: 'CEO / Founder', email: '', phone: '', whatsapp: '', img: 'assets/ceo-idris.png' }
      ];
    },

    mapProperty
  };

  window.GeoAPI = GeoAPI;
})(window);
