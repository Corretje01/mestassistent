// File: core/ui/nav.js
// ES-module: navbar-auth + role UI + route-guards (géén hamburger toggle hier!)
import { supabase } from '../../supabaseClient.js';

/* helpers */
const $id = (id) => document.getElementById(id);
const hardNavigate = (href) => { window.location.assign(href); };

/* welke pagina's zijn protected */
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

const toggleAuthClasses = (isAuth) => {
  document.body.classList.toggle('is-auth',  !!isAuth);
  document.body.classList.toggle('is-guest', !isAuth);
  for (const el of document.querySelectorAll('.auth-only'))  el.style.display = isAuth ? '' : 'none';
  for (const el of document.querySelectorAll('.guest-only')) el.style.display = isAuth ? 'none' : '';
};

const showAdminOnly = (isAdmin) => {
  for (const el of document.querySelectorAll('.admin-only')) el.style.display = isAdmin ? '' : 'none';
};

const fetchIsAdmin = async (userId) => {
  try {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (error) return false;
    return (data?.role || '').toLowerCase() === 'admin';
  } catch { return false; }
};

const updateAuthButton = (btn, isAuth) => {
  if (!btn) return;
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
};

const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) hardNavigate('account.html?signin=1');
};

const bindNavLinks = (els) => {
  if (els.lBereken)  els.lBereken.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('plaatsingsruimte.html'); });
  if (els.lMestplan) els.lMestplan.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('mestplan.html'); });
  if (els.lUpload)   els.lUpload.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('upload.html'); });
  if (els.lAccount)  els.lAccount.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('account.html'); });
  if (els.lBeheer)   els.lBeheer.addEventListener('click', (e) => { e.preventDefault(); hardNavigate('beheer.html'); });
};

const bindAuthButton = (els) => {
  if (!els.authBtn) return;
  els.authBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { await supabase.auth.signOut(); hardNavigate('account.html'); }
    else { hardNavigate('account.html?signin=1'); }
  }, { passive: false });
};

const updateUI = async () => {
  const els = selectEls();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user || null;
  updateAuthButton(els.authBtn, !!user);
  toggleAuthClasses(!!user);
  const isAdmin = user?.id ? await fetchIsAdmin(user.id) : false;
  showAdminOnly(isAdmin);
};

const init = async () => {
  const els = selectEls();
  bindNavLinks(els);     // géén bindMenuToggle hier meer
  bindAuthButton(els);
  await updateUI();
  await guardProtectedPages();

  supabase.auth.onAuthStateChange(async () => {
    await updateUI();
    if (isProtectedPath()) await guardProtectedPages();
  });
  window.addEventListener('pageshow', async () => { await updateUI(); });
};

document.addEventListener('DOMContentLoaded', () => { init(); });
