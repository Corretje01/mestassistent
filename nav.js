// nav.js
// Eenvoudige navigation: 1 knop "Inloggen" opent direct de login-sectie op account.html

async function updateNavUI() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error fetching session:', error.message);
    return;
  }

  const navLogin   = document.getElementById('nav-login');
  const navAccount = document.getElementById('nav-account');
  const navLogout  = document.getElementById('nav-logout');

  if (session) {
    // Ingelogd: toon account en logout, verberg login
    navLogin && (navLogin.style.display = 'none');
    navAccount && (navAccount.style.display = 'inline-block');
    navLogout && (navLogout.style.display = 'inline-block');
  } else {
    // Niet ingelogd: toon login-knop, verberg account en logout
    navLogin && (navLogin.style.display = 'inline-block');
    navAccount && (navAccount.style.display = 'none');
    navLogout && (navLogout.style.display = 'none');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavUI();
  supabase.auth.onAuthStateChange(() => updateNavUI());

  // Inloggen knop: direct naar login-tab op account.html
  document.getElementById('nav-login')?.addEventListener('click', e => {
    e.preventDefault();
    window.location.href = '/account.html#login';
  });

  // Mijn account link
  document.getElementById('nav-account')?.addEventListener('click', e => {
    e.preventDefault();
    window.location.href = '/account.html';
  });

  // Logout knop
  document.getElementById('nav-logout')?.addEventListener('click', async () => {
    const btn = document.getElementById('nav-logout');
    btn.disabled = true;
    const { error } = await supabase.auth.signOut();
    btn.disabled = false;
    if (error) console.error('Logout failed:', error.message);
    else window.location.href = '/account.html';
  });
});
