// nav.js (robuste versie)
import { supabase } from './supabaseClient.js';

/* ===== Helpers ===== */
function closeMenuIfOpen() {
  const menu = document.getElementById('site-menu');
  const toggle = document.getElementById('nav-toggle');
  if (!menu || !toggle) return;
  if (menu.dataset.open === 'true') {
    toggle.setAttribute('aria-expanded', 'false');
    menu.dataset.open = 'false';
    document.body.classList.remove('body--no-scroll');
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 140));
  }
}

function hardNavigate(href, { replace = true } = {}) {
  closeMenuIfOpen();
  if (replace) location.replace(href);
  else location.assign(href);
}

// Wis alle Supabase tokens in deze tab (failsafe)
function clearSupabaseStorage() {
  try {
    Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k); });
    Object.keys(sessionStorage).forEach(k => { if (k.startsWith('sb-')) sessionStorage.removeItem(k); });
  } catch {}
}

async function getSessionSafe() {
  try { return (await supabase.auth.getSession()).data.session; }
  catch { return null; }
}

/* ===== UI state ===== */
export async function updateNavUI() {
  const session = await getSessionSafe();
  document.body.classList.toggle('is-auth', !!session);
  document.body.classList.toggle('is-guest', !session);

  const btn = document.getElementById('nav-auth');
  if (btn) {
    btn.type = 'button';
    const isLoggedIn = !!session;
    btn.textContent = isLoggedIn ? 'Uitloggen' : 'Inloggen';
    btn.setAttribute('data-auth-mode', isLoggedIn ? 'logout' : 'login');
  }

  // Active link (aria-current)
  const currentPath = location.pathname.replace(/\/+$/, '');
  document.querySelectorAll('#site-menu .nav-links a').forEach(a => {
    try {
      const linkPath = new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/, '');
      if (linkPath && linkPath === currentPath) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    } catch {}
  });
}

/* ===== Auth actions ===== */
async function robustSignOut() {
  // 1) UI meteen naar guest
  document.body.classList.add('is-guest');
  document.body.classList.remove('is-auth');

  // 2) Sign out (global -> local fallback)
  try {
    let { error } = await supabase.auth.signOut(); // global (v2)
    if (error) {
      const res2 = await supabase.auth.signOut({ scope: 'local' });
      if (res2.error) console.warn('signOut local fallback error:', res2.error.message);
    }
  } catch (e) {
    console.warn('signOut threw:', e?.message || e);
  }

  // 3) Storage opschonen; dit maakt getSession() vrijwel meteen null
  clearSupabaseStorage();

  // 4) Heel korte, best-effort wacht om race conditions te dempen (niet blokkerend)
  //    We wachten max 250ms, maar redirecten sowieso direct erna.
  const t0 = Date.now();
  while (Date.now() - t0 < 250) {
    const s = await getSessionSafe();
    if (!s) break;
    await new Promise(r => setTimeout(r, 60));
  }
}

/* ===== Bindings ===== */
function bindNavLinks() {
  const map = [
    ['nav-bereken',  'stap1.html'],
    ['nav-mestplan', 'mestplan.html'],
    ['nav-account',  'account.html'],
  ];
  for (const [id, href] of map) {
    const el = document.getElementById(id);
    if (!el) continue;
    const go = e => { e.preventDefault(); hardNavigate(href, { replace: false }); };
    el.addEventListener('click', go, { passive: false });
    el.addEventListener('pointerup', go, { passive: false });
  }
}

async function handleAuthButton(e, btn) {
  e.preventDefault();
  const mode = btn.getAttribute('data-auth-mode');

  if (mode === 'logout') {
    btn.disabled = true;
    btn.textContent = 'Uitloggen...';
    await robustSignOut();
    // **Cruciaal**: direct hard redirect, niet wachten op events
    hardNavigate('account.html?logout=1', { replace: true });
  } else {
    hardNavigate('account.html', { replace: false });
  }
}

function bindAuthControls() {
  const direct = document.getElementById('nav-auth');
  if (direct && !direct.dataset.bound) {
    const on = e => handleAuthButton(e, direct);
    direct.type = 'button';
    direct.addEventListener('click', on, { passive: false });
    direct.addEventListener('pointerup', on, { passive: false });
    direct.dataset.bound = 'true';
  }

  // Defensieve delegatie (vangt overlay/touch edge cases in het menu)
  if (!document.body.dataset.authDelegated) {
    const delegate = e => {
      const targetBtn = e.target?.closest?.('#nav-auth');
      if (!targetBtn) return;
      e.preventDefault();
      handleAuthButton(e, targetBtn);
    };
    document.addEventListener('click', delegate, { passive: false });
    document.addEventListener('pointerup', delegate, { passive: false });
    document.body.dataset.authDelegated = 'true';
  }
}

/* ===== Route guard (beschermde pagina's) ===== */
async function guardProtected() {
  const protectedPages = new Set(['stap1.html','mestplan.html']);
  const here = location.pathname.split('/').pop().toLowerCase();
  if (!protectedPages.has(here)) return;

  const session = await getSessionSafe();
  if (!session) hardNavigate('account.html?signin=1', { replace: true });
}

/* ===== Init ===== */
(async function init() {
  await updateNavUI();
  bindNavLinks();
  bindAuthControls();
  await guardProtected();

  // UI bij auth-wijziging
  supabase.auth.onAuthStateChange(() => updateNavUI());

  // BFCache / terug-navigatie fix
  window.addEventListener('pageshow', () => { updateNavUI(); });

  // Zorg dat de menuoverlay niet open achterblijft bij resize
  window.matchMedia('(min-width: 1024px)').addEventListener('change', closeMenuIfOpen);
})();
