// nav.js — robuuste navigatie + login/logout (desktop & mobiel)
import { supabase } from './supabaseClient.js';

/* ========== helpers ========== */
const $ = (id) => document.getElementById(id);

function closeMenuIfOpen() {
  const menu   = $('site-menu');
  const toggle = $('nav-toggle');
  if (!menu || !toggle) return;
  if (menu.dataset.open === 'true') {
    toggle.setAttribute('aria-expanded', 'false');
    menu.dataset.open = 'false';
    document.body.classList.remove('body--no-scroll');
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 150));
  }
}

function hardNavigate(href, { replace = false } = {}) {
  closeMenuIfOpen();
  if (replace) location.replace(href);
  else location.assign(href);
}

async function getSessionSafe() {
  try { return (await supabase.auth.getSession()).data.session; }
  catch { return null; }
}

function clearSupabaseStorage() {
  try {
    Object.keys(localStorage).forEach(k => k.startsWith('sb-') && localStorage.removeItem(k));
    Object.keys(sessionStorage).forEach(k => k.startsWith('sb-') && sessionStorage.removeItem(k));
  } catch {}
}

/* ========== UI state ========== */
export async function updateNavUI() {
  const session = await getSessionSafe();
  const isLoggedIn = !!session;

  document.body.classList.toggle('is-auth', isLoggedIn);
  document.body.classList.toggle('is-guest', !isLoggedIn);

  // Toon/verberg links met .auth-only
  document.querySelectorAll('.auth-only').forEach(li => { li.style.display = isLoggedIn ? '' : 'none'; });

  // NEW: admin-only toggling
  let isAdmin = false;
  if (isLoggedIn) {
    try {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      isAdmin = prof?.role === 'admin';
    } catch {}
  }
  document.querySelectorAll('.admin-only').forEach(li => { li.style.display = (isLoggedIn && isAdmin) ? '' : 'none'; });

  // Auth-knop: Inloggen ↔ Uitloggen
  const authBtn = $('nav-auth');
  if (authBtn) {
    authBtn.type = 'button';
    authBtn.textContent = isLoggedIn ? 'Uitloggen' : 'Inloggen';
    authBtn.setAttribute('data-auth-mode', isLoggedIn ? 'logout' : 'login');
  }

  setActiveLink();
}

function setActiveLink() {
  const current = new URL(location.href);
  document.querySelectorAll('#site-menu .nav-links a').forEach(a => {
    try {
      const href = new URL(a.getAttribute('href'), location.origin);
      if (href.pathname.replace(/\/+$/,'') === current.pathname.replace(/\/+$/,'')) {
        a.setAttribute('aria-current','page');
      } else {
        a.removeAttribute('aria-current');
      }
    } catch {}
  });
}

/* ========== auth actions ========== */
async function robustSignOut() {
  document.body.classList.add('is-guest');
  document.body.classList.remove('is-auth');

  try {
    let { error } = await supabase.auth.signOut();
    if (error) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  } catch {}
  clearSupabaseStorage();

  const t0 = Date.now();
  while (Date.now() - t0 < 250) {
    const s = await getSessionSafe();
    if (!s) break;
    await new Promise(r => setTimeout(r, 60));
  }
}

/* ========== bindings ========== */
function bindNavLinks() {
  const map = [
    ['nav-bereken',  '/stap1.html'],
    ['nav-mestplan', '/mestplan.html'],
    ['nav-upload',   '/upload.html'],   // NEW
    ['nav-account',  '/account.html'],
    ['nav-beheer',   '/beheer.html'],   // NEW (admin-only)
  ];
  for (const [id, href] of map) {
    const el = $(id);
    if (!el) continue;
    const go = (e) => { e.preventDefault(); hardNavigate(href); };
    el.addEventListener('click', go, { passive: false });
    el.addEventListener('pointerup', go, { passive: false });
  }
}

async function handleAuthClick(e, btn) {
  e.preventDefault();
  const mode = btn.getAttribute('data-auth-mode');
  if (mode === 'logout') {
    btn.disabled = true;
    btn.textContent = 'Uitloggen…';
    await robustSignOut();
    hardNavigate('/account.html?logout=1', { replace: true });
  } else {
    hardNavigate('/account.html?signin=1', { replace: false });
  }
}

function bindAuthButton() {
  const btn = $('nav-auth');
  if (btn && !btn.dataset.bound) {
    const on = (e) => handleAuthClick(e, btn);
    btn.addEventListener('click', on, { passive: false });
    btn.addEventListener('pointerup', on, { passive: false });
    btn.dataset.bound = 'true';
  }
  if (!document.body.dataset.authDelegated) {
    const delegate = (e) => {
      const tgt = e.target?.closest?.('#nav-auth');
      if (!tgt) return;
      e.preventDefault();
      handleAuthClick(e, tgt);
    };
    document.addEventListener('click', delegate, { passive: false });
    document.addEventListener('pointerup', delegate, { passive: false });
    document.body.dataset.authDelegated = 'true';
  }
}

/* ========== route guard ========== */
async function guardProtectedPages() {
  const slug = location.pathname.replace(/\/+$/, '').split('/').pop().toLowerCase();
  const protectedSet = new Set(['stap1', 'stap1.html', 'mestplan', 'mestplan.html']);
  if (!protectedSet.has(slug)) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.assign('account.html?signin=1');
  }
}

/* ========== init ========== */
document.addEventListener('DOMContentLoaded', async () => {
  await updateNavUI();
  bindNavLinks();
  bindAuthButton();
  await guardProtectedPages();

  supabase.auth.onAuthStateChange(() => { updateNavUI(); });
  window.addEventListener('pageshow', () => { updateNavUI(); });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', closeMenuIfOpen);
});
