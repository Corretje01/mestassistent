// nav.js
// Zorg dat Supabase al geladen is (dus include dit ná de Supabase-script maar vóór page-scripts)
async function updateNavUI() {
  const { data: { session } } = await supabase.auth.getSession();

  const navRegister = document.getElementById('nav-register');
  const navAccount  = document.getElementById('nav-account');
  const navLogout   = document.getElementById('nav-logout');

  if (session) {
    navRegister && (navRegister.style.display = 'none');
    navAccount  && (navAccount.style.display  = 'inline-block');
    navLogout   && (navLogout.style.display   = 'inline-block');
  } else {
    navRegister && (navRegister.style.display = 'inline-block');
    navAccount  && (navAccount.style.display  = 'none');
    navLogout   && (navLogout.style.display   = 'none');
  }
}

// Aanroepen zodra DOM klaar is
document.addEventListener('DOMContentLoaded', () => {
  updateNavUI();
  supabase.auth.onAuthStateChange(() => updateNavUI());
});

// Klik handlers
document.getElementById('nav-account')?.addEventListener('click', e => {
  e.preventDefault();
  window.location.href = '/account.html';
});
document.getElementById('nav-logout')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = '/account.html';
});
