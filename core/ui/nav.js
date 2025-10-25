// core/ui/nav.js
// Auth-knop + role-based UI + route-guards
// Nu met uitgebreide logging rond sign-out & redirects

import { supabase } from '../../supabaseClient.js';

/* ======================= Logging helper ======================= */
const L = (...args) => console.log('[nav]', ...args);

/* ======================= Helpers ======================= */
const $id = (id) => document.getElementById(id);

const getSessionSafe = async () => {
  try {
    const out = (await supabase.auth.getSession()).data.session;
    L('getSessionSafe →', !!out ? 'session aanwezig' : 'geen session');
    return out;
  } catch (e) {
    L('getSessionSafe fout:', e?.message || e);
    return null;
  }
};

// Hard navigate (BFCache omzeilen)
const hardNavigate = (href, { replace = false } = {}) => {
  L('hardNavigate →', href, '(replace:', !!replace, ')');
  if (replace) window.location.replace(href);
  else window.location.assign(href);
};

// Absoluut pad naar home/index.html (robuust in submap)
const absoluteHome = () => {
  // Base = huidige directory
  const baseDir = location.origin + location.pathname.replace(/[^/]*$/, '');
  const url = new URL('index.html', baseDir);
  L('absoluteHome →', url.href);
  return url;
};

// Sluit mobiel overlay-menu (best-effort; nav-menu.js beheert visueel)
const closeMenuIfOpen = () => {
  const menu = $id('site-menu');
  if (menu && menu.dataset.open === 'true') {
    L('closeMenuIfOpen → menu is open, sluiten');
    menu.dataset.open = 'false';
    menu.setAttribute('hidden', '');
    document.body.classList.remove('body--no-scroll');
  } else {
    L('closeMenuIfOpen → geen open menu gedetecteerd');
  }
};

/* ======================= Routes/guards ======================= */
const isProtectedPath = () => {
  const p = window.location.pathname.toLowerCase();
  const res =
    /plaatsingsruimte(\.html)?$/.test(p) ||
    /mestplan(\.html)?$/.test(p) ||
    /beheer(\.html)?$/.test(p);
  L('isProtectedPath(', p, ') →', res);
  return res;
};

/* ======================= DOM select ======================= */
const selectEls = () => ({
  authBtn:  $id('nav-auth'),
  lBereken: $id('nav-bereken'),
  lMestplan:$id('nav-mestplan'),
  lUpload:  $id('nav-upload'),
  lAccount: $id('nav-account'),
  lBeheer:  $id('nav-beheer'),
});

/* ======================= UI helpers ======================= */
const toggleAuthClasses = (isAuth) => {
  L('toggleAuthClasses → isAuth:', isAuth);
  document.body.classList.toggle('is-auth',  !!isAuth);
  document.body.classList.toggle('is-guest', !isAuth);
  document.querySelectorAll('.auth-only').forEach(el  => { el.style.display = isAuth ? '' : 'none'; });
  document.querySelectorAll('.guest-only').forEach(el => { el.style.display = isAuth ? 'none' : ''; });
};

const showAdminOnly = (isAdmin) => {
  L('showAdminOnly →', isAdmin);
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = isAdmin ? '' : 'none'; });
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

/* ======================= Data helpers ======================= */
const fetchIsAdmin = async (userId) => {
  L('fetchIsAdmin voor user:', userId);
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) { L('fetchIsAdmin fout:', error.message || error); return false; }
    const ok = (data?.role || '').toLowerCase() === 'admin';
    L('fetchIsAdmin →', ok);
    return ok;
  } catch (e) { L('fetchIsAdmin exception:', e?.message || e); return false; }
};

/* ======================= UI updates ======================= */
const updateAuthButton = (btn, isAuth) => {
  if (!btn) return;
  btn.type = 'button';
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.dataset.authMode = isAuth ? 'logout' : 'login';
  btn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
  L('updateAuthButton →', btn.textContent);
};

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

/* ======================= bindings ======================= */
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
    const go = (e) => { e.preventDefault(); L('nav link →', href); hardNavigate(href); };
    el.addEventListener('click', go, { passive: false });
    el.addEventListener('pointerup', go, { passive: false });
  }
};

async function robustSignOutFlow(btn) {
  L('robustSignOutFlow → start');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Uitloggen…'; }
    L('robustSignOutFlow → supabase.auth.signOut (all scopes) …');
    await supabase.auth.signOut();

    L('robustSignOutFlow → lokale storage tokens opruimen');
    try {
      Object.keys(localStorage).forEach(k => k.startsWith('sb-') && localStorage.removeItem(k));
      Object.keys(sessionStorage).forEach(k => k.startsWith('sb-') && sessionStorage.removeItem(k));
    } catch (e) { L('local/session storage cleanup fout:', e?.message || e); }

    L('robustSignOutFlow → updateNavUI na signOut');
    await updateNavUI();

    closeMenuIfOpen();

    const home = absoluteHome();
    const protectedNow = isProtectedPath();
    const onHome = (location.href === home.href);
    L('robustSignOutFlow → branch-keuze', { protectedNow, onHome, here: location.href, home: home.href });

    if (protectedNow) {
      L('robustSignOutFlow → protected pagina → redirect replace naar home');
      location.replace(home.href);
      return;
    }

    if (!onHome) {
      L('robustSignOutFlow → niet op home → redirect replace naar home');
      location.replace(home.href);
      return;
    }

    L('robustSignOutFlow → al op home → refresh forceren (BFCache wissen)');
    location.replace(home.href);
    setTimeout(() => {
      L('robustSignOutFlow → fallback reload na 80ms');
      location.reload();
    }, 80);
  } catch (e) {
    L('robustSignOutFlow fout:', e?.message || e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Inloggen'; }
    L('robustSignOutFlow → einde');
  }
}

const bindAuthButton = (btn) => {
  if (!btn || btn.dataset.bound) return;

  const on = async (e) => {
    e.preventDefault();
    L('authBtn click → start');
    const session = await getSessionSafe();
    if (session) {
      L('authBtn → user ingelogd → uitloggen flow');
      await robustSignOutFlow(btn);
    } else {
      L('authBtn → geen session → naar account.html?signin=1');
      closeMenuIfOpen();
      hardNavigate('account.html?signin=1');
    }
  };

  btn.addEventListener('click', on, { passive: false });
  btn.addEventListener('pointerup', on, { passive: false });
  btn.dataset.bound = 'true';
  L('bindAuthButton → bound');
};

/* ======================= guards ======================= */
const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  L('guardProtectedPages → check session');
  const session = await getSessionSafe();
  if (!session) {
    L('guardProtectedPages → geen session → naar account.html?signin=1');
    hardNavigate('account.html?signin=1');
  } else {
    L('guardProtectedPages → session OK');
  }
};

/* ======================= init ======================= */
document.addEventListener('DOMContentLoaded', async () => {
  L('init DOMContentLoaded');
  const els = selectEls();
  bindNavLinks(els);
  bindAuthButton(els.authBtn);

  await updateNavUI();
  await guardProtectedPages();

  supabase.auth.onAuthStateChange(async (evt) => {
    L('onAuthStateChange →', evt);
    await updateNavUI();
    if (isProtectedPath()) await guardProtectedPages();
  });

  window.addEventListener('pageshow', async (e) => {
    L('pageshow (persisted:', !!e.persisted, ')');
    await updateNavUI();
    if (e.persisted && isProtectedPath()) {
      const s = await getSessionSafe();
      if (!s) {
        const home = absoluteHome();
        L('pageshow persisted → beschermd + geen session → replace naar', home.href);
        location.replace(home.href);
      }
    }
  });
});
