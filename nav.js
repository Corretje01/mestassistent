// nav.js
import { supabase } from './supabaseClient.js';

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

// Korte helper voor navigatie
function bindClick(id, href) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', evt => {
    // knoppen binnen overlay mogen navigeren en menu sluiten
    evt.preventDefault();
    window.location.href = href;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavUI();

  supabase.auth.onAuthStateChange(() => {
    updateNavUI();
  });

  bindClick('nav-register', '/account.html');
  bindClick('nav-bereken',  '/stap1.html');
  bindClick('nav-mestplan', '/mestplan.html');
  bindClick('nav-account',  '/account.html');

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
        window.location.href = '/account.html';
      }
    });
  }
});
