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
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 150));
  }
}

function navigate(href) {
  closeMenuIfOpen();
  window.location.href = href; // relatieve paden blijven werken
}

/** Vind jouw bestaande auth-knop zonder HTML te hoeven wijzigen */
function getAuthToggleEl() {
  return (
    document.getElementById('nav-auth') ||      // als je ooit deze toevoegt
    document.getElementById('nav-register') ||  // jouw oude "Inloggen" link/knop
    document.getElementById('nav-logout')       // jouw huidige "Uitloggen" knop
  );
}

/* =============== UI state =============== */
export async function updateNavUI() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }
  const session = data.session;

  // Body classes voor zichtbaarheid van menu-items
  document.body.classList.toggle('is-auth',  !!session);
  document.body.classList.toggle('is-guest', !session);

  // Auth-toggle knop tekst en type
  const authEl = getAuthToggleEl();
  if (authEl) {
    // Soms is het een <a>, soms een <button>
    // We zetten in beide gevallen de label/tekst goed.
    const setText = (txt) => {
      if ('value' in authEl) authEl.value = txt;
      authEl.textContent = txt;
    };

    if (session) {
      setText('Uitloggen');
      authEl.setAttribute('data-auth-mode', 'logout');
    } else {
      setText('Inloggen');
      authEl.setAttribute('data-auth-mode', 'login');
      // Zorg dat een <a> nog steeds naar account kan als JS uitvalt
      if (authEl.tagName === 'A' && !authEl.getAttribute('href')) {
        authEl.setAttribute('href', 'account.html');
      }
    }
  }
}

/* =============== Actieve link (a11y) =============== */
function setActiveLink() {
  const currentPath = location.pathname.replace(/\/+$/, '');
  const links = document.querySelectorAll('#site-menu .nav-links a');
  links.forEach(a => {
    try {
      const url = new URL(a.getAttribute('href'), location.origin);
      const linkPath = url.pathname.replace(/\/+$/, '');
      if (linkPath && linkPath === currentPath) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    } catch { /* noop */ }
  });
}

/* =============== Bindings =============== */
function bindNavLinks() {
  const bindClick = (id, href) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', evt => {
      evt.preventDefault();
      navigate(href);
    });
  };

  // Deze blijven gewoon werken wanneer ingelogd
  bindClick('nav-bereken',  'stap1.html');
  bindClick('nav-mestplan', 'mestplan.html');
  bindClick('nav-account',  'account.html');
}

function bindAuthToggle() {
  const el = getAuthToggleEl();
  if (!el || el.dataset.bound === 'true') return;

  el.addEventListener('click', async (evt) => {
    // Zowel <a> als <button> ondersteunen
    evt.preventDefault();
    const mode = el.getAttribute('data-auth-mode');
    if (mode === 'logout') {
      el.disabled = true;
      const { error } = await supabase.auth.signOut();
      el.disabled = false;
      if (error) {
        console.error('Uitloggen mislukt:', error.message);
        alert('Uitloggen mislukt. Probeer opnieuw.');
        return;
      }
      // UI verversen en naar account
      await updateNavUI();
      navigate('account.html');
    } else {
      // login-modus: ga naar account pagina
      navigate('account.html');
    }
  });

  el.dataset.bound = 'true';
}

/* =============== Init =============== */
document.addEventListener('DOMContentLoaded', async () => {
  await updateNavUI();      // zet body classes én knoplabel
  bindNavLinks();           // andere links
  bindAuthToggle();         // één knop die wisselt login/uitlog

  setActiveLink();

  // Reageer op auth-wissels
  supabase.auth.onAuthStateChange(async () => {
    await updateNavUI();
    // Knoplabel kan wisselen; eventhandler blijft geldig
  });
});
