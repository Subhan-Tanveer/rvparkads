import { initReveal } from './core.js';
import { PLANS, formatUsd } from './plans-data.js';

initReveal();

const grid = document.getElementById('plansGrid');

function planCard(plan) {
  const card = document.createElement('div');
  card.className = 'plan-card' + (plan.featured ? ' featured' : '');
  card.innerHTML = `
    ${plan.badgeLabel ? `<span class="plan-badge">${plan.badgeLabel}</span>` : ''}
    <h3>${plan.name}</h3>
    <p class="plan-tagline">${plan.tagline}</p>
    <div class="plan-price"><span class="amount">${formatUsd(plan.monthly)}</span><span class="period">/month</span></div>
    ${plan.minMonths ? `<p class="plan-min">${plan.minMonths}-month minimum</p>` : '<p class="plan-min">&nbsp;</p>'}
    <ul class="plan-features">
      ${plan.includesPrior ? `<li class="includes-prior"><span class="check">&check;</span>${plan.includesPrior}</li>` : ''}
      ${plan.features.map((f) => `<li><span class="check">&check;</span>${f}</li>`).join('')}
    </ul>
    <button type="button" class="btn ${plan.featured ? 'btn-primary' : 'btn-ghost'}" data-plan="${plan.key}"><span>Get Started</span></button>
  `;
  return card;
}

PLANS.forEach((plan) => grid.appendChild(planCard(plan)));

grid.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-plan]');
  if (!btn) return;
  const planKey = btn.dataset.plan;
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Redirecting…</span>';

  try {
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: planKey }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout');
    window.location.href = data.url;
  } catch (err) {
    console.error('Checkout error:', err.message);
    alert('Something went wrong starting checkout. Please try again or contact us directly.');
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
});
