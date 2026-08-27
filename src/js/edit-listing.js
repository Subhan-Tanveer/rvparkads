import { initPage, renderAccountMenu } from './core.js';
import { upload } from '@vercel/blob/client';
import { PLANS } from './plans-data.js';

initPage();

const params = new URLSearchParams(window.location.search);
const listingId = params.get('id');
const downgradeTo = params.get('downgradeTo');

const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const editShell = document.getElementById('editShell');
const saveBtn = document.getElementById('saveBtn');
const formAlert = document.getElementById('formAlert');

let currentPhotos = [];
let currentVideos = [];
let maxPhotos = 0;
let maxVideos = 0;

function showError(message) {
  loadingState.style.display = 'none';
  errorState.style.display = 'block';
  document.getElementById('errorMessage').textContent = message;
}

function renderThumb(url, isVideo, onRemove) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;';
  wrap.innerHTML = isVideo
    ? `<video src="${url}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px;" muted></video>`
    : `<img src="${url}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px;">`;
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.style.cssText = 'position:absolute; top:4px; right:4px; width:24px; height:24px; border-radius:50%; background:rgba(18,32,44,0.75); color:#fff; border:none; font-size:16px; line-height:1; cursor:pointer;';
  removeBtn.addEventListener('click', onRemove);
  wrap.appendChild(removeBtn);
  return wrap;
}

function renderMedia() {
  document.getElementById('photoCountHint').textContent = `(${currentPhotos.length} / ${maxPhotos})`;
  document.getElementById('videoCountHint').textContent = `(${currentVideos.length} / ${maxVideos})`;
  // Keep the videos card visible whenever there's existing video to remove,
  // even if the target plan allows zero videos — otherwise a downgrade that
  // needs to drop video entirely could never be completed through this UI.
  document.getElementById('videosCard').style.display = (maxVideos > 0 || currentVideos.length > 0) ? 'block' : 'none';

  const photosGrid = document.getElementById('photosGrid');
  photosGrid.innerHTML = '';
  currentPhotos.forEach((url, i) => {
    photosGrid.appendChild(renderThumb(url, false, () => { currentPhotos.splice(i, 1); renderMedia(); }));
  });

  const videosGrid = document.getElementById('videosGrid');
  videosGrid.innerHTML = '';
  currentVideos.forEach((url, i) => {
    videosGrid.appendChild(renderThumb(url, true, () => { currentVideos.splice(i, 1); renderMedia(); }));
  });

  document.getElementById('photoDrop').style.display = currentPhotos.length >= maxPhotos ? 'none' : 'block';
  document.getElementById('videoDrop').style.display = currentVideos.length >= maxVideos ? 'none' : 'block';
}

function setupUpload(inputEl, previewEl, mediaType, isVideo) {
  inputEl.addEventListener('change', async () => {
    const files = Array.from(inputEl.files || []);
    if (!files.length) return;
    const list = isVideo ? currentVideos : currentPhotos;
    const max = isVideo ? maxVideos : maxPhotos;
    if (list.length + files.length > max) {
      alert(`Your plan allows up to ${max} ${mediaType}${max === 1 ? '' : 's'}.`);
      inputEl.value = '';
      return;
    }
    for (const file of files) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'aspect-ratio:1; border-radius:8px; background:#eef2f5; display:flex; align-items:center; justify-content:center; font-size:0.75rem; color:#5b6b78;';
      placeholder.textContent = 'Uploading…';
      previewEl.appendChild(placeholder);
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
        const blob = await upload(`listings/${mediaType}s/${Date.now()}-${safeName}`, file, {
          access: 'public',
          handleUploadUrl: '/api/upload-token',
          clientPayload: JSON.stringify({ listingId, mediaType, count: list.length + 1 }),
        });
        list.push(blob.url);
        placeholder.remove();
        renderMedia();
      } catch (err) {
        console.error(`${mediaType} upload failed:`, err.message);
        placeholder.textContent = 'Failed';
        placeholder.style.color = '#b3261e';
      }
    }
    inputEl.value = '';
  });
}

async function init() {
  if (!listingId) return showError('No listing specified.');

  const accountRes = await fetch('/api/account');
  if (accountRes.status === 401) {
    window.location.href = 'login.html';
    return;
  }
  const account = await accountRes.json();
  if (accountRes.ok) renderAccountMenu(document.getElementById('accountSlot'), account.seller, { includeDashboardLink: false });

  const res = await fetch(`/api/admin-listings?id=${encodeURIComponent(listingId)}`);
  const data = await res.json();
  if (!res.ok) return showError(data.error || 'Could not load this listing');
  const l = data.listing;

  const effectivePlanKey = downgradeTo || l.planKey;
  const effectivePlan = PLANS.find((p) => p.key === effectivePlanKey);
  if (!effectivePlan) return showError('Unknown plan');
  maxPhotos = effectivePlan.maxPhotos;
  maxVideos = effectivePlan.maxVideos;
  currentPhotos = [...l.photoUrls];
  currentVideos = [...l.videoUrls];

  document.getElementById('listingNameHeading').textContent = l.listingName;
  document.getElementById('planLabel').textContent = downgradeTo
    ? `Downgrading to ${effectivePlan.name}`
    : l.planName;
  document.getElementById('modeMessage').textContent = downgradeTo
    ? `Your current media exceeds ${effectivePlan.name}'s limits — remove photos/videos below until you're within ${maxPhotos} photos and ${maxVideos} video${maxVideos === 1 ? '' : 's'}, then confirm.`
    : `Manage this listing's photos and videos — up to ${maxPhotos} photos${maxVideos ? ` and ${maxVideos} video${maxVideos === 1 ? '' : 's'}` : ''} on ${l.planName}.`;

  if (downgradeTo) {
    saveBtn.innerHTML = '<span>Confirm Downgrade</span>';
  }

  renderMedia();
  setupUpload(document.getElementById('photoInput'), document.getElementById('newPhotoPreview'), 'photo', false);
  setupUpload(document.getElementById('videoInput'), document.getElementById('newVideoPreview'), 'video', true);

  loadingState.style.display = 'none';
  editShell.style.display = 'block';
}

init();

saveBtn.addEventListener('click', async () => {
  formAlert.className = 'form-alert';
  saveBtn.disabled = true;
  const originalLabel = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span>Saving…</span>';

  try {
    let res;
    if (downgradeTo) {
      if (currentPhotos.length > maxPhotos || currentVideos.length > maxVideos) {
        throw new Error(`Remove more media first — up to ${maxPhotos} photos and ${maxVideos} videos allowed.`);
      }
      res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm-downgrade', listingId, newPlanKey: downgradeTo, keepPhotoUrls: currentPhotos, keepVideoUrls: currentVideos }),
      });
    } else {
      res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-media', listingId, photoUrls: currentPhotos, videoUrls: currentVideos }),
      });
    }
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not save changes');

    formAlert.textContent = downgradeTo ? 'Plan updated successfully!' : 'Saved!';
    formAlert.className = 'form-alert success is-visible';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
  } catch (err) {
    formAlert.textContent = err.message;
    formAlert.className = 'form-alert error is-visible';
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalLabel;
  }
});
