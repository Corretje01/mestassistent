// nav.js
async function updateNavUI() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }

  const navRegister  = document.getElementById('nav-register');
  const navAccount   = document.getElementById('nav-account');
  const navLogout    = document.getElementById('nav-logout');
  const navBereken   = document.getElementById('nav-bereken');
  const navMestplan  = document.getElementById('nav-mestplan');

  if (session) {
    navRegister && (navRegister.style.display = 'none');
    navAccount  && (navAccount.style.display  = 'inline-block');
    navLogout   && (navLogout.style.display   = 'inline-block');
    navBereken  && (navBereken.style.display  = 'inline-block');
    navMestplan && (navMestplan.style.display = 'inline-block');
  } else {
    navRegister && (navRegister.style.display = 'inline-block');
    navAccount  && (navAccount.style.display  = 'none');
    navLogout   && (navLogout.style.display   = 'none');
    navBereken  && (navBereken.style.display  = 'none');
    navMestplan && (navMestplan.style.display = 'none');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavUI();
  supabase.auth.onAuthStateChange(updateNavUI);

  document.getElementById('nav-register').onclick = () => { location.href = '/account.html'; };
  document.getElementById('nav-account').onclick = () => { location.href = '/account.html'; };

  document.getElementById('nav-logout')?.addEventListener('click', async (e) => {
    e.preventDefault();

    const logoutBtn = document.getElementById('nav-logout');
    logoutBtn.disabled = true;

    const { error } = await supabase.auth.signOut();

    logoutBtn.disabled = false;

    if (error) {
      console.error('Uitloggen mislukt:', error.message);
      alert('Uitloggen mislukt. Probeer opnieuw.');
    } else {
      // Session cleanup
      document.getElementById('nav-register')?.style.display = 'inline-block';
      document.getElementById('nav-account')?.style.display = 'none';
      document.getElementById('nav-bereken')?.style.display = 'none';
      document.getElementById('nav-mestplan')?.style.display = 'none';
      document.getElementById('nav-logout')?.style.display = 'none';

      window.location.href = '/account.html';
    }
  });
});
