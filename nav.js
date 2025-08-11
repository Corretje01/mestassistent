// nav.js
import { supabase } from './supabaseClient.js';

/* ==============================
   Auth UI: body state toggles
============================== */
export async function updateNavUI() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }
  const session = data.session;
  document.body.classList.toggle('is-auth',  !!session);
  document.body.classList.toggle('is-guest', !session);
}

/* ==============================
   Helpers
============================== */
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

function navigate(href) {
  closeMenuIfOpen();
  window.location.href = href; // relatieve paden (werkt ook in subdir)
}

function bindClick(id, href) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', evt => {
    evt.preventDefault();
    navigate(href);
  });
}

/** aria-current op actieve link */
function setActiveLink() {
  const currentPath = location.pathname.replace(/\/+$/, '');
  const links = document.querySelectorAll('#site-menu .nav-links a');
  links.forEach(a => {
    try {
      const url = new URL(a.getAttribute('href'), location.origin);
      const linkPath = url.pathname.replace(/\/+$/, '');
      if (linkPath && linkPath === currentPath) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    } catch { /* noop */ }
  });
}

/* ==============================
   Bindings (kan herhaald veilig)
============================== */
export function initNavBindings() {
  // Close-button (kruisje) sluit overlay
  const closeBtn = document.getElementById('nav-close');
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.addEventListener('click', e => {
      e.preventDefault();
      closeMenuIfOpen();
    });
    closeBtn.dataset.bound = 'true';
  }

  // Link bindings (relatieve paden)
  bindClick('nav-register', 'account.html');
  bindClick('nav-bereken',  'stap1.html');
  bindClick('nav-mestplan', 'mestplan.html');
  bindClick('nav-account',  'account.html');

  // Logout
  const btnLogout = document.getElementById('nav-logout');
  if (btnLogout && !btnLogout.dataset.bound) {
    btnLogout.addEventListener('click', async evt => {
      evt.preventDefault();
      btnLogout.disabled = true;
      const { error } = await supabase.auth.signOut();
      btnLogout.disabled = false;
      if (error) {
        console.error('Uitloggen mislukt:', error.message);
        alert('Uitloggen mislukt. Probeer opnieuw.');
      } else {
        await updateNavUI();
        navigate('account.html');
      }
    });
    btnLogout.dataset.bound = 'true';
  }

  setActiveLink();
}

/* ==============================
   Auto-init, ook met latere injectie
============================== */
function initWhenReady() {
  const navRoot = document.getElementById('site-menu');
  if (navRoot) {
    updateNavUI().then(initNavBindings);
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (initWhenReady()) return;

  // Als nav later wordt toegevoegd (bv. partial), wacht even mee
  const obs = new MutationObserver(() => {
    if (initWhenReady()) obs.disconnect();
  });
  obs.observe(document.documentElement, { childList: true, subtree: tr
