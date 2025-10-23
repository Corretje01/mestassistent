// File: mestassisten/core/ui/nav.js
// ES-module: robuste navbar + auth-knop + role-based UI + route-guards (dicht bij origineel)

import { supabase } from '../../../supabaseClient.js';

/* ========== helpers ========== */
const $id = (id) => document.getElementById(id);
const hardNavigate = (href) => { window.location.assign(href); };

const isProtectedPath = () => {
  const p = window.location.pathname.toLowerCase();
  // Sluit aan bij je nieuwe structuur (aanpasbaar): plaatsingsruimte/mestplan/beheer
  return (
    /plaatsingsruimte(\.html)?$/.test(p) ||
    /mestplan(\.html)?$/.test(p) ||
    /beheer(\.html)?$/.test(p)
  );
};

const selectEls = () => {
  return {
    siteMenu:   $id('site-menu'),
    navToggle:  $id('nav-toggle'),
    authBtn:    $id('nav-auth'),

    // nav-links die we hard navigeren (zoals in je oude baseline)
    lBereken:   $id('nav-bereken'),
    lMestplan:  $id('nav-mestplan'),
    lUpload:    $id('nav-upload'),
    lAccount:   $id('nav-account'),
    lBeheer:    $id('nav-beheer'),
  };
};

const toggleAuthClasses = (isAuth) => {
  document.body.classList.toggle('is-auth',  !!isAuth);
  document.body.classList.toggle('is-guest', !isAuth);

  // Toon/Verberg blokken
  for (const el of document.querySelectorAll('.auth-only')) {
    el.style.display = isAuth ? '' : 'none';
  }
  for (const el of document.querySelectorAll('.guest-only')) {
    el.style.display = isAuth ? 'none' : '';
  }
};

const showAdminOnly = (isAdmin) => {
  for (const el of document.querySelectorAll('.admin-only')) {
    el.style.display = isAdmin ? '' : 'none';
  }
};

const fetchIsAdmin = async (userId) => {
  try {
    // Sluit aan bij je bestaande profiles tabel + role kolom
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) return false;
    return (data?.role || '').toLowerCase() === 'admin';
  } catch {
    return false;
  }
};

const updateAuthButton = (authBtn, isAuth) => {
  if (!authBtn) return;
  authBtn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  authBtn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
};

const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // Houd de oude redirectstijl aan
    const target = 'account.html?signin=1';
    hardNavigate(target);
  }
};

const bindNavLinks = (els) => {
  // Hard navigeren om SPA-achtigheid te voorkomen (zoals in je oude code)
  if (els.lBereken)  els.lBereken.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('plaatsingsruimte.html'); });
  if (els.lMestplan) els.lMestplan.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('mestplan.html'); });
  if (els.lUpload)   els.lUpload.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('upload.html'); });
  if (els.lAccount)  els.lAccount.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('account.html'); });
  if (els.lBeheer)   els.lBeheer.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('beheer.html'); });
};

const bindAuthButton = (els) => {
  if (!els.authBtn) return;

  const handler = async (e) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // Uitloggen → terug naar account
      await supabase.auth.signOut();
      hardNavigate('account.html');
      return;
    }
    // Inloggen via accountpagina (consistent met oude flow)
    hardNavigate('account.html?signin=1');
  };

  // Degelijk binden (click is genoeg; pointerup mag ook als je dat gebruikte)
  els.authBtn.addEventListener('click', handler, { passive: false });
};

const bindMenuToggle = (els) => {
  if (!els.navToggle || !els.siteMenu) return;
  els.navToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const expanded = els.navToggle.getAttribute('aria-expanded') === 'true';
    els.navToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    els.siteMenu.hidden = expanded;
  });
};

const updateUI = async () => {
  const els = selectEls();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user || null;

  updateAuthButton(els.authBtn, !!user);
  toggleAuthClasses(!!user);

  let isAdmin = false;
  if (user?.id) isAdmin = await fetchIsAdmin(user.id);
  showAdminOnly(isAdmin);
};

const init = async () => {
  const els = selectEls();

  // init binding
  bindMenuToggle(els);
  bindNavLinks(els);
  bindAuthButton(els);

  // init UI state
  await updateUI();

  // guard protected pages
  await guardProtectedPages();

  // live updates
  supabase.auth.onAuthStateChange(async () => {
    await updateUI();
    if (isProtectedPath()) await guardProtectedPages();
  });

  // bij terugnavigeren (bfcache)
  window.addEventListener('pageshow', async () => {
    await updateUI();
  });
};

document.addEventListener('DOMContentLoaded', () => { init(); });
