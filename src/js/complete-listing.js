import { initReveal } from './core.js';
import { upload } from '@vercel/blob/client';

initReveal();

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

async function init() {
  if (!sessionId) return showError('No checkout session found. Please start from the plans page.');

  try {
    const res = await fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not verify your payment');

    if (!data.paid) return showError("We couldn't confirm your payment yet. If you just paid, wait a moment and refresh this page.");
    if (data.alreadyListed) {
      loadingState.style.display = 'none';
      successState.style.display = 'block';
      document.getElementById('successMessage').textContent = "You've already submitted your park's details for this checkout — we'll be in touch shortly.";
      return;
    }

    if (data.email) document.getElementById('email').value = data.email;
    planLabel.textContent = `Payment Confirmed — ${PLAN_LABELS[data.planKey] || 'Your Plan'}`;

    loadingState.style.display = 'none';
    formShell.style.display = 'block';
  } catch (err) {
    showError(err.message);
  }
}

init();

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
      const blob = await upload(`listings/${sessionId}/${Date.now()}-${safeName}`, file, {
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

  try {
    const res = await fetch('/api/submit-listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, amenities, features, sessionId, photoUrls: uploadedPhotos }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not submit your listing');

    formShell.style.display = 'none';
    successState.style.display = 'block';
    document.getElementById('successMessage').textContent =
      "We've received your park's details and sent a confirmation to your email. Your listing will be live shortly.";
  } catch (err) {
    formAlert.textContent = err.message;
    formAlert.className = 'form-alert error is-visible';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Submit My Listing</span>';
  }
});
