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
    // verbergen na kleine delay i.v.m. fade-out (als je die gebruikt)
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 150));
  }
}

function navigate(href) {
  closeMenuIfOpen();
  window.location.href = href; // relatieve paden
}

function bindClick(id, href) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', evt => {
    evt.preventDefault();
    navigate(href);
  });
}

/**
 * Zet aria-current="page" op de actieve link
 * Vergelijkt pathname zonder trailing slash met het href-pad van de <a>.
 */
function setActiveLink() {
  const currentPath = location.pathname.replace(/\/+$/, ''); // strip trailing slash
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
    } catch {
      // ignore malformed href
    }
  });
}

/* ==============================
   Init
============================== */
document.addEventListener('DOMContentLoaded', () => {
  updateNavUI().then(setActiveLink);

  supabase.auth.onAuthStateChange(() => {
    updateNavUI();
    // actieve link verandert niet op auth-wissel, maar kan blijven staan
  });

  // Relatieve paden (compatibel met subdirectory hosting)
  bindClick('nav-register', 'account.html');
  bindClick('nav-bereken',  'stap1.html');
  bindClick('nav-mestplan', 'mestplan.html');
  bindClick('nav-account',  'account.html');

  const btnLogout = document.getElementById('nav-logout');
  if (btnLogout) {
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
  }
});
