// nav.js
import { supabase } from './supabaseClient.js';

/* =============== Helpers =============== */
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
function navigate(href, { replace = false } = {}) {
  closeMenuIfOpen();
  replace ? window.location.replace(href) : window.location.assign(href);
}
function clearSupabaseLocal() {
  try { Object.keys(localStorage).forEach(k => k.startsWith('sb-') && localStorage.removeItem(k)); } catch {}
}

/* =============== UI state =============== */
export async function updateNavUI() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }
  const session = data.session;
  document.body.classList.toggle('is-auth',  !!session);
  document.body.classList.toggle('is-guest', !session);
}

/* =============== Actieve link (a11y) =============== */
function setActiveLink() {
  const currentPath = location.pathname.replace(/\/+$/, '');
  document.querySelectorAll('#site-menu .nav-links a').forEach(a => {
    try {
      const linkPath = new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/, '');
      if (linkPath && linkPath === currentPath) a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    } catch {}
  });
}

/* =============== Bindings =============== */
function bindClick(id, href) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', e => { e.preventDefault(); navigate(href); });
}
function bindNavLinks() {
  bindClick('nav-bereken',  'stap1.html');
  bindClick('nav-mestplan', 'mestplan.html');
  bindClick('nav-account',  'account.html');
  bindClick('nav-register', 'account.html'); // login start
}
function bindLogout() {
  const btnLogout = document.getElementById('nav-logout');
  if (!btnLogout || btnLogout.dataset.bound === 'true') return;

  btnLogout.setAttribute('type', 'button'); // voorkom form submit
  btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      btnLogout.disabled = true;

      // Sign-out (global) + fallback (local)
      let { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('Global signOut faalde, probeer local:', error.message);
        const res2 = await supabase.auth.signOut({ scope: 'local' });
        if (res2.error) throw res2.error;
      }

      // Meteen lokale tokens weg + UI naar gast
      clearSupabaseLocal();
      document.body.classList.remove('is-auth');
      document.body.classList.add('is-guest');

      // Harde redirect naar account (zonder terug in history)
      navigate('account.html?logout=1', { replace: true });
    } catch (err) {
      console.error('Uitloggen mislukt:', err?.message || err);
      alert('Uitloggen mislukt. Probeer opnieuw.');
      btnLogout.disabled = false;
    }
  });
  btnLogout.dataset.bound = 'true';
}

/* =============== Route guard (optioneel, laat staan als je 'm al gebruikt) =============== */
async function guardProtectedPages() {
  const protectedPages = ['stap1.html', 'mestplan.html'];
  const here = location.pathname.split('/').pop().toLowerCase();
  if (!protectedPages.includes(here)) return;

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    navigate('account.html?signin=1', { replace: true });
  }
}

/* =============== Init =============== */
document.addEventListener('DOMContentLoaded', async () => {
  await updateNavUI();   // zet body-classes (is-auth/is-guest)
  bindNavLinks();        // nav routes (incl. login-link)
  bindLogout();          // uitloggen knop
  setActiveLink();
  await guardProtectedPages();

  // UI updaten zodra sessie wijzigt
  supabase.auth.onAuthStateChange(async () => {
    await updateNavUI();
  });
});
