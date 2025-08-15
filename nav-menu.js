// nav-menu.js
// Usage per pagina:
//   import { initNavMenu } from './nav-menu.js';
//   initNavMenu({ menuId: 'site-menu', toggleId: 'nav-toggle' });

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

  const mql = window.matchMedia('(min-width: 1024px)');

  const setPageInert = (on) => {
    [main, footer].forEach(el => {
      if (!el) return;
      if (on) { el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); }
      else { el.removeAttribute('aria-hidden'); el.removeAttribute('inert'); }
    });
  };

  const focusables = () =>
    menu.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');

  const open = () => {
    if (mql.matches) return; // desktop: geen overlay
    menu.hidden = false;
    menu.dataset.open = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('body--no-scroll');
    setPageInert(true);
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    const first = focusables()[0];
    (first || toggle).focus();
  };

  const close = () => {
    if (mql.matches) return;
    menu.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('body--no-scroll');
    setPageInert(false);
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 180));
    toggle.focus();
  };

  // Toggle
  toggle.addEventListener('click', () => {
    (menu.dataset.open === 'true') ? close() : open();
  });

  // Close (X)
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => { e.preventDefault(); close(); });
  }

  // Backdrop klik
  menu.addEventListener('click', (e) => {
    if (e.target === menu && menu.dataset.open === 'true') close();
  });

  // ESC sluit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.dataset.open === 'true') close();
  });

  // Focus-trap
  menu.addEventListener('keydown', (e) => {
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
      // desktop: inline
      menu.removeAttribute('role');
      menu.removeAttribute('aria-modal');
      menu.hidden = false;
      menu.dataset.open = 'false';
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('body--no-scroll');
      setPageInert(false);
    } else {
      // mobiel: overlay initieel dicht
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }
  };

  applyMode();
  mql.addEventListener('change', applyMode);

  return { destroy() { mql.removeEventListener('change', applyMode); } };
}
