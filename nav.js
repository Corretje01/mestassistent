// nav.js
// importeer de gedeelde Supabase-client
import { supabase } from './supabaseClient.js';

// 1) Update zichtbaarheid van alle nav-items op basis van Supabase-sessie
async function updateNavUI() {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;

  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }

  // Nav-elementen
  var navRegister = document.getElementById('nav-register');
  var navBereken  = document.getElementById('nav-bereken');
  var navMestplan = document.getElementById('nav-mestplan');
  var navAccount  = document.getElementById('nav-account');
  var navLogout   = document.getElementById('nav-logout');

  if (session) {
    // Inglogd → toon alles behalve “Inloggen”
    if (navRegister)  navRegister.style.display = 'none';
    if (navBereken)   navBereken.style.display  = 'inline-block';
    if (navMestplan)  navMestplan.style.display = 'inline-block';
    if (navAccount)   navAccount.style.display  = 'inline-block';
    if (navLogout)    navLogout.style.display   = 'inline-block';
  } else {
    // Niet inglogd → toon alleen “Inloggen”
    if (navRegister)  navRegister.style.display = 'inline-block';
    if (navBereken)   navBereken.style.display  = 'none';
    if (navMestplan)  navMestplan.style.display = 'none';
    if (navAccount)   navAccount.style.display  = 'none';
    if (navLogout)    navLogout.style.display   = 'none';
  }
}

// 2) Nadat DOM geladen is, initialiseer nav en knop-listeners
document.addEventListener('DOMContentLoaded', function() {
  // Direct UI updaten
  updateNavUI();

  // Ook updaten bij auth-state change
  supabase.auth.onAuthStateChange((event, session) => {
    updateNavUI();
  });

  // Hulpmethode om listener toe te voegen
  function bindClick(id, href) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', function(evt) {
        evt.preventDefault();
        window.location.href = href;
      });
    }
  }

  // 3) Klap de redirects netjes uit
  bindClick('nav-register',  '/account.html');
  bindClick('nav-bereken',   '/index.html');
  bindClick('nav-mestplan',  '/mestplan.html');
  bindClick('nav-account',   '/account.html');

  // 4) Logout-knop
  var btnLogout = document.getElementById('nav-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async function(evt) {
      evt.preventDefault();
      btnLogout.disabled = true;

      // Uitloggen
      var { error } = await supabase.auth.signOut();
      btnLogout.disabled = false;

      if (error) {
        console.error('Uitloggen mislukt:', error.message);
        alert('Uitloggen mislukt. Probeer opnieuw.');
      } else {
        // Update UI en redirect
        updateNavUI();
        window.location.href = '/account.html';
      }
    });
  }
});
