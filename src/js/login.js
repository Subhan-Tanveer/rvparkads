import { initPage } from './core.js';

initPage();

const params = new URLSearchParams(window.location.search);
const intendedPlan = params.get('plan');

const tabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    const isLogin = tab.dataset.tab === 'login';
    loginForm.style.display = isLogin ? 'block' : 'none';
    signupForm.style.display = isLogin ? 'none' : 'block';
  });
});

if (params.get('tab') === 'signup') {
  document.querySelector('[data-tab="signup"]').click();
}

// After a successful login/signup: if the visitor arrived here mid-way
// through picking a plan (Get Started -> 401 -> redirected here), resume
// that checkout automatically instead of dropping them on the dashboard.
async function afterAuth() {
  if (intendedPlan) {
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: intendedPlan }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
    } catch (err) {
      console.error('Resume checkout failed:', err.message);
    }
  }
  window.location.href = 'dashboard.html';
}

function showAlert(el, message, type) {
  el.textContent = message;
  el.className = `form-alert ${type} is-visible`;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertEl = document.getElementById('loginAlert');
  alertEl.className = 'form-alert';
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: document.getElementById('liEmail').value,
        password: document.getElementById('liPassword').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    await afterAuth();
  } catch (err) {
    showAlert(alertEl, err.message, 'error');
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertEl = document.getElementById('signupAlert');
  alertEl.className = 'form-alert';
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'signup',
        firstName: document.getElementById('suFirstName').value,
        lastName: document.getElementById('suLastName').value,
        email: document.getElementById('suEmail').value,
        phone: document.getElementById('suPhone').value,
        password: document.getElementById('suPassword').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
    await afterAuth();
  } catch (err) {
    showAlert(alertEl, err.message, 'error');
  }
});
