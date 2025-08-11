
// nav.js
import { supabase } from './supabaseClient.js';

/* =============== Helpers =============== */
function closeMenuIfOpen() {
  const menu = document.getElementById('site-menu');
  const toggle = document.getElementById('nav-toggle');
  if (menu && toggle && menu.dataset.open === 'true') {
    toggle.setAttribute('aria-expanded', 'false');
    menu.dataset.open = 'false';
    document.body.classList.remove('body--no-scroll');
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (menu.dataset.open !== 'true') menu.hidden = true;
      }, 150)
    );
  }
}

function navigate(href, { replace = false } = {}) {
  closeMenuIfOpen();
  if (replace) window.location.replace(href);
  else window.location.assign(href);
}

function clearSupabaseLocal() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    });
  } catch {}
}

/* Wacht op SIGNED_OUT of tot session null is (met korte timeout) */
async function waitForSignedOut(timeoutMs = 1200) {
  let resolved = false;

  const done = () => { resolved = true; };
  const start = Date.now();

  // 1) one-shot subscription
  const { data: sub } = supabase.auth.onAuthStateChange((_event, _session) => {
    if (_event === 'SIGNED_OUT') done();
  });

  // 2) poll fallback (sommige omgevingen sturen geen event)
  while (!resolved && Date.now() - start < timeoutMs) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) break;
    await new Promise(r => setTimeout(r, 120));
  }

  // cleanup listener
  try { sub?.subscription?.unsubscribe?.(); } catch {}

  return;
}

/* =============== UI state =============== */
export async function updateNavUI() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }
  const session = data.session;

  document.body.classList.toggle('is-auth', !!session);
  document.body.classList.toggle('is-guest', !session);

  const btn = document.getElementById('nav-auth');
  if (btn) {
    btn.setAttribute('type', 'button'); // voorkom form submit
    const mode = session ? 'logout' : 'login';
    btn.textContent = session ? 'Uitloggen' : 'Inloggen';
    btn.setAttribute('data-auth-mode', mode);
    if (btn.tagName === 'A' && !btn.getAttribute('href')) {
      btn.setAttribute('href', 'account.html');
    }
  }
}

/* =============== Actieve link (a11y) =============== */
function setActiveLink() {
  const currentPath = location.pathname.replace(/\/+$/, '');
  document.querySelectorAll('#site-menu .nav-links a').forEach(a => {
    try {
      const linkPath = new URL(a.getAttribute('href'), location.origin)
        .pathname.replace(/\/+$/, '');
      if (linkPath && linkPath === currentPath) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    } catch {}
  });
}

/* =============== Bindings =============== */
function bindNavLinks() {
  const bind = (id, href) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', e => { e.preventDefault(); navigate(href); });
  };
  bind('nav-bereken',  'stap1.html');
  bind('nav-mestplan', 'mestplan.html');
  bind('nav-account',  'account.html');
}

async function handleAuthClick(e, btnEl) {
  e.preventDefault();
  const btn = btnEl || document.getElementById('nav-auth');
  if (!btn) return;

  const mode = btn.getAttribute('data-auth-mode');
  if (mode === 'logout') {
    try {
      btn.disabled = true;

      // signOut + fallback
      let { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('Global signOut faalde, probeer local:', error.message);
        const res2 = await supabase.auth.signOut({ scope: 'local' });
        if (res2.error) throw res2.error;
      }

      // tokens opschonen + UI direct naar gast
      clearSupabaseLocal();
      document.body.classList.add('is-guest');
      document.body.classList.remove('is-auth');
      btn.textContent = 'Inloggen';
      btn.setAttribute('data-auth-mode', 'login');

      // wacht kort op state en redirect hard
      await waitForSignedOut(1200);
      navigate('account.html?logout=1', { replace: true });
    } catch (err) {
      console.error('Uitloggen mislukt:', err?.message || err);
      alert('Uitloggen mislukt. Probeer opnieuw.');
      btn.disabled = false;
    }
  } else {
    navigate('account.html'); // start login-flow
  }
}

function bindAuthToggle() {
  const btn = document.getElementById('nav-auth');
  if (btn && !btn.dataset.bound) {
    btn.setAttribute('type', 'button');
    btn.addEventListener('click', (e) => handleAuthClick(e, btn));
    btn.dataset.bound = 'true';
  }

  // extra: event-delegatie (vangt mobiele edge cases)
  if (!document.body.dataset.authDelegated) {
    document.addEventListener('click', (e) => {
      const targetBtn = e.target?.closest?.('#nav-auth');
      if (targetBtn && !targetBtn.dataset.bound) {
        // als directe binding om wat voor reden niet aanwezig is
        handleAuthClick(e, targetBtn);
      }
    }, { passive: false });
    document.body.dataset.authDelegated = 'true';
  }
}

/* =============== Route guard =============== */
async function guardProtectedPages() {
  const protectedPages = ['stap1.html', 'mestplan.html'];
  const here = location.pathname.split('/').pop().toLowerCase();
  if (!protectedPages.includes(here)) return;

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    navigate('account.html?signin=1', { replace: true });
  }
}

/* =============== Init =============== */
document.addEventListener('DOMContentLoaded', async () => {
  await updateNavUI();
  bindNavLinks();
  bindAuthToggle();
  setActiveLink();
  await guardProtectedPages();

  supabase.auth.onAuthStateChange(async () => {
    await updateNavUI();
  });
});
