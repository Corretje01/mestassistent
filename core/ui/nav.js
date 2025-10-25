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

// Sluit mobiel overlay-menu als het open staat (zonder nav-menu.js te importeren)
function closeMobileMenuIfOpen() {
  const menu   = $id('site-menu');
  const toggle = $id('nav-toggle');
  if (!menu) return;
  if (menu.dataset.open === 'true') {
    menu.dataset.open = 'false';
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('body--no-scroll');
    // verberg na kleine fade
    requestAnimationFrame(() =>
      setTimeout(() => { if (menu.dataset.open !== 'true') menu.hidden = true; }, 180)
    );
    // focus terug naar toggle voor a11y
    try { toggle?.focus(); } catch {}
  }
}

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
      .select
