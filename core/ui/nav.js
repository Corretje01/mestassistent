// core/ui/nav.js
// Auth button + role UI + guards + hard redirect on logout
import { supabase } from '../../supabaseClient.js';

const L = (...a) => console.log('[nav]', ...a);
const $ = (id) => document.getElementById(id);

// ---------------- helpers ----------------
function homeURL() {
  // use the logo href if available (works from subfolders)
  const logo = document.querySelector('.nav-logo[href]');
  if (logo) {
    try { return new URL(logo.getAttribute('href'), location.href).toString(); } catch {}
  }
  // fallback: index.html next to current page
  return new URL('index.html', location.href).toString();
}
function hardRedirect(href) {
  // single-line logs for each try; helps spot blockers
  L('redirect →', href, 'from', location.pathname);
  try { location.replace(href); L('location.replace OK'); return; } catch {}
  try { location.href = href; L('location.href OK'); return; } catch {}
  setTimeout(() => { try { location.assign(href); L('location.assign OK'); } catch {} }, 10);
}
function isProtected() {
  const p = location.pathname.toLowerCase();
  return /(?:\/)?(plaatsingsruimte|mestplan|beheer)(?:\.html)?$/.test(p);
}

// ---------------- UI updates ----------------
function toggleAuthClasses(isAuth) {
  document.body.classList.toggle('is-auth',  !!isAuth);
  document.body.classList.toggle('is-guest', !isAuth);
  document.querySelectorAll('.auth-only').forEach(el  => { el.style.display = isAuth ? '' : 'none'; });
  document.querySelectorAll('.guest-only').forEach(el => { el.style.display = isAuth ? 'none' : ''; });
}
async function fetchIsAdmin(userId) {
  try {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (error) { L('profiles error:', error.message); return false; }
    return (data?.role || '').toLowerCase() === 'admin';
  } catch (e) { L('profiles ex:', e?.message || e); return false; }
}
function showAdminOnly(isAdmin) {
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = isAdmin ? '' : 'none'; });
}
function setActiveLink() {
  const cur = new URL(location.href);
  document.querySelectorAll('#site-menu .nav-links a').forEach(a => {
    try {
      const href = new URL(a.getAttribute('href'), location.origin);
      if (href.pathname.replace(/\/+$/, '') === cur.pathname.replace(/\/+$/, '')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    } catch {}
  });
}
function updateAuthBtn(btn, isAuth) {
  if (!btn) return;
  btn.type = 'button';
  btn.disabled = false;
  btn.removeAttribute('aria-busy');
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.dataset.authMode = isAuth ? 'logout' : 'login';
  L('auth button →', btn.textContent);
}
export async function updateNavUI() {
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch {}
  const isAuth = !!session;

  L('updateNavUI auth:', isAuth, 'path:', location.pathname);

  toggleAuthClasses(isAuth);
  if (isAuth) {
    try { showAdminOnly(await fetchIsAdmin(session.user.id)); } catch {}
  } else {
    showAdminOnly(false);
  }
  updateAuthBtn($('#nav-auth'), isAuth);
  setActiveLink();
}

// ---------------- bindings ----------------
function closeMobileMenu() {
  const menu = $('#site-menu');
  const toggle = $('#nav-toggle');
  if (!menu) return;
  menu.dataset.open = 'false';
  document.body.classList.remove('body--no-scroll');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => setTimeout(() => { if (menu.dataset.open !== 'true') menu.hidden = true; }, 160));
}
function bindNavLinks() {
  const map = [
    ['nav-bereken', 'plaatsingsruimte.html'],
    ['nav-mestplan', 'mestplan.html'],
    ['nav-upload',   'upload.html'],
    ['nav-account',  'account.html'],
    ['nav-beheer',   'beheer.html'],
  ];
  map.forEach(([id, href]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileMenu();
      L('nav to →', href);
      location.href = href;
    }, { passive: false });
  });
}
function bindAuthButton() {
  const btn = $('#nav-auth');
  if (!btn || btn.dataset.bound) return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    let session = null;
    try { session = (await supabase.auth.getSession()).data.session; } catch {}

    // LOGGED IN → LOG OUT
    if (session) {
      L('click logout (start)');
      // immediate UI feedback
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = 'Uitloggen…';
      closeMobileMenu();

      // schedule hard redirect no matter what happens
      const home = homeURL();
      const goHome = () => { L('force home (timer)'); hardRedirect(home); };
      const t1 = setTimeout(goHome, 250);   // primary
      const t2 = setTimeout(goHome, 1500);  // belt&braces

      try {
        const { error } = await supabase.auth.signOut(); // all scopes by default
        if (error) L('signOut error:', error.message);
        else L('signOut OK');
      } catch (err) {
        L('signOut ex:', err?.message || err);
      }

      // Immediately flip button back to "Inloggen" so navbar isn't empty
      updateAuthBtn(btn, false);

      // If still on a protected page, go home now (don’t wait)
      if (isProtected()) {
        L('on protected after signOut → go home now');
        clearTimeout(t1); clearTimeout(t2);
        hardRedirect(home);
        return;
      }

      // otherwise: also redirect to home (spec asked this)
      clearTimeout(t1); clearTimeout(t2);
      hardRedirect(home);
      return;
    }

    // LOGGED OUT → LOGIN
    L('click login → account');
    closeMobileMenu();
    location.href = 'account.html?signin=1';
  }, { passive: false });

  btn.dataset.bound = '1';
}

// ---------------- guards ----------------
async function guardProtectedPages() {
  if (!isProtected()) return;
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch {}
  if (!session) {
    L('guard: not authed on protected → to account');
    location.replace('account.html?signin=1');
  }
}

// ---------------- init ----------------
document.addEventListener('DOMContentLoaded', async () => {
  L('init');
  bindNavLinks();
  bindAuthButton();
  await updateNavUI();
  await guardProtectedPages();

  supabase.auth.onAuthStateChange(async (evt) => {
    L('onAuthStateChange:', evt, 'path:', location.pathname);
    await updateNavUI();

    if (evt === 'SIGNED_OUT') {
      // If the provider signs out from elsewhere, push away from protected pages
      if (isProtected()) {
        const home = homeURL();
        L('SIGNED_OUT on protected → home');
        hardRedirect(home);
      }
    }
  });

  window.addEventListener('pageshow', () => { updateNavUI(); });
});
