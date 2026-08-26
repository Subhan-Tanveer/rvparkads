import { initPage } from './core.js';

initPage();

const loadingState = document.getElementById('loadingState');
const dashboardShell = document.getElementById('dashboardShell');

function formatUsd(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderPlan(plan, subscription) {
  const content = document.getElementById('planContent');
  if (!plan) {
    content.innerHTML = `
      <p class="lede">You haven't chosen a plan yet.</p>
      <a href="index.html#plans" class="btn btn-primary btn-sm"><span>Choose a Plan</span></a>
    `;
    return;
  }

  const statusLabel = subscription?.cancelAtPeriodEnd
    ? `Cancels ${formatDate(subscription.currentPeriodEnd)}`
    : subscription?.status === 'active' ? 'Active' : (subscription?.status || 'Unknown');
  const statusClass = subscription?.cancelAtPeriodEnd ? 'status-canceling' : (subscription?.status === 'active' ? 'status-active' : 'status-other');

  content.innerHTML = `
    <div class="dash-row"><span>Plan</span><strong>${plan.name.replace('RVParkAds.com — ', '')}</strong></div>
    <div class="dash-row"><span>Price</span><strong>${formatUsd(plan.monthly)}/month</strong></div>
    <div class="dash-row"><span>Status</span><strong class="dash-status ${statusClass}">${statusLabel}</strong></div>
    ${subscription && !subscription.cancelAtPeriodEnd ? `<button type="button" class="btn btn-ghost btn-sm" id="cancelBtn" style="margin-top:16px;"><span>Cancel Plan</span></button>` : ''}
    ${subscription?.cancelAtPeriodEnd ? `<p class="hint" style="margin-top:12px;">Your listing stays live until ${formatDate(subscription.currentPeriodEnd)}, then your plan won't renew.</p>` : ''}
  `;

  document.getElementById('cancelBtn')?.addEventListener('click', async (e) => {
    if (!confirm('Cancel your plan? You\'ll keep access until the end of your current billing period.')) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span>Canceling…</span>';
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-subscription' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not cancel your plan');
      renderPlan(plan, data.subscription);
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.innerHTML = '<span>Cancel Plan</span>';
    }
  });
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

    renderPlan(data.plan, data.subscription);

    if (data.listing) {
      document.getElementById('listingCard').style.display = 'block';
      document.getElementById('listingContent').innerHTML = `
        <div class="dash-row"><span>Park Name</span><strong>${data.listing.parkName}</strong></div>
        <div class="dash-row"><span>Address</span><strong>${data.listing.parkAddress}</strong></div>
        <div class="dash-row"><span>Submitted</span><strong>${formatDate(data.listing.createdAt)}</strong></div>
      `;
    } else if (data.plan) {
      document.getElementById('noListingCard').style.display = 'block';
    }

    loadingState.style.display = 'none';
    dashboardShell.style.display = 'block';
  } catch (err) {
    loadingState.querySelector('p').textContent = err.message;
  }
}

init();

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'logout' }),
  });
  window.location.href = 'index.html';
});
