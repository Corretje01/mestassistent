// core/ui/nav.js
// ES-module: auth-knop + role-based UI + route-guards (incl. robuuste sign-out + BFCache fixes)

import { supabase } from '../../supabaseClient.js';

/* ----------------------------- helpers ----------------------------- */
const $id = (id) => document.getElementById(id);

const getSessionSafe = async () => {
  try { return (await supabase.auth.getSession()).data.session; }
  catch { return null; }
};

// Navigeren (hard = buiten SPA-cache om)
const hardNavigate = (href, { replace = false } = {}) => {
  if (replace) window.location.replace(href);
  else window.location.assign(href);
};

// Zet absolute home-URL, robuust binnen submappen
const absoluteHome = () => new URL('index.html', location.origin + location.pathname.replace(/[^/]*$/, ''));

// Compact “menu sluiten” helper voor mobiel overlay (nav-menu.js beheert de UI, wij doen een best-effort sluiting)
const closeMenuIfOpen = () => {
  const menu = $id('site-menu');
  if (menu && menu.dataset.open === 'true') {
    // mimic close-animation: reset ARIA + laat nav-menu.js het visueel afhandelen
    menu.dataset.open = 'false';
    menu.setAttribute('hidden', '');
    document.body.classList.remove('body--no-scroll');
  }
};

/* ----------------------------- routes ----------------------------- */
const isProtectedPath = () => {
  const p = window.location.pathname.toLowerCase();
  return (
    /plaatsingsruimte(\.html)?$/.test(p) ||
    /mestplan(\.html)?$/.test(p) ||
    /beheer(\.html)?$/.test(p)
  );
};

/* ----------------------------- DOM select ----------------------------- */
const selectEls = () => ({
  authBtn:  $id('nav-auth'),
  lBereken: $id('nav-bereken'),
  lMestplan:$id('nav-mestplan'),
  lUpload:  $id('nav-upload'),
  lAccount: $id('nav-account'),
  lBeheer:  $id('nav-beheer'),
});

/* ----------------------------- UI helpers ----------------------------- */
const toggleAuthClasses = (isAuth) => {
  document.body.classList.toggle('is-auth',  !!isAuth);
  document.body.classList.toggle('is-guest', !isAuth);
  document.querySelectorAll('.auth-only').forEach(el  => { el.style.display = isAuth ? '' : 'none'; });
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
      if (href.pathname.replace(/\/+$/, '') === current.pathname.replace(/\/+$/, '')) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    } catch {}
  });
};

/* ----------------------------- data helpers ----------------------------- */
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

/* ----------------------------- UI updates ----------------------------- */
const updateAuthButton = (btn, isAuth) => {
  if (!btn) return;
  btn.type = 'button';
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.dataset.authMode = isAuth ? 'logout' : 'login';
  btn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
};

export async function updateNavUI() {
  const session = await getSessionSafe();
  const isLoggedIn = !!session;

  toggleAuthClasses(isLoggedIn);

  // admin-only
  let isAdmin = false;
  if (isLoggedIn) {
    try { isAdmin = await fetchIsAdmin(session.user.id); } catch {}
  }
  showAdminOnly(isAdmin);

  updateAuthButton($id('nav-auth'), isLoggedIn);
  setActiveLink();
}

/* ----------------------------- bindings ----------------------------- */
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
    const go = (e) => { e.preventDefault(); hardNavigate(href); };
    el.addEventListener('click', go, { passive: false });
    el.addEventListener('pointerup', go, { passive: false });
  }
};

async function robustSignOutFlow(btn) {
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Uitloggen…'; }
    // 1) Supabase signOut (alle scopes)
    await supabase.auth.signOut();

    // 2) Extra opruiming lokale tokens (soms blijft iets hangen bij custom deploys)
    try {
      Object.keys(localStorage).forEach(k => k.startsWith('sb-') && localStorage.removeItem(k));
      Object.keys(sessionStorage).forEach(k => k.startsWith('sb-') && sessionStorage.removeItem(k));
    } catch {}

    // 3) UI direct updaten
    await updateNavUI();

    // 4) Sluit eventueel mobiel menu en navigeer hard naar home
    closeMenuIfOpen();
    const home = absoluteHome();

    // Op beschermde pagina's: altijd wegsturen
    if (isProtectedPath()) {
      location.replace(home.href);
      return;
    }

    // Niet-beschermde pagina's:
    // - Als we niet op home staan → ga naar home
    if (location.href !== home.href) {
      location.replace(home.href);
      return;
    }

    // - Als we al op home staan → ververs om BFCache/ oude state te wissen
    location.replace(home.href);
    setTimeout(() => location.reload(), 60);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Inloggen'; }
  }
}

const bindAuthButton = (btn) => {
  if (!btn || btn.dataset.bound) return;

  const on = async (e) => {
    e.preventDefault();
    const session = await getSessionSafe();
    if (session) {
      await robustSignOutFlow(btn);
    } else {
      closeMenuIfOpen();
      hardNavigate('account.html?signin=1');
    }
  };

  btn.addEventListener('click', on, { passive: false });
  btn.addEventListener('pointerup', on, { passive: false });
  btn.dataset.bound = 'true';
};

/* ----------------------------- guards ----------------------------- */
const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  const session = await getSessionSafe();
  if (!session) hardNavigate('account.html?signin=1');
};

/* ----------------------------- init ----------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  const els = selectEls();
  bindNavLinks(els);
  bindAuthButton(els.authBtn);

  await updateNavUI();
  await guardProtectedPages();

  // Reageer op auth-state wissels
  supabase.auth.onAuthStateChange(async (_evt) => {
    await updateNavUI();
    if (isProtectedPath()) await guardProtectedPages();
  });

  // BFCache-terug: sync UI en redirect indien nodig
  window.addEventListener('pageshow', async (e) => {
    await updateNavUI();
    if (e.persisted && isProtectedPath()) {
      const s = await getSessionSafe();
      if (!s) {
        location.replace(absoluteHome().href);
      }
    }
  });
});
