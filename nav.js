// nav.js
import { supabase } from './supabaseClient.js';

function closeMenuIfOpen() {
  const menu = document.getElementById('site-menu');
  const toggle = document.getElementById('nav-toggle');
  if (menu && toggle && menu.dataset.open === 'true') {
    toggle.setAttribute('aria-expanded', 'false');
    menu.dataset.open = 'false';
    document.body.classList.remove('body--no-scroll');
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 150));
  }
}
function navigate(href){ closeMenuIfOpen(); window.location.href = href; }

async function updateNavUI() {
  const { data, error } = await supabase.auth.getSession();
  if (error) { console.error('Sessie ophalen mislukt:', error.message); return; }
  const session = data.session;

  document.body.classList.toggle('is-auth',  !!session);
  document.body.classList.toggle('is-guest', !session);

  // Toggle-knop label/stand
  const btn = document.getElementById('nav-auth');
  if (btn) {
    const label = session ? 'Uitloggen' : 'Inloggen';
    btn.textContent = label;
    btn.setAttribute('data-auth-mode', session ? 'logout' : 'login');
  }
}

function setActiveLink() {
  const currentPath = location.pathname.replace(/\/+$/, '');
  document.querySelectorAll('#site-menu .nav-links a').forEach(a => {
    try {
      const linkPath = new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/, '');
      if (linkPath && linkPath === currentPath) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    } catch { /* noop */ }
  });
}

function bindNavLinks() {
  const bind = (id, href) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', e => { e.preventDefault(); navigate(href); });
  };
  bind('nav-bereken',  'stap1.html');
  bind('nav-mestplan', 'mestplan.html');
  bind('nav-account',  'account.html');
}

function bindAuthToggle() {
  const btn = document.getElementById('nav-auth');
  if (!btn || btn.dataset.bound === 'true') return;

  btn.addEventListener('click', async e => {
    e.preventDefault();
    const mode = btn.getAttribute('data-auth-mode');
    if (mode === 'logout') {
      btn.disabled = true;
      const { error } = await supabase.auth.signOut();
      btn.disabled = false;
      if (error) { console.error('Uitloggen mislukt:', error.message); alert('Uitloggen mislukt. Probeer opnieuw.'); return; }
      await updateNavUI();
      navigate('account.html');
    } else {
      navigate('account.html'); // login-flow start
    }
  });
  btn.dataset.bound = 'true';
}

document.addEventListener('DOMContentLoaded', async () => {
  await updateNavUI();     // zet body-classes + knoplabel
  bindNavLinks();          // overige links
  bindAuthToggle();        // 1 knop die wisselt
  setActiveLink();

  supabase.auth.onAuthStateChange(async () => {
    await updateNavUI();   // label updaten bij statuswijziging
  });
});
