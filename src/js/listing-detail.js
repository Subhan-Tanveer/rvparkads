import { initPage, renderAccountMenu } from './core.js';

initPage();

const params = new URLSearchParams(window.location.search);
const listingId = params.get('id');

const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const detailShell = document.getElementById('detailShell');

function formatUsd(cents) {
  if (cents == null) return null;
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function row(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="dash-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function showError(message) {
  loadingState.style.display = 'none';
  errorState.style.display = 'block';
  document.getElementById('errorMessage').textContent = message;
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
  if (res.status === 403) return showError("You're not authorized to view this page.");
  const data = await res.json();
  if (!res.ok) return showError(data.error || 'Could not load this listing');

  const l = data.listing;
  document.title = `${l.parkName} — RVParkAds.com`;
  document.getElementById('planLabel').textContent = l.planName;
  document.getElementById('parkNameHeading').textContent = l.parkName;
  document.getElementById('parkAddressText').textContent = l.parkAddress;

  document.getElementById('dSellerName').textContent = l.sellerName;
  document.getElementById('dSellerEmail').textContent = l.sellerEmail;
  document.getElementById('dSellerPhone').textContent = l.sellerPhone;

  document.getElementById('parkDetailRows').innerHTML = [
    row('Number of Sites', l.numSites),
    row('RV Spaces', l.rvSpaces),
    row('Tent Spaces', l.tentSpaces),
    row('Cabins', l.cabins),
    row('Yurts', l.yurts),
    row('Rental Type', l.rentalType),
    row('Reservation System', l.reservationSystem),
  ].join('') || '<p class="lede">No additional details provided.</p>';

  const financialsHtml = [
    row('Asking Price', formatUsd(l.askingPriceCents)),
    row('Annual Revenue', formatUsd(l.annualRevenueCents)),
    row('Occupancy Rate', l.occupancyRate != null ? `${l.occupancyRate}%` : null),
  ].join('');
  if (financialsHtml) {
    document.getElementById('financialsCard').style.display = 'block';
    document.getElementById('financialsRows').innerHTML = financialsHtml;
  }

  const amenitiesHtml = [
    row('Amenities', l.amenities.length ? l.amenities.join(', ') : null),
    row('Features', l.features.length ? l.features.join(', ') : null),
  ].join('');
  if (amenitiesHtml) {
    document.getElementById('amenitiesCard').style.display = 'block';
    document.getElementById('amenitiesRows').innerHTML = amenitiesHtml;
  }

  if (l.description) {
    document.getElementById('descriptionCard').style.display = 'block';
    document.getElementById('descriptionText').textContent = l.description;
  }

  if (l.photoUrls.length) {
    document.getElementById('photosCard').style.display = 'block';
    document.getElementById('photosGrid').innerHTML = l.photoUrls
      .map((url) => `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Park photo"></a>`)
      .join('');
  }

  document.getElementById('dCreatedAt').textContent = formatDate(l.createdAt);

  loadingState.style.display = 'none';
  detailShell.style.display = 'block';
}

init();
