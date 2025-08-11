// nav-menu.js
// Usage:
//   import { initNavMenu } from './nav-menu.js';
//   initNavMenu({ menuId: 'site-menu', toggleId: 'nav-toggle' });

export function initNavMenu({ menuId, toggleId }) {
  const menu   = document.getElementById(menuId);
  const toggle = document.getElementById(toggleId);
  const closeBtn = document.getElementById('nav-close');
  const main   = document.getElementById('main');
  const footer = document.getElementById('footer');

  if (!menu || !toggle) return;

  const mql = window.matchMedia('(min-width: 1024px)');

  const setPageInert = (on) => {
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
    // dialoog-semantiek
    menu.setAttribute('role','dialog');
    menu.setAttribute('aria-modal','true');
    // focus naar eerste item
    const first = focusables()[0];
    (first || toggle).focus();
  };

  const close = () => {
    if (mql.matches) return; // desktop heeft geen overlay
    menu.dataset.open = 'false';
    toggle.setAttribute('aria-expanded','false');
    document.body.classList.remove('body--no-scroll');
    setPageInert(false);
    // verberg na korte delay (voor fade-out)
    requestAnimationFrame(() => setTimeout(() => {
      if (menu.dataset.open !== 'true') menu.hidden = true;
    }, 180));
    toggle.focus();
  };

  // Backdrop: klik op de achtergrond (menu zelf) sluit
  menu.addEventListener('click', e => {
    if (e.target === menu && menu.dataset.open === 'true') close();
  });

  // Close-button (kruisje)
  if (closeBtn) {
    closeBtn.addEventListener('click', e => {
      e.preventDefault();
      close();
    });
  }

  // Toggle
  toggle.addEventListener('click', () => {
    (menu.dataset.open === 'true') ? close() : open();
  });

  // ESC sluit
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.dataset.open === 'true') close();
  });

  // Focus-trap
  menu.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || menu.dataset.open !== 'true') return;
    const els = Array.from(focusables());
    if (!els.le
