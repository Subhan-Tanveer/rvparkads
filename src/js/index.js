import { initPage } from './core.js';
import { PLANS, formatUsd } from './plans-data.js';
import { gsap } from 'gsap';

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

initPage();

fetch('/api/account').then((res) => {
  if (!res.ok) return;
  const link = document.getElementById('accountLink');
  link.textContent = 'My Account';
  link.href = 'dashboard.html';
}).catch(() => {});

// Subtle 3D tilt on pricing cards, following the pointer — skipped
// entirely on touch devices where there's no hover to react to.
if (window.matchMedia('(hover: hover)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  grid.querySelectorAll('.plan-card').forEach((card) => {
    const rotateX = gsap.quickTo(card, 'rotateX', { duration: 0.4, ease: 'power2.out' });
    const rotateY = gsap.quickTo(card, 'rotateY', { duration: 0.4, ease: 'power2.out' });
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      rotateY(px * 8);
      rotateX(py * -8);
    });
    card.addEventListener('mouseleave', () => { rotateX(0); rotateY(0); });
  });
}

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
    if (res.status === 401) {
      window.location.href = `login.html?plan=${encodeURIComponent(planKey)}`;
      return;
    }
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
