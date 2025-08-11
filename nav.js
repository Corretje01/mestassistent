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
    // verberg pas ná close-animatie
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
  document.querySelectorAll('.auth-only').forEach(li => {
    li.style.display = isLoggedIn ? '' : 'none';
  });

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
  // UI meteen naar guest (snappier gevoel)
  document.body.classList.add('is-guest');
  document.body.classList.remove('is-auth');

  try {
    let { error } = await supabase.auth.signOut();
    if (error) {
      // fallback (sommige browsers/ITP)
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  } catch {}
  clearSupabaseStorage();

  // heel korte best-effort wacht (niet zichtbaar), dempt race conditions
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
    ['nav-account',  '/account.html'],
  ];
  for (const [id, href] of map) {
    const el = $(id);
    if (!el) continue;
    const go = (e) => { e.preventDefault(); hardNavigate(href); };
    el.addEventListener('click', go, { passive: false });
    el.addEventListener('pointerup', go, { passive: false }); // mobiel-tap zekerheid
  }
}

async function handleAuthClick(e, btn) {
  e.preventDefault();
  const mode = btn.getAttribute('data-auth-mode');

  if (mode === 'logout') {
    btn.disabled = true;
    btn.textContent = 'Uitloggen…';
    await robustSignOut();
    // **Directe harde redirect** naar account met signaal voor melding
    hardNavigate('/account.html?logout=1', { replace: true });
  } else {
    // login vanuit nav: wijs gebruiker de weg naar loginsectie
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

  // defensieve delegatie — pakt taps in overlay/menus
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
  // accepteer zowel /stap1 als /stap1.html (idem voor mestplan)
  const slug = location.pathname
    .replace(/\/+$/, '')        // strip trailing slash
    .split('/').pop().toLowerCase();

  const protectedSet = new Set(['stap1', 'stap1.html', 'mestplan', 'mestplan.html']);
  if (!protectedSet.has(slug)) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // duidelijke hint voor account-pagina
    navigate('account.html?signin=1', { replace: true });
  }
}

/* ========== init ========== */
document.addEventListener('DOMContentLoaded', async () => {
  await updateNavUI();
  bindNavLinks();
  bindAuthButton();
  await guardProtectedPages();

  // Auth-wijzigingen => nav meteen bijwerken
  supabase.auth.onAuthStateChange(() => { updateNavUI(); });

  // BFCache/terugknop: zorg dat UI klopt als user terug navigeert
  window.addEventListener('pageshow', () => { updateNavUI(); });

  // Als de viewport naar desktop springt, sluit het mobiele menu
  window.matchMedia('(min-width: 1024px)').addEventListener('change', closeMenuIfOpen);
});
