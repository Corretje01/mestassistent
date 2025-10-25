// core/ui/nav.js
// Auth-knop + role-based UI + route-guards (production: minimale logging)
import { supabase } from '../../supabaseClient.js';

/* ---------- helpers ---------- */
const $id = (id) => document.getElementById(id);

const navigateTo = (href, { replace = true } = {}) => {
  try { history.scrollRestoration = 'manual'; } catch {}
  try { if (replace) window.location.replace(href); else window.location.assign(href); } catch {}
};

const getSessionSafe = async () => {
  try { return (await supabase.auth.getSession()).data.session; }
  catch { return null; }
};

const isProtectedPath = () => {
  const p = (window.location.pathname || '').toLowerCase();
  return /(?:^|\/)(plaatsingsruimte|mestplan|beheer)(?:\.html)?$/.test(p);
};

/* ---------- UI helpers ---------- */
const toggleAuthClasses = (isAuth) => {
  document.body.classList.toggle('is-auth',  !!isAuth);
  document.body.classList.toggle('is-guest', !isAuth);
  document.querySelectorAll('.auth-only') .forEach(el => { el.style.display = isAuth ? '' : 'none'; });
  document.querySelectorAll('.guest-only').forEach(el => { el.style.display = isAuth ? 'none' : ''; });
};

const showAdminOnly = (isAdmin) => {
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = isAdmin ? '' : 'none'; });
};

const setActiveLink = () => {
  const current = new URL(location.href);
  document.querySelectorAll('#site-menu .nav-links a').forEach(a => {
    try {
      const href = new URL(a.getAttribute('href'), location.origin);
      const norm = (s) => s.replace(/\/+$/, '');
      if (norm(href.pathname) === norm(current.pathname)) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    } catch {}
  });
};

const fetchIsAdmin = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return false;
    return String(data.role || '').toLowerCase() === 'admin';
  } catch {
    return false;
  }
};

const updateAuthButton = (btn, isAuth) => {
  if (!btn) return;
  btn.type = 'button';
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.dataset.authMode = isAuth ? 'logout' : 'login';
  btn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
};

/* ---------- UI main ---------- */
export async function updateNavUI() {
  const session = await getSessionSafe();
  const isLoggedIn = !!session;

  toggleAuthClasses(isLoggedIn);

  let isAdmin = false;
  if (isLoggedIn) {
    try { isAdmin = await fetchIsAdmin(session.user.id); }
    catch (e) { console.error('[nav] fetchIsAdmin error:', e); }
  }
  showAdminOnly(isAdmin);

  updateAuthButton($id('nav-auth'), isLoggedIn);
  setActiveLink();
}

/* ---------- bindings ---------- */
const bindNavLinks = (els) => {
  const map = [
    [els.lBereken, 'plaatsingsruimte.html'],
    [els.lMestplan, 'mestplan.html'],
    [els.lUpload,   'upload.html'],
    [els.lAccount,  'account.html'],
    [els.lBeheer,   'beheer.html'],
  ];
  for (const [el, href] of map) {
    if (!el) continue;
    const go = (e) => { e.preventDefault(); navigateTo(href); };
    el.addEventListener('click', go, { passive: false });
    el.addEventListener('pointerup', go, { passive: false });
  }
};

const robustSignOutFlow = async (btn) => {
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Uitloggen…'; }
    await supabase.auth.signOut(); // all scopes

    // extra schoonmaak voor zekerheid
    try {
      Object.keys(localStorage).forEach(k => k.startsWith('sb-') && localStorage.removeItem(k));
      Object.keys(sessionStorage).forEach(k => k.startsWith('sb-') && sessionStorage.removeItem(k));
    } catch {}

    // UI meteen updaten en redirecten
    await updateNavUI();

    // Altijd naar home bij uitloggen
    const home = '/index.html';
    navigateTo(home, { replace: true });

    // fallback (heel kort) als browser niets doet
    setTimeout(() => {
      if (!document.hidden && (location.pathname || '').toLowerCase() !== '/index.html') {
        navigateTo(home, { replace: true });
      }
    }, 300);
  } catch (e) {
    console.error('[nav] signOut flow error:', e);
    // Als er iets misgaat: stuur alsnog naar account
    navigateTo('account.html?signin=1', { replace: true });
  }
};

const bindAuthButton = (btn) => {
  if (!btn || btn.dataset.bound) return;

  const on = async (e) => {
    e.preventDefault();
    const session = await getSessionSafe();
    if (session) {
      await robustSignOutFlow(btn);
    } else {
      navigateTo('account.html?signin=1');
    }
  };

  btn.addEventListener('click', on, { passive: false });
  btn.addEventListener('pointerup', on, { passive: false });
  btn.dataset.bound = '1';
};

/* ---------- guards ---------- */
const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  const session = await getSessionSafe();
  if (!session) navigateTo('account.html?signin=1', { replace: true });
};

/* ---------- init ---------- */
const selectEls = () => ({
  authBtn:  $id('nav-auth'),
  lBereken: $id('nav-bereken'),
  lMestplan:$id('nav-mestplan'),
  lUpload:  $id('nav-upload'),
  lAccount: $id('nav-account'),
  lBeheer:  $id('nav-beheer'),
});

document.addEventListener('DOMContentLoaded', async () => {
  const els = selectEls();
  bindNavLinks(els);
  bindAuthButton(els.authBtn);

  await updateNavUI();
  await guardProtectedPages();

  // Auth state → UI + guard
  supabase.auth.onAuthStateChange(async (_evt) => {
    const session = await getSessionSafe();
    await updateNavUI();

    // Als je op een beschermde pagina staat en je bent uitgelogd → weg
    if (!session && isProtectedPath()) {
      navigateTo('/index.html', { replace: true });
    }
  });

  // BFCache / terugknop: verzeker UI consistentie
  window.addEventListener('pageshow', async () => { await updateNavUI(); });
});
