import { initPage } from './core.js';
import { upload } from '@vercel/blob/client';

initPage();

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session_id');

const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const formShell = document.getElementById('formShell');
const successState = document.getElementById('successState');
const planLabel = document.getElementById('planLabel');
const form = document.getElementById('listingForm');
const submitBtn = document.getElementById('submitBtn');
const formAlert = document.getElementById('formAlert');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');

const PLAN_LABELS = { level1: 'Level 1 — $99/month', level2: 'Level 2 — $299/month', level3: 'Level 3 — $499/month' };

function showError(message) {
  loadingState.style.display = 'none';
  errorState.style.display = 'block';
  errorState.querySelector('h2').textContent = 'Something went wrong';
  document.getElementById('errorMessage').textContent = message;
}

function showForm(planKeyLabel) {
  planLabel.textContent = planKeyLabel;
  loadingState.style.display = 'none';
  formShell.style.display = 'block';
}

function showAlreadyListed() {
  loadingState.style.display = 'none';
  successState.style.display = 'block';
  document.getElementById('successMessage').textContent = "You've already submitted your listing's details — we'll be in touch shortly.";
}

// Two ways to land here: fresh from a Stripe redirect (?session_id=...,
// needs verifying + attaching to the account), or returning later to
// finish/pick back up a listing for a plan already on the account (no
// session_id — just needs the account to actually have a plan).
async function init() {
  const accountRes = await fetch('/api/account');
  if (accountRes.status === 401) {
    window.location.href = 'login.html';
    return;
  }
  const account = await accountRes.json();
  if (!accountRes.ok) return showError(account.error || 'Could not load your account');
  if (account.listing) return showAlreadyListed();

  if (sessionId) {
    try {
      const res = await fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not verify your payment');
      if (!data.paid) return showError("We couldn't confirm your payment yet. If you just paid, wait a moment and refresh this page.");
      if (data.alreadyListed) return showAlreadyListed();
      showForm(`Payment Confirmed — ${PLAN_LABELS[data.planKey] || 'Your Plan'}`);
    } catch (err) {
      showError(err.message);
    }
    return;
  }

  if (!account.plan) return showError('Choose a plan first to start your listing.');
  showForm(PLAN_LABELS[account.plan.key] || account.plan.name);
}

init();

// Toggles which field group shows (park vs lot) and swaps the labels that
// read as one or the other — both groups share the same underlying
// `listingName`/`listingAddress`/`amenities`/`ownerFinancing` field names,
// so nothing needs remapping on submit beyond reading whichever inputs
// are actually visible.
const parkFields = document.getElementById('parkFields');
const lotFields = document.getElementById('lotFields');
function applyCategory(category) {
  const isLot = category === 'lot';
  parkFields.style.display = isLot ? 'none' : 'contents';
  lotFields.style.display = isLot ? 'contents' : 'none';
  document.getElementById('listingNameLabel').textContent = isLot ? 'Lot Name *' : 'Park Name *';
  document.getElementById('listingAddressLabel').textContent = isLot ? 'Lot Address *' : 'Park Address *';
  document.getElementById('descriptionLabel').firstChild.textContent = isLot ? 'Lot Description ' : 'Park Description ';
}
form.querySelectorAll('input[name="category"]').forEach((el) => {
  el.addEventListener('change', () => applyCategory(el.value));
});
applyCategory('park');

let uploadedPhotos = [];

photoInput.addEventListener('change', async () => {
  const files = Array.from(photoInput.files || []);
  if (!files.length) return;
  if (uploadedPhotos.length + files.length > 15) {
    alert('You can upload up to 15 photos total.');
    return;
  }

  for (const file of files) {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'aspect-ratio:1; border-radius:8px; background:#eef2f5; display:flex; align-items:center; justify-content:center; font-size:0.75rem; color:#5b6b78;';
    placeholder.textContent = 'Uploading…';
    photoPreview.appendChild(placeholder);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const blob = await upload(`listings/${Date.now()}-${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload-token',
        clientPayload: JSON.stringify({ sessionId, count: uploadedPhotos.length + 1 }),
      });
      uploadedPhotos.push(blob.url);
      const img = document.createElement('img');
      img.src = blob.url;
      placeholder.replaceWith(img);
    } catch (err) {
      console.error('Photo upload failed:', err.message);
      placeholder.textContent = 'Failed';
      placeholder.style.color = '#b3261e';
    }
  }
  photoInput.value = '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formAlert.className = 'form-alert';
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>Submitting…</span>';

  const data = Object.fromEntries(new FormData(form).entries());
  const amenities = Array.from(form.querySelectorAll('input[name="amenities"]:checked')).map((el) => el.value);
  const features = Array.from(form.querySelectorAll('input[name="features"]:checked')).map((el) => el.value);
  const rentalTypes = Array.from(form.querySelectorAll('input[name="rentalTypes"]:checked')).map((el) => el.value);
  const ownerFinancing = document.getElementById('ownerFinancingPark').checked || document.getElementById('ownerFinancingLot').checked;
  const expansionLand = document.getElementById('expansionLand').checked;

  try {
    const res = await fetch('/api/submit-listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, amenities, features, rentalTypes, ownerFinancing, expansionLand, sessionId, photoUrls: uploadedPhotos }),
    });
    if (res.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not submit your listing');

    formShell.style.display = 'none';
    successState.style.display = 'block';
    document.getElementById('successMessage').textContent =
      "We've received your listing's details and sent a confirmation to your email. Your listing will be live shortly.";
  } catch (err) {
    formAlert.textContent = err.message;
    formAlert.className = 'form-alert error is-visible';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Submit My Listing</span>';
  }
});
