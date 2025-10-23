// core/ui/nav.js
// ES-module: auth-knop + role-based UI + route-guards
// BELANGRIJK: dit bestand NIET het hamburgermenu laten togglen (dat doet nav-menu.js)
import { supabase } from '../../supabaseClient.js'; // pad vanaf /core/ui/ naar projectroot

/* helpers */
const $id = (id) => document.getElementById(id);
const hardNavigate = (href, { replace = false } = {}) => {
  if (replace) window.location.replace(href);
  else window.location.assign(href);
};

/* protected pagina's (pas aan naar wens) */
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

/* UI helpers */
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

/* data helpers */
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

/* UI updates */
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

/* bindings */
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

const bindAuthButton = (btn) => {
  if (!btn) return;
  if (!btn.dataset.bound) {
    const on = async (e) => {
      e.preventDefault();
      let session = null;
      try { session = (await supabase.auth.getSession()).data.session; } catch {}
      if (session) {
        // Uitloggen, daarna terug naar account
        btn.disabled = true;
        btn.textContent = 'Uitloggen…';
        try { await supabase.auth.signOut(); } catch {}
        // locale tokens zijn door supabase al opgeruimd; ga naar account
        hardNavigate('account.html', { replace: true });
      } else {
        // Inloggen via accountpagina
        hardNavigate('account.html?signin=1');
      }
    };
    btn.addEventListener('click', on, { passive: false });
    btn.addEventListener('pointerup', on, { passive: false });
    btn.dataset.bound = 'true';
  }
};

/* guards */
const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch {}
  if (!session) hardNavigate('account.html?signin=1');
};

/* init */
document.addEventListener('DOMContentLoaded', async () => {
  const els = selectEls();
  bindNavLinks(els);
  bindAuthButton(els.authBtn);

  await updateNavUI();
  await guardProtectedPages();

  supabase.auth.onAuthStateChange(async () => {
    await updateNavUI();
    if (isProtectedPath()) await guardProtectedPages();
  });

  window.addEventListener('pageshow', async () => { await updateNavUI(); });
});
