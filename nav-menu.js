// nav-menu.js
// Usage in each page:
//   import { initNavMenu } from './nav-menu.js';
//   initNavMenu({ menuId: 'site-menu', toggleId: 'nav-toggle' });

import { supabase } from './supabaseClient.js';

export function initNavMenu({
  menuId = 'site-menu',
  toggleId = 'nav-toggle',
  closeId = 'nav-close',
  mainId = 'main',
  footerId = 'footer'
} = {}) {
  const menu     = document.getElementById(menuId);
  const toggle   = document.getElementById(toggleId);
  const closeBtn = document.getElementById(closeId);
  const main     = document.getElementById(mainId);
  const footer   = document.getElementById(footerId);

  if (!menu || !toggle) return;

  // Ensure we have a list container inside menu (UL) to append items into.
  const list = ensureList(menu);

  const mql = window.matchMedia('(min-width: 1024px)');

  const setPageInert = on => {
    [main, footer].forEach(el => {
      if (!el) return;
      if (on) { el.setAttribute('aria-hidden','true'); el.setAttribute('inert',''); }
      else { el.removeAttribute('aria-hidden'); el.removeAttribute('inert'); }
    });
  };

  const focusables = () =>
    menu.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');

  const open = () => {
    if (mql.matches) return; // desktop heeft geen overlay
    menu.hidden = false;
    menu.dataset.open = 'true';
    toggle.setAttribute('aria-expanded','true');
    document.body.classList.add('body--no-scroll');
    setPageInert(true);
    menu.setAttribute('role','dialog');
    menu.setAttribute('aria-modal','true');
    const first = focusables()[0];
    (first || toggle).focus();
  };

  const close = () => {
    if (mql.matches) return; // desktop heeft geen overlay
    menu.dataset.open = 'false';
    toggle.setAttribute('aria-expanded','false');
    document.body.classList.remove('body--no-scroll');
    setPageInert(false);
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 180));
    toggle.focus();
  };

  // Toggle button
  toggle.addEventListener('click', () => {
    (menu.dataset.open === 'true') ? close() : open();
  });

  // Close button (kruisje)
  if (closeBtn) {
    closeBtn.addEventListener('click', e => {
      e.preventDefault();
      close();
    });
  }

  // Backdrop klik (klik op de overlay-achtergrond)
  menu.addEventListener('click', e => {
    if (e.target === menu && menu.dataset.open === 'true') close();
  });

  // ESC sluit
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.dataset.open === 'true') close();
  });

  // Focus-trap in overlay
  menu.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || menu.dataset.open !== 'true') return;
    const els = Array.from(focusables());
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Breakpoint gedrag
  const applyMode = () => {
    if (mql.matches) {
      // DESKTOP: inline menu, altijd zichtbaar
      menu.removeAttribute('role');
      menu.removeAttribute('aria-modal');
      menu.hidden = false;
      menu.dataset.open = 'false';
      toggle.setAttribute('aria-expanded','false');
      document.body.classList.remove('body--no-scroll');
      setPageInert(false);
    } else {
      // MOBIEL: overlay initieel dicht
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }
  };

  applyMode();
  mql.addEventListener('change', applyMode);

  // ---------------------------
  // Dynamische menuopbouw (Supabase)
  // ---------------------------
  let authSub = null;

  const buildMenu = async () => {
    // Leeg huidige items
    list.innerHTML = '';

    const { data: { session } } = await supabase.auth.getSession();

    // Standaard links (pas aan naar wens)
    addLink(list, '/', 'Home');
    addLink(list, 'mestplan.html', 'Maak mestplan');

    if (session) {
      // User-links
      addLink(list, 'upload.html', 'Upload');

      // Check rol voor admin
      let isAdmin = false;
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        isAdmin = prof?.role === 'admin';
      } catch (e) {
        // ignore; toon geen beheer-link
      }
      if (isAdmin) {
        addLink(list, 'beheer.html', 'Beheer');
      }

      addLink(list, 'account.html', 'Mijn account');
      addButton(list, 'Uitloggen', async () => {
        try {
          await supabase.auth.signOut();
        } finally {
          // Altijd naar accountpagina na signout
          window.location.href = 'account.html';
        }
      });
    } else {
      // Niet ingelogd
      addLink(list, 'account.html?mode=login', 'Inloggen');
    }

    // Sluit overlay bij klik op menu-link (mobiel)
    list.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => { if (!mql.matches) close(); });
    });
  };

  // Initieel laden
  buildMenu();

  // Rebuild bij auth-state changes (login/logout)
  authSub = supabase.auth.onAuthStateChange((_event, _session) => {
    buildMenu();
  });

  // Return cleanup (optioneel gebruiken)
  return {
    destroy() {
      mql.removeEventListener('change', applyMode);
      if (authSub && typeof authSub.subscription?.unsubscribe === 'function') {
        authSub.subscription.unsubscribe();
      }
      // Eventlisteners op DOM laten we zitten tenzij je SPA-routing doet.
    }
  };
}

/* ------------------------
   Kleine helpers
------------------------- */

function ensureList(menuEl) {
  // Gebruik eerste <ul> binnen menu, of maak er een.
  let ul = menuEl.querySelector('ul');
  if (!ul) {
    ul = document.createElement('ul');
    ul.className = 'nav-list';
    menuEl.appendChild(ul);
  }
  return ul;
}

function addLink(listEl, href, label) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  a.className = 'btn-primary'; // zorg dat je CSS deze class styled als knop/link
  li.appendChild(a);
  listEl.appendChild(li);
  return a;
}

function addButton(listEl, label, onClick) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.className = 'btn-primary';
  b.addEventListener('click', onClick);
  li.appendChild(b);
  listEl.appendChild(li);
  return b;
}
