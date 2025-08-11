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
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    }
  } catch {}
}

/* =============== UI state =============== */
export async function updateNavUI() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }
  const session = data.session;

  // toon/verberg menu-items via body-classes
  document.body.classList.toggle('is-auth', !!session);
  document.body.classList.toggle('is-guest', !session);

  // auth-toggle knop label/stand
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
    } catch { /* noop */ }
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

function bindAuthToggle() {
  const btn = document.getElementById('nav-auth');
  if (!btn || btn.dataset.bound === 'true') return;

  btn.setAttribute('type', 'button'); // extra zekerheid

  btn.addEventListener('click', async e => {
    e.preventDefault();
    const mode = btn.getAttribute('data-auth-mode');

    if (mode === 'logout') {
      try {
        btn.disabled = true;

        // Probeer globale sign-out
        let { error } = await supabase.auth.signOut();

        // Fallback: local scope (sommige setups)
        if (error) {
          console.warn('Global signOut faalde, probeer local:', error.message);
          const res2 = await supabase.auth.signOut({ scope: 'local' });
          if (res2.error) {
            console.error('Ook local signOut faalde:', res2.error.message);
            alert('Uitloggen mislukt. Probeer opnieuw.');
            btn.disabled = false;
            return;
          }
        }

        // Optimistisch: UI direct naar gast, lokale tokens weg
        clearSupabaseLocal();
        document.body.classList.add('is-guest');
        document.body.classList.remove('is-auth');
        btn.textContent = 'Inloggen';
        btn.setAttribute('data-auth-mode', 'login');

        // Harde redirect naar account (geen terug in history)
        navigate('account.html?logout=1', { replace: true });
      } catch (err) {
        console.error('Uitloggen exception:', err);
        alert('Uitloggen mislukt. Probeer opnieuw.');
      } finally {
        btn.disabled = false;
      }
    } else {
      // login-modus → naar account (loginflow)
      navigate('account.html');
    }
  });

  btn.dataset.bound = 'true';
}

/* =============== Route guard (gasten weg van protected pages) =============== */
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
  await updateNavUI();   // zet body-classes + knoplabel/type
  bindNavLinks();        // overige navigatie
  bindAuthToggle();      // toggleknop Inloggen ↔ Uitloggen
  setActiveLink();
  await guardProtectedPages();

  // UI updaten zodra sessie wijzigt (bv. na login op account.html)
  supabase.auth.onAuthStateChange(async () => {
    await updateNavUI();
  });
});
