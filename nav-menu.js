// nav-menu.js
// Usage:
//   import { initNavMenu } from './nav-menu.js';
//   initNavMenu({ menuId: 'site-menu', toggleId: 'nav-toggle' });

export function initNavMenu({ menuId, toggleId }) {
  const menu   = document.getElementById(menuId);
  const toggle = document.getElementById(toggleId);
  if (!menu || !toggle) return;

  // Backdrop klikken = sluiten (klik op buitenkant)
  menu.addEventListener('click', e => {
    if (e.target === menu && menu.dataset.open === 'true') close();
  });

  const focusables = () =>
    menu.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');

  const open = () => {
    menu.hidden = false;
    menu.dataset.open = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('body--no-scroll');
    // Focus op eerste focusable
    const first = focusables()[0];
    first ? first.focus() : toggle.focus();
  };

  const close = () => {
    menu.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('body--no-scroll');
    // verberg na animatie
    window.requestAnimationFrame(() => {
      // korte delay zodat opacity/transition afrondt
      setTimeout(() => {
        if (menu.dataset.open !== 'true') menu.hidden = true;
      }, 200);
    });
    toggle.focus();
  };

  toggle.addEventListener('click', () => {
    menu.dataset.open === 'true' ? close() : open();
  });

  // Escape sluit
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.dataset.open === 'true') close();
  });

  // Focus-trap
  menu.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || menu.dataset.open !== 'true') return;
    const els = Array.from(focusables());
    if (!els.length) return;
    const first = els[0];
    const last  = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  // Zorg dat menu initieel hidden is (progressive enhancement)
  menu.hidden = true;
  menu.dataset.open = 'false';
}
