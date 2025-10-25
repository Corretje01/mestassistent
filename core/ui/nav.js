// core/ui/nav.js
// Auth/UI/guards (los van hamburger). Robuust uitloggen + redirect.

import { supabase } from '../../supabaseClient.js';

/* ========== helpers ========== */
const $id = (id) => document.getElementById(id);

function closeMenuIfOpen() {
  const menu = $id('site-menu');
  const toggle = $id('nav-toggle');
  if (!menu || !toggle) return;
  if (menu.dataset.open === 'true') {
    toggle.setAttribute('aria-expanded', 'false');
    menu.dataset.open = 'false';
    document.body.classList.remove('body--no-scroll');
    // verberg na fade
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 150));
  }
}

function hardNavigate(href, { replace = false } = {}) {
  closeMenuIfOpen();
  if (replace) window.location.replace(href);
  else window.location.assign(href);
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

function currentSlug() {
  return location.pathname.replace(/\/+$/, '').split('/').pop().toLowerCase();
}

function isProtectedPath() {
  const slug = currentSlug();
  return new Set(['plaatsingsruimte','plaatsingsruimte.html','mestplan','mestplan.html','beheer','beheer.html']).has(slug);
}

/* ========== UI helpers ========== */
function toggleAuthClasses(isAuth) {
  document.body.classList.toggle('is-auth',  !!isAuth);
  document.body.classList.toggle('is-guest', !isAuth);
  document.querySelectorAll('.auth-only').forEach(el => { el.style.display = isAuth ? '' : 'none'; });
  document.querySelectorAll('.guest-only').forEach(el => { el.style.display = isAuth ? 'none' : ''; });
}

async function fetchIsAdmin(userId) {
  try {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (error) return false;
    return String(data?.role || '').toLowerCase() === 'admin';
  } catch { return false; }
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

function updateAuthButton(btn, isAuth) {
  if (!btn) return;
  btn.type = 'button';
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.dataset.authMode = isAuth ? 'logout' : 'login';
  btn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
}

/* ========== UI sync ========== */
export async function updateNavUI() {
  const session = await getSessionSafe();
  const isAuth = !!session;

  toggleAuthClasses(isAuth);

  // admin-only
  let isAdmin = false;
  if (isAuth) {
    try { isAdmin = await fetchIsAdmin(session.user.id); } catch {}
  }
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = (isAuth && isAdmin) ? '' : 'none'; });

  updateAuthButton($id('nav-auth'), isAuth);
  setActiveLink();

  // log compact
  console.debug('[nav] UI sync – ingelogd:', isAuth);
}

/* ========== bindings ========== */
function bindNavLinks() {
  const map = [
    ['nav-bereken','plaatsingsruimte.html'],
    ['nav-mestplan','mestplan.html'],
    ['nav-upload','upload.html'],
    ['nav-account','account.html'],
    ['nav-beheer','beheer.html'],
  ];
  for (const [id, href] of map) {
    const el = $id(id);
    if (!el) continue;
    const go = (e) => { e.preventDefault(); hardNavigate(href); };
    el.addEventListener('click', go, { passive: false });
    el.addEventListener('pointerup', go, { passive: false });
  }
}

async function robustSignOutFlow(btn) {
  // UI: meteen naar “Inloggen…”
  if (btn) { btn.disabled = true; btn.textContent = 'Uitloggen…'; }

  // 1) server signOut, zo nodig local fallback
  try {
    const { error } = await supabase.auth.signOut(); // all scopes
    if (error) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  } catch {}
  clearSupabaseStorage();

  // 2) korte poll tot sessie echt weg is (max ~1.2s)
  const t0 = Date.now();
  while (Date.now() - t0 < 1200) {
    const s = await getSessionSafe();
    if (!s) break;
    await new Promise(r => setTimeout(r, 80));
  }

  // 3) UI meteen bijwerken
  await updateNavUI();

  // 4) redirect: homepage; als je op een protected pagina bent: altijd weg
  const target = 'index.html';
  if (isProtectedPath()) hardNavigate(target, { replace: true });
  else hardNavigate(target, { replace: true });
}

function bindAuthButton() {
  const btn = $id('nav-auth');
  if (!btn || btn.dataset.bound) return;

  const onClick = async (e) => {
    e.preventDefault();
    const session = await getSessionSafe();
    if (session) {
      // Uitloggen
      console.debug('[nav] Uitloggen → start');
      await robustSignOutFlow(btn);
      return;
    }
    // Inloggen
    hardNavigate('account.html?signin=1');
  };

  btn.addEventListener('click', onClick, { passive: false });
  btn.addEventListener('pointerup', onClick, { passive: false });
  btn.dataset.bound = '1';
}

/* ========== guards ========== */
async function guardProtectedPages() {
  if (!isProtectedPath()) return;
  const session = await getSessionSafe();
  if (!session) {
    console.debug('[nav] Guard → niet ingelogd op protected: redirect');
    hardNavigate('account.html?signin=1', { replace: true });
  }
}

/* ========== init ========== */
document.addEventListener('DOMContentLoaded', async () => {
  console.debug('[nav] init');
  bindNavLinks();
  bindAuthButton();

  await updateNavUI();
  await guardProtectedPages();

  // Auth state events → UI bijwerken en zo nodig guarden
  supabase.auth.onAuthStateChange(async (evt) => {
    console.debug('[nav] onAuthStateChange:', evt);
    await updateNavUI();
    if (isProtectedPath()) await guardProtectedPages();
  });

  // bfcache terug → UI sync
  window.addEventListener('pageshow', async () => { await updateNavUI(); });
});
