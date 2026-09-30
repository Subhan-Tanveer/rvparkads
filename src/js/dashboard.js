import { initPage, renderAccountMenu } from './core.js';
import { PLANS } from './plans-data.js';

initPage();

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const loadingState = document.getElementById('loadingState');
const dashboardShell = document.getElementById('dashboardShell');

function formatUsd(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function planOptions(currentKey) {
  return PLANS.map((p) => `<option value="${p.key}" ${p.key === currentKey ? 'selected' : ''}>${p.name} — ${formatUsd(p.monthly)}/mo</option>`).join('');
}

function renderListingCard(listing) {
  const card = document.createElement('div');
  card.className = 'dash-card';

  const sub = listing.subscription;
  const statusLabel = sub?.cancelAtPeriodEnd
    ? `Cancels ${formatDate(sub.currentPeriodEnd)}`
    : sub?.status === 'active' ? 'Active' : (sub?.status || 'Unknown');
  const statusClass = sub?.cancelAtPeriodEnd ? 'status-canceling' : (sub?.status === 'active' ? 'status-active' : 'status-other');
  const locked = sub && !sub.canCancel;

  card.innerHTML = `
    <h3>${listing.listingName} <span class="hint">[${listing.category === 'lot' ? 'Lot' : 'Park'}]</span></h3>
    <div class="dash-row"><span>Address</span><strong>${listing.listingAddress}</strong></div>
    <div class="dash-row"><span>Plan</span><strong>${listing.plan?.name.replace('RVParkAds.com — ', '') || '—'}</strong></div>
    <div class="dash-row"><span>Price</span><strong>${listing.plan ? formatUsd(listing.plan.monthly) + '/month' : '—'}</strong></div>
    <div class="dash-row"><span>Status</span><strong class="dash-status ${statusClass}">${statusLabel}</strong></div>
    <div class="dash-row"><span>Media</span><strong>${listing.photoCount} photo${listing.photoCount === 1 ? '' : 's'}, ${listing.videoCount} video${listing.videoCount === 1 ? '' : 's'}</strong></div>
    ${locked ? `<p class="hint" style="margin-top:8px;">This plan has a ${listing.plan.minMonths}-month minimum — you can cancel starting ${formatDate(sub.cancelEligibleAt)}. Upgrading or downgrading is available anytime.</p>` : ''}
    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:16px;">
      <a href="listing-detail.html?id=${listing.id}" class="btn btn-ghost btn-sm"><span>View Details</span></a>
      <a href="edit-listing.html?id=${listing.id}" class="btn btn-ghost btn-sm"><span>Manage Photos/Videos</span></a>
      ${sub && !sub.cancelAtPeriodEnd ? `
        <select class="plan-select" data-listing-id="${listing.id}" style="padding:10px 12px; border-radius:999px; border:1px solid var(--border-strong); font-size:0.8125rem; font-weight:600;">
          <option value="">Change Plan…</option>
          ${planOptions(listing.plan?.key)}
        </select>
      ` : ''}
      ${sub && !sub.cancelAtPeriodEnd && !locked ? `<button type="button" class="btn btn-ghost btn-sm cancel-btn" data-listing-id="${listing.id}"><span>Cancel Plan</span></button>` : ''}
    </div>
    <div class="form-alert" id="alert-${listing.id}"></div>
  `;

  const select = card.querySelector('.plan-select');
  select?.addEventListener('change', async () => {
    const newPlanKey = select.value;
    if (!newPlanKey || newPlanKey === listing.plan?.key) return;
    const alertEl = card.querySelector(`#alert-${listing.id}`);
    alertEl.className = 'form-alert';
    select.disabled = true;
    try {
      // Plan changes go through a real Stripe-hosted confirmation page (the
      // Billing Portal's "confirm this subscription update" deep link) —
      // the seller sees the exact prorated charge, confirms payment there,
      // and the plan only changes once that clears. This updates the same
      // subscription in place (correct proration), not a duplicate one.
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlanKey, listingId: listing.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start checkout');
      window.location.href = data.url;
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.className = 'form-alert error is-visible';
      select.disabled = false;
      select.value = listing.plan?.key || '';
    }
  });

  card.querySelector('.cancel-btn')?.addEventListener('click', async (e) => {
    if (!confirm(`Cancel the plan for "${listing.listingName}"? You'll keep access until the end of the current billing period.`)) return;
    const btn = e.currentTarget;
    const alertEl = card.querySelector(`#alert-${listing.id}`);
    btn.disabled = true;
    btn.innerHTML = '<span>Canceling…</span>';
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-subscription', listingId: listing.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not cancel');
      alertEl.textContent = 'Plan set to cancel at period end.';
      alertEl.className = 'form-alert success is-visible';
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.className = 'form-alert error is-visible';
      btn.disabled = false;
      btn.innerHTML = '<span>Cancel Plan</span>';
    }
  });

  return card;
}

async function renderAdminListings() {
  const card = document.getElementById('adminListingsCard');
  card.style.display = 'block';
  const res = await fetch('/api/admin-listings');
  const data = await res.json();
  if (!res.ok) {
    document.getElementById('adminListingsList').innerHTML = `<p class="lede">${data.error || 'Could not load listings'}</p>`;
    return;
  }
  if (!data.listings.length) {
    document.getElementById('adminListingsEmpty').style.display = 'block';
    return;
  }
  document.getElementById('adminListingsList').innerHTML = data.listings.map((l) => `
    <div class="dash-row">
      <span>[${l.category === 'lot' ? 'Lot' : 'Park'}] ${l.listingName} — ${l.sellerName}</span>
      <span style="display:flex; align-items:center; gap:12px;">
        <strong>${l.planName.replace('RVParkAds.com — ', '')}</strong>
        <a href="listing-detail.html?id=${l.id}" class="hint">View</a>
        <a href="edit-listing.html?id=${l.id}" class="hint">Edit</a>
      </span>
    </div>
  `).join('');
}

async function init() {
  try {
    const res = await fetch('/api/account');
    if (res.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load your account');

    document.getElementById('welcomeHeading').textContent = `Welcome back, ${data.seller.firstName}`;
    document.getElementById('profName').textContent = `${data.seller.firstName} ${data.seller.lastName}`;
    document.getElementById('profEmail').textContent = data.seller.email;
    document.getElementById('profPhone').textContent = data.seller.phone;
    renderAccountMenu(document.getElementById('accountSlot'), data.seller, { includeDashboardLink: false });

    if (data.seller.isAdmin) {
      // An admin account (Marie) manages every listing, not their own —
      // skip the seller-facing listings section entirely.
      await renderAdminListings();
    } else {
      document.getElementById('sellerListingsSection').style.display = 'block';
      const list = document.getElementById('listingsList');
      // Paid but never finished the listing form — give them the way back.
      const pending = data.pendingPurchases || [];
      document.getElementById('pendingPurchases').innerHTML = pending.map((p) => `
        <div class="dash-card" style="border:2px solid var(--green, #2e9b54); margin-bottom:16px;">
          <h3 style="margin-top:0;">Payment received — finish your listing</h3>
          <p class="lede" style="margin-bottom:12px;">You've paid for the ${escapeHtml(p.planName)} plan, but your park details haven't been submitted yet. Nothing shows up on the site until you finish.</p>
          <a class="btn btn-primary" href="complete-listing.html?session_id=${encodeURIComponent(p.sessionId)}"><span>Finish Your Listing</span></a>
        </div>`).join('');
      if (!data.listings.length && !pending.length) {
        document.getElementById('noListingsText').style.display = 'block';
      } else {
        data.listings.forEach((listing) => list.appendChild(renderListingCard(listing)));
      }
    }

    loadingState.style.display = 'none';
    dashboardShell.style.display = 'block';
  } catch (err) {
    loadingState.querySelector('p').textContent = err.message;
  }
}

init();
