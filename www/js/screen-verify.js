// ============================================================
// GeoEstate v2 — Verify Identity screen (owner)
// ============================================================
(function (window) {
  'use strict';
  const { esc, toast, setBtnLoading } = window.GeoUtil;
  const API = window.GeoAPI;

  async function pickAndUpload(inputEl, folder, previewEl) {
    return new Promise((resolve) => {
      inputEl.onchange = async () => {
        const file = inputEl.files[0];
        if (!file) return resolve(null);
        previewEl.textContent = 'Uploading…';
        try {
          const url = await API.uploadFile(file, folder);
          previewEl.textContent = '✓ Uploaded';
          previewEl.dataset.url = url;
          resolve(url);
        } catch (e) {
          previewEl.textContent = 'Upload failed';
          toast(e.message || 'Upload failed', 'error');
          resolve(null);
        }
      };
      inputEl.click();
    });
  }

  async function render(main) {
    if (!API.isOwnerLoggedIn()) {
      main.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🪪</div><div class="empty-state__title">Sign in required</div><div class="empty-state__sub mb-6">Sign in as a property owner to verify your identity.</div><button class="btn btn-primary" onclick="GeoApp.openAuth('owner')">Sign in as Owner</button></div>`;
      return;
    }
    let profile;
    try { profile = await API.ownerProfile(); } catch (e) { profile = {}; }
    if (profile.is_verified) {
      main.innerHTML = `<div class="empty-state"><div class="empty-state__icon">✅</div><div class="empty-state__title">Already Verified</div><div class="empty-state__sub">Your identity has been verified. You're all set to list properties.</div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="geo-section">
        <div class="h3 mb-2">Verify Your Identity</div>
        <div class="text-muted text-sm mb-6">One-time verification required before listing properties. Usually reviewed within 24 hours.</div>

        <div class="field"><label>NIN (National Identification Number)</label><input class="input" id="v-nin" maxlength="11" placeholder="11-digit NIN"></div>
        <div class="field"><label>Date of Birth</label><input class="input" id="v-dob" type="date"></div>
        <div class="field"><label>Gender</label>
          <select class="input" id="v-gender"><option value="">Select</option><option>Male</option><option>Female</option></select>
        </div>
        <div class="field"><label>Occupation</label><input class="input" id="v-occupation"></div>
        <div class="input-row">
          <div class="field w-full"><label>State</label><input class="input" id="v-state"></div>
          <div class="field w-full"><label>LGA</label><input class="input" id="v-lga"></div>
        </div>
        <div class="field"><label>Address</label><input class="input" id="v-address"></div>

        <div class="divider"></div>
        <div class="h4 mb-3">Next of Kin</div>
        <div class="field"><label>Full Name</label><input class="input" id="v-nok-name"></div>
        <div class="input-row">
          <div class="field w-full"><label>Relationship</label><input class="input" id="v-nok-rel"></div>
          <div class="field w-full"><label>Phone</label><input class="input" id="v-nok-phone" type="tel"></div>
        </div>

        <div class="divider"></div>
        <div class="h4 mb-3">Documents</div>
        <div class="field">
          <label>Selfie Photo</label>
          <button class="btn btn-outline btn-block" id="v-selfie-btn">📷 Upload Selfie</button>
          <input type="file" accept="image/*" capture="user" id="v-selfie-input" class="hidden">
          <div class="text-xs text-muted mt-2" id="v-selfie-status">No file selected</div>
        </div>
        <div class="field">
          <label>ID Document (NIN slip, Passport, etc.)</label>
          <select class="input mb-2" id="v-doctype"><option value="nin_slip">NIN Slip</option><option value="passport">International Passport</option><option value="drivers_license">Driver's License</option><option value="voters_card">Voter's Card</option></select>
          <button class="btn btn-outline btn-block" id="v-doc-btn">📄 Upload Document</button>
          <input type="file" accept="image/*,.pdf" id="v-doc-input" class="hidden">
          <div class="text-xs text-muted mt-2" id="v-doc-status">No file selected</div>
        </div>

        <button class="btn btn-primary btn-block mt-4" id="v-submit">Submit for Verification</button>
      </div>
    `;

    document.getElementById('v-selfie-btn').onclick = () => pickAndUpload(document.getElementById('v-selfie-input'), 'owner-selfies', document.getElementById('v-selfie-status'));
    document.getElementById('v-doc-btn').onclick = () => pickAndUpload(document.getElementById('v-doc-input'), 'owner-docs', document.getElementById('v-doc-status'));

    document.getElementById('v-submit').onclick = async (e) => {
      const nin = document.getElementById('v-nin').value.trim();
      const selfie_url = document.getElementById('v-selfie-status').dataset.url || '';
      const doc_url = document.getElementById('v-doc-status').dataset.url || '';
      if (!nin || nin.length !== 11) return toast('Enter a valid 11-digit NIN', 'error');
      if (!selfie_url || !doc_url) return toast('Please upload both selfie and ID document', 'error');
      setBtnLoading(e.target, true);
      try {
        const res = await API.ownerVerifyIdentity({
          nin, doc_type: document.getElementById('v-doctype').value, doc_url, selfie_url,
          dob: document.getElementById('v-dob').value,
          gender: document.getElementById('v-gender').value,
          occupation: document.getElementById('v-occupation').value,
          state: document.getElementById('v-state').value,
          lga: document.getElementById('v-lga').value,
          address: document.getElementById('v-address').value,
          next_of_kin: document.getElementById('v-nok-name').value,
          next_of_kin_rel: document.getElementById('v-nok-rel').value,
          next_of_kin_phone: document.getElementById('v-nok-phone').value
        });
        toast(res.message || 'Submitted for review', 'success');
        window.GeoRouter.go('owner');
      } catch (err) { toast(err.message || 'Submission failed', 'error'); }
      setBtnLoading(e.target, false, 'Submit for Verification');
    };
  }

  window.GeoRouter.register('verify', render);
})(window);
