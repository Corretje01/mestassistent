// core/ui/nav.js
// ES-module: auth-knop + role-based UI + route-guards
import { supabase } from '../../supabaseClient.js';

const log = (...a) => console.log('[nav]', ...a);
const $id = (id) => document.getElementById(id);

const hardNavigate = (href, { replace = false } = {}) => {
  log('navigeren naar', href, '(replace:', !!replace, ')');
  if (replace) window.location.replace(href);
  else window.location.assign(href);
};

const closeMenu = () => {
  const menu   = $id('site-menu');
  const toggle = $id('nav-toggle');
  if (!menu) return;
  if (menu.dataset.open === 'true') log('menu sluiten');
  menu.dataset.open = 'false';
  document.body.classList.remove('body--no-scroll');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => setTimeout(() => {
    if (menu.dataset.open !== 'true') menu.hidden = true;
  }, 180));
};

const clearLocalAuthCaches = () => {
  log('lokale sb-* storage wissen');
  try {
    Object.keys(localStorage).forEach(k => k.startsWith('sb-') && localStorage.removeItem(k));
    Object.keys(sessionStorage).forEach(k => k.startsWith('sb-') && sessionStorage.removeItem(k));
  } catch (e) { log('storage clear error (ok):', e?.message); }
};

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

const fetchIsAdmin = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) return false;
    return (data?.role || '').toLowerCase() === 'admin';
  } catch { return false; }
};

const updateAuthButton = (btn, isAuth) => {
  if (!btn) return;
  btn.type = 'button';
  btn.textContent = isAuth ? 'Uitloggen' : 'Inloggen';
  btn.setAttribute('data-auth-mode', isAuth ? 'logout' : 'login');
  btn.setAttribute('aria-label', isAuth ? 'Uitloggen' : 'Inloggen');
};

export async function updateNavUI() {
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch {}
  const isLoggedIn = !!session;

  log('updateNavUI – ingelogd:', isLoggedIn);
  toggleAuthClasses(isLoggedIn);

  let isAdmin = false;
  if (isLoggedIn) {
    try { isAdmin = await fetchIsAdmin(session.user.id); } catch {}
  }
  showAdminOnly(isAdmin);

  updateAuthButton($id('nav-auth'), isLoggedIn);
  setActiveLink();
}

/* ------------------- bindings ------------------- */
const bindNavLinks = (els) => {
  const map = [
    [els.lBereken, 'plaatsingsruimte.html'],
    [els.lMestplan, 'mestplan.html'],
    [els.lUpload,   'upload.html'],
    [els.lAccount,  'account.html'],
    [els.lBeheer,   'beheer.html'],
  ];
  for (const [el, href] of map) {
    if (!el) continue;
    const go = (e) => { e.preventDefault(); closeMenu(); hardNavigate(href); };
    el.addEventListener('click', go, { passive: false });
  }
};

const bindAuthButton = (btn) => {
  if (!btn || btn.dataset.bound) return;

  const on = async (e) => {
    e.preventDefault();

    let session = null;
    try { session = (await supabase.auth.getSession()).data.session; } catch {}

    if (session) {
      // === UITLOGGEN ===
      log('klik op Uitloggen → start');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      const prevTxt = btn.textContent;
      btn.textContent = 'Uitloggen…';

      // 1) Supabase signOut (probeer beide scopes voor zekerheid)
      try {
        log('supabase.auth.signOut (all scopes) proberen…');
        await supabase.auth.signOut(); // v2: server + local (als refresh token bestaat)
      } catch (e1) {
        log('signOut() gaf error (ok):', e1?.message);
      }
      try {
        log('extra: signOut({scope:"local"})');
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      } catch {}

      // 2) Lokale tokens weg
      clearLocalAuthCaches();

      // 3) UI meteen updaten + menu dicht
      await updateNavUI();
      closeMenu();

      // 4) Poll heel kort of de sessie echt weg is
      let cleared = false;
      for (let i = 0; i < 10; i++) {
        const cur = (await supabase.auth.getSession()).data.session;
        log(`session check ${i+1}/10 →`, !!cur);
        if (!cur) { cleared = true; break; }
        await new Promise(r => setTimeout(r, 120));
      }

      // 5) Altijd redirecten naar homepage (replace)
      log('redirect naar index.html (replace), cleared=', cleared);
      hardNavigate('index.html', { replace: true });

      // 6) Safety net: als browser om wat voor reden niet navigeert, herstel de knop
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          log('safety net: nog steeds op dezelfde pagina, force reload');
          // forceer alsnog “weg” zijn
          clearLocalAuthCaches();
          window.location.href = 'index.html';
        }
      }, 1500);

      // UI fallback herstel (zou niet bereikt moeten worden)
      setTimeout(() => {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = prevTxt;
      }, 2500);

    } else {
      // === INLOGGEN ===
      log('klik op Inloggen → ga naar account.html?signin=1');
      closeMenu();
      hardNavigate('account.html?signin=1');
    }
  };

  btn.addEventListener('click', on, { passive: false });
  btn.dataset.bound = 'true';
};

/* ------------------- guards ------------------- */
const guardProtectedPages = async () => {
  if (!isProtectedPath()) return;
  let session = null;
  try { session = (await supabase.auth.getSession()).data.session; } catch {}
  if (!session) {
    log('guard → niet ingelogd → naar account.html?signin=1');
    hardNavigate('account.html?signin=1');
  }
};

/* ------------------- init ------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  log('init nav.js');
  const els = selectEls();
  bindNavLinks(els);
  bindAuthButton(els.authBtn);

  await updateNavUI();
  await guardProtectedPages();

  supabase.auth.onAuthStateChange(async (evt) => {
    log('onAuthStateChange:', evt);
    await updateNavUI();
    if (isProtectedPath()) await guardProtectedPages();
  });

  window.addEventListener('pageshow', async () => { 
    log('pageshow → updateNavUI'); 
    await updateNavUI(); 
  });
});
