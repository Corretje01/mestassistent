// nav.js
async function updateNavUI() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }

  const navRegister = document.getElementById('nav-register');
  const navAccount  = document.getElementById('nav-account');
  const navLogout   = document.getElementById('nav-logout');

  if (session) {
    navRegister.style.display = 'none';
    navAccount.style.display  = 'inline-block';
    navLogout.style.display   = 'inline-block';
  } else {
    navRegister.style.display = 'inline-block';
    navAccount.style.display  = 'none';
    navLogout.style.display   = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavUI();
  supabase.auth.onAuthStateChange(updateNavUI);

  document.getElementById('nav-register').onclick = () => location.href = '/account.html';
  document.getElementById('nav-account').onclick = () => location.href = '/account.html';
  document.getElementById('nav-logout').onclick = async () => {
    await supabase.auth.signOut();
    location.href = '/account.html';
  };
});
