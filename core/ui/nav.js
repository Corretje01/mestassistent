// core/ui/nav.js
// Auth-knop + role-based UI + route-guards
// Hardere, robuuste redirect na uitloggen + duidelijke logging

import { supabase } from '../../supabaseClient.js';

/* ============ Logging ============ */
const L = (...args) => console.log('[nav]', ...args);

/* ============ Helpers ============ */
const $id = (id) => document.getElementById(id);

const getSessionSafe = async () => {
  try {
    const s = (await supabase.auth.getSession()).data.session;
    L('getSessionSafe →', s ? 'session aanwezig' : 'geen session');
    return s;
  } catch (e) {
    L('getSessionSafe fout:', e?.message || e);
    return null;
  }
};

const isProtectedPath = () => {
  const p = location.pathname.toLowerCase();
  const match =
    /plaatsingsruimte(\.html)?$/.test(p) ||
    /mestplan(\.html)?$/.test(p) ||
    /beheer(\.html)?$/.test(p);
  L('isProtectedPath(', p, ') →', match);
  return match;
};

const absoluteHome = () => {
  // Ga uit van index.html in dezelfde map als de huidige pagina
  const baseDir = location.origin + location.pathname.replace(/[^/]*$/, '');
  const url = new URL('index.html', baseDir);
  L('absoluteHome →', url.href);
  return url.href;
};

const closeMenuIfOpen = () => {
  const menu = $id('site-menu');
  if (menu && menu.dataset.open === 'true') {
    L('closeMenuIfOpen → sluiten');
    menu.dataset.open = 'false';
    menu.setAttribute('hidden', '');
    document.body.classList.remove('body--no-scroll');
  }
};

/* ============ UI helpers ============ */
const toggleAuthClasses = (isAuth) => {
  document.body.classList.toggle('is-auth',  !!isAuth);
  document.body.classList.toggle('is-guest', !isAuth);
  document.querySelectorAll('.auth-only').forEach(el  => { el.style.display = isAuth ? '' : 'none'; });
  document.querySelectorAll('.guest-only').forEach(el => { el.style.display = isAuth ? 'none' : ''; });
};

const showAdminOnly = (isAdmin) => {
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = isAdmin ? '' : 'none'; });
};

const updateAuthButton = (btn, isAuth) => {
  if (!btn) return;
  btn.type = 'button';
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.dataset.authMode = isAuth ? 'logout' : 'login';
  btn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
};

const setActiveLink = () => {
  const current = new URL(location.href);
  document.querySelectorAll('#site-menu .nav-links a').forEach(a => {
    try {
      const href = new URL(a.getAttribute('href'), location.origin);
      const on = href.pathname.replace(/\/+$/, '') === current.pathname.replace(/\/+$/, '');
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    } catch {}
  });
};

/* ============ Data helpers ============ */
const fetchIsAdmin = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) return false;
    return (data?.role || '').toLowerCase() === 'admin';
  } catch { return false; }
};

/* ============ Public UI update ============ */
export async function updateNavUI() {
  L('updateNavUI → start');
  const session = await getSessionSafe();
  const isLoggedIn = !!session;

  toggleAuthClasses(isLoggedIn);

  let isAdmin = false;
  if (isLoggedIn) {
    try { isAdmin = await fetchIsAdmin(session.user.id); } catch {}
  }
  showAdminOnly(isAdmin);

  updateAuthButton($id('nav-auth'), isLoggedIn);
  setActiveLink();
  L('updateNavUI → klaar (isLoggedIn:', isLoggedIn, ', isAdmin:', isAdmin, ')');
}

/* ============ Redirects ============ */
function redirectHomeNow(reason = 'unknown') {
  const home = absoluteHome();
  const here = location.href;
  const protectedNow = isProtectedPath();

  L('redirectHomeNow → reason:', reason, '| protectedNow:', protectedNow, '| here:', here, '| home:', home);

  try { closeMenuIfOpen(); } catch {}

  // Op beschermde pagina's altijd weg
  if (protectedNow) {
    L('redirect → protected page → location.replace(home)');
    location.replace(home);
    // Fallbacks voor agressieve caches:
    setTimeout(() => { if (location.href !== home) location.assign(home); }, 80);
    setTimeout(() => { if (location.href !== home) location.reload(); }, 160);
    return;
  }

  // Niet beschermd: als we al op home staan → toch replace (refresh)
  if (here === home) {
    L('redirect → al op home → replace/refresh');
    location.replace(home);
    setTimeout(() => { if (location.href !== home) location.reload(); }, 80);
    return;
  }

  // Normaal scenario: ga naar home
  L('redirect → naar home (replace)');
  location.replace(home);
  setTimeout(() => { if (location.href !== home) location.assign(home); }, 80);
  setTimeout(() => { if (location.href !== home) location.reload(); }, 160);
}

/* ============ Bindings ============ */
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
    const go = (e) => { e.preventDefault(); location.assign(href); };
    el.addEventListener('click', go, { passive: false });
    el.addEventListener('pointerup', go, { passive: false });
  }
};

async function robustSignOutFlow(btn) {
  L('robustSignOutFlow → start');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Uitloggen…'; }

    // 1) Supabase sign out (timeout-guard)
    L('robustSignOutFlow → supabase.auth.signOut …');
    const signOut = supabase.auth.signOut();
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('signOut timeout')), 1500));
    await Promise.race([signOut, timeout]).catch(e => { L('signOut race →', e?.message || e); });

    // 2) Tokens lokaal opruimen (best-effort)
    try {
      Object.keys(localStorage).forEach(k => k.startsWith('sb-') && localStorage.removeItem(k));
      Object.keys(sessionStorage).forEach(k => k.startsWith('sb-') && sessionStorage.removeItem(k));
    } catch {}

    // 3) NIET wachten op UI; meteen redirecten
    L('robustSignOutFlow → directe redirect');
    redirectHomeNow('post-signOut');

    // 4) Fire-and-forget UI update (mag falen)
    updateNavUI().catch(()=>{});
  } catch (e) {
    L('robustSignOutFlow fout:', e?.message || e);
    redirectHomeNow('catch');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Inloggen'; }
    L('robustSignOutFlow → einde');
  }
}

const bindAuthButton = (btn) => {
  if (!btn || btn.dataset.bound) return;

  const on = async (e) => {
    e.preventDefault();
    L('authBtn click');
    const session = await getSessionSafe();
    if (session) {
      await robustSignOutFlow(btn);
    } else {
      closeMenuIfOpen();
      location.assign('account.html?signin=1');
    }
  };

  btn.addEventListener('click', on, { passive: false });
  btn.addEventListener('pointerup', on, { passive: false });
  btn.dataset.bound = 'true';
};

/* ============ Guards ============ */
const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  const session = await getSessionSafe();
  if (!session) {
    L('guardProtectedPages → geen session → naar account');
    location.replace('account.html?signin=1');
  }
};

/* ============ Init ============ */
document.addEventListener('DOMContentLoaded', async () => {
  L('init');
  const els = {
    authBtn:  $id('nav-auth'),
    lBereken: $id('nav-bereken'),
    lMestplan:$id('nav-mestplan'),
    lUpload:  $id('nav-upload'),
    lAccount: $id('nav-account'),
    lBeheer:  $id('nav-beheer'),
  };

  bindNavLinks(els);
  bindAuthButton(els.authBtn);

  await updateNavUI();
  await guardProtectedPages();

  // Fallback: als Supabase meldt dat we uitgelogd zijn en we staan op een beschermde pagina → redirect
  supabase.auth.onAuthStateChange(async (evt) => {
    L('onAuthStateChange →', evt);
    if (evt === 'SIGNED_OUT') {
      redirectHomeNow('onAuthStateChange');
      return;
    }
    await updateNavUI();
    if (isProtectedPath()) await guardProtectedPages();
  });

  // BFCache terugkeer
  window.addEventListener('pageshow', async (e) => {
    L('pageshow (persisted:', !!e.persisted, ')');
    await updateNavUI();
    if (e.persisted && isProtectedPath()) {
      const s = await getSessionSafe();
      if (!s) redirectHomeNow('pageshow-persisted-no-session');
    }
  });
});
