// nav.js
// Shared navigation logic: show login/register or account/logout based on Supabase session.
// Assumes Supabase SDK is loaded and `supabase` client is initialized before this script.

/**
 * Updates the visibility of navigation buttons based on the user's session.
 */
async function updateNavUI() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error fetching session:', error.message);
    return;
  }

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

// Initialize navigation when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initial render
  updateNavUI();

  // Update on auth state changes (login, logout)
  supabase.auth.onAuthStateChange(() => {
    updateNavUI();
  });

  // "Mijn account" button click ➔ account.html
  const btnAccount = document.getElementById('nav-account');
  if (btnAccount) {
    btnAccount.addEventListener('click', e => {
      e.preventDefault();
      window.location.href = '/account.html';
    });
  }

  // Logout button click ➔ sign out and redirect
  const btnLogout = document.getElementById('nav-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      btnLogout.disabled = true;
      const { error } = await supabase.auth.signOut();
      btnLogout.disabled = false;
      if (error) {
        console.error('Logout failed:', error.message);
      } else {
        updateNavUI();
        window.location.href = '/account.html';
      }
    });
  }
});
