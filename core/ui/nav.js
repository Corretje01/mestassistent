// core/ui/nav.js
import { supabase } from '../../supabaseClient.js';

const L = (...a) => console.log('[nav]', ...a);
const $ = (id) => document.getElementById(id);

let authState = 'unknown'; // 'unknown' | 'guest' | 'authed'

/* ---------- helpers ---------- */
function isProtected() {
  const p = location.pathname.toLowerCase();
  return /(?:\/)?(plaatsingsruimte|mestplan|beheer)(?:\.html)?$/.test(p);
}
function homeURL() {
  const logo = document.querySelector('.nav-logo[href]');
  if (logo) {
    try { return new URL(logo.getAttribute('href'), location.href).toString(); } catch {}
  }
  return new URL('index.html', location.href).toString();
}
function hardRedirect(href) {
  L('→ redirect', href);
  try { location.replace(href); return; } catch {}
  try { location.href = href; return; } catch {}
  setTimeout(() => { try { location.assign(href); } catch {} }, 10);
}

/* ---------- UI ---------- */
function setAuthClasses(isAuth) {
  document.body.classList.toggle('is-auth',  isAuth);
  document.body.classList.toggle('is-guest', !isAuth);
  document.querySelectorAll('.auth-only').forEach(el  => el.style.display = isAuth ? '' : 'none');
  document.querySelectorAll('.guest-only').forEach(el => el.style.display = isAuth ? 'none' : '');
}
function setAdminVisible(isAdmin) {
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
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
function renderButton(mode) {
  const btn = $('#nav-auth');
  if (!btn) return;
  btn.type = 'button';
  btn.removeAttribute('aria-busy');
  btn.disabled = false;

  if (mode === 'unknown') {
    btn.textContent = 'Bezig…';
    btn.dataset.authMode = 'unknown';
    return;
  }
  if (mode === 'authed') {
    btn.textContent = 'Uitloggen';
    btn.dataset.authMode = 'logout';
    return;
  }
  // guest
  btn.textContent = 'Inloggen';
  btn.dataset.authMode = 'login';
}
async function renderUIFromSession(session) {
  const isAuth = !!session;
  authState = isAuth ? 'authed' : 'guest';
  renderButton(authState);
  setAuthClasses(isAuth);
  setActiveLink();

  if (isAuth) {
    try {
      const { data, error } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      setAdminVisible(!error && (data?.role || '').toLowerCase() === 'admin');
    } catch { setAdminVisible(false); }
  } else {
    setAdminVisible(false);
  }
}

/* ---------- bindings ---------- */
function closeMobileMenu() {
  const menu = $('#site-menu');
  const toggle = $('#nav-toggle');
  if (!menu) return;
  menu.dataset.open = 'false';
  document.body.classList.remove('body--no-scroll');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => setTimeout(() => {
    if (menu.dataset.open !== 'true') menu.hidden = true;
  }, 160));
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
      location.href = href;
    }, { passive: false });
  });
}
function bindAuthButton() {
  const btn = $('#nav-auth');
  if (!btn || btn.dataset.bound) return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();

    // while we’re not sure yet
    if (authState === 'unknown') return;

    // LOGIN
    if (authState === 'guest') {
      closeMobileMenu();
      location.href = 'account.html?signin=1';
      return;
    }

    // LOGOUT
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Uitloggen…';
    closeMobileMenu();

    try {
      await supabase.auth.signOut(); // all scopes
      // flip UI to guest immediately; don’t wait for event
      authState = 'guest';
      renderButton('guest');
      setAuthClasses(false);
    } catch (err) {
      L('signOut error:', err?.message || err);
    }

    // redirect policy
    const to = isProtected() ? 'account.html?signin=1' : homeURL();
    hardRedirect(to);
  }, { passive: false });

  btn.dataset.bound = '1';
}

/* ---------- guards ---------- */
async function guardProtected() {
  if (!isProtected()) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    L('guard → to account');
    location.replace('account.html?signin=1');
  }
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  L('init');
  renderButton('unknown'); // show "Bezig…" until INITIAL_SESSION arrives
  bindNavLinks();
  bindAuthButton();

  // Subscribe FIRST so we catch INITIAL_SESSION
  supabase.auth.onAuthStateChange(async (evt, session) => {
    L('auth event:', evt);
    // Always re-render on any event
    await renderUIFromSession(session);

    // If a remote sign-out happens on a protected page, push away
    if (evt === 'SIGNED_OUT' && isProtected()) {
      hardRedirect(homeURL());
    }
  });

  // Kick a manual read; this returns immediately (may be null before INITIAL_SESSION)
  const { data: { session } } = await supabase.auth.getSession();
  // If session is already present (hot path), render now
  if (session) await renderUIFromSession(session);
  // Guard protected pages based on what we know right now
  await guardProtected();

  // BFCache back/forward: re-sync
  window.addEventListener('pageshow', async () => {
    const { data: { session: s2 } } = await supabase.auth.getSession();
    await renderUIFromSession(s2);
  });
});
