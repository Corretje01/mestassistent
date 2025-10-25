// core/ui/nav.js
// ES-module: auth-knop + role-based UI + route-guards
import { supabase } from '../../supabaseClient.js';

const log = (...a) => console.log('[nav]', ...a);
const $id = (id) => document.getElementById(id);

function getHomeHref() {
  // Neem de href van het logo als bron van waarheid (werkt ook in submappen)
  const logo = document.querySelector('.nav-logo[href]');
  try {
    if (logo) return new URL(logo.getAttribute('href'), location.href).toString();
  } catch {}
  // Fallback: index.html naast huidige pagina
  return new URL('index.html', location.href).toString();
}

const hardNavigate = (href, { replace = false } = {}) => {
  log('navigeren naar', href, '(replace:', !!replace, ')');
  if (replace) window.location.replace(href);
  else window.location.assign(href);
};

const closeMenu = () => {
  const menu   = $id('site-menu');
  const toggle = $id('nav-toggle');
  if (!menu) return;
  menu.dataset.open = 'false';
  document.body.classList.remove('body--no-scroll');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => setTimeout(() => {
    if (menu.dataset.open !== 'true') menu.hidden = true;
  }, 180));
};

const isProtectedPath = () => {
  const p = window.location.pathname.toLowerCase();
  return (
    /plaatsingsruimte(\.html)?$/.test(p) ||
    /mestplan(\.html)?$/.test(p) ||
    /beheer(\.html)?$/.test(p)
  );
};

const selectEls = () => ({
  authBtn:  $id('nav-auth'),
  lBereken: $id('nav-bereken'),
  lMestplan:$id('nav-mestplan'),
  lUpload:  $id('nav-upload'),
  lAccount: $id('nav-account'),
  lBeheer:  $id('nav-beheer'),
});

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

const updateAuthButton = (btn, isAuth) => {
  if (!btn) return;
  btn.type = 'button';
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.setAttribute('data-auth-mode', isAuth ? 'logout' : 'login');
  btn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
};

export async function updateNavUI() {
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch {}
  const isLoggedIn = !!session;

  log('updateNavUI – ingelogd:', isLoggedIn);
  toggleAuthClasses(isLoggedIn);

  let isAdmin = false;
  if (isLoggedIn) {
    try { isAdmin = await fetchIsAdmin(session.user.id); } catch {}
  }
  showAdminOnly(isAdmin);

  updateAuthButton($id('nav-auth'), isLoggedIn);
  setActiveLink();
}

/* ------------------- bindings ------------------- */
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
    const go = (e) => { e.preventDefault(); closeMenu(); hardNavigate(href); };
    el.addEventListener('click', go, { passive: false });
  }
};

const bindAuthButton = (btn) => {
  if (!btn || btn.dataset.bound) return;

  const on = async (e) => {
    e.preventDefault();

    let session = null;
    try { session = (await supabase.auth.getSession()).data.session; } catch {}

    if (session) {
      // === UITLOGGEN ===
      log('klik op Uitloggen → start');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = 'Uitloggen…';
      closeMenu();

      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[nav] signOut error (gaat verder met redirect):', err?.message || err);
      }

      // 👉 Geen verdere awaits of UI-updates meer hier: direct weg!
      const home = getHomeHref();
      log('direct redirect naar', home);
      location.replace(home);
      return; // stop handler

    } else {
      // === INLOGGEN ===
      log('klik op Inloggen → ga naar account.html?signin=1');
      closeMenu();
      hardNavigate('account.html?signin=1');
    }
  };

  btn.addEventListener('click', on, { passive: false });
  btn.dataset.bound = 'true';
};

/* ------------------- guards ------------------- */
const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch {}
  if (!session) {
    log('guard → niet ingelogd → naar account.html?signin=1');
    hardNavigate('account.html?signin=1');
  }
};

/* ------------------- init ------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  log('init nav.js');
  const els = selectEls();
  bindNavLinks(els);
  bindAuthButton(els.authBtn);

  await updateNavUI();
  await guardProtectedPages();

  supabase.auth.onAuthStateChange(async (evt) => {
    log('onAuthStateChange:', evt);
    await updateNavUI();
    if (isProtectedPath()) await guardProtectedPages();
  });

  window.addEventListener('pageshow', async () => {
    log('pageshow → updateNavUI');
    await updateNavUI();
  });
});
