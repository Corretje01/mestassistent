// Handles login, registration and profile toggles based on URL hash and Supabase session

// Utility-functies
function show(el) { el.style.display = 'block'; }
function hide(el) { el.style.display = 'none'; }

document.addEventListener('DOMContentLoaded', async () => {

  const authSect = document.getElementById('auth-section');
  const profileSect = document.getElementById('profile-section');
  const messageEl = document.getElementById('auth-message');

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const profileForm = document.getElementById('profileForm');
  const profileMsg = document.getElementById('profile-message');

  const showLogin = () => { show(loginForm); hide(registerForm); };
  const showRegister = () => { hide(loginForm); show(registerForm); };

  document.getElementById('show-register').onclick = (e) => { e.preventDefault(); showRegister(); };
  document.getElementById('show-login').onclick = (e) => { e.preventDefault(); showLogin(); };

  // Controleer sessie bij laden
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    hide(authSect);
    show(profileSect);

    // Vul profielgegevens in
    const { data: { user } } = await supabase.auth.getUser();
    const md = user.user_metadata;

    Object.entries(md).forEach(([key, value]) => {
      const el = document.getElementById(`profile_${key}`);
      if (el) el.value = value;
    });

  } else {
    show(authSect);
    showLogin();
    hide(profileSect);
  }

  // Login-functionaliteit
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;
  
    const { error } = await supabase.auth.signInWithPassword({ email, password });
  
    if (error) {
      messageEl.textContent = error.message;
      messageEl.className = 'message error';
      return;
    }
  
    messageEl.textContent = 'Inloggen gelukt. Sessie wordt geladen...';
    messageEl.className = 'message success';
  
    // Wacht tot Supabase bevestigt dat de sessie live is
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Zodra echt ingelogd → redirect
        window.location.href = '/mestplan.html';
      }
    });
  };

  // Registratie-functionaliteit
  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(registerForm));

    const { error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { data: formData }
    });

    if (error) {
      messageEl.textContent = error.message;
      messageEl.className = 'message error';
    } else {
      messageEl.textContent = 'Registratie geslaagd! Controleer je mail om je account te activeren.';
      messageEl.className = 'message success';
      showLogin();
    }
  };

  // Profielgegevens opslaan
  profileForm.onsubmit = async (e) => {
    e.preventDefault();
    const updates = {
      voornaam: document.getElementById('profile_voornaam').value,
      tussenvoegsel: document.getElementById('profile_tussenvoegsel').value,
      achternaam: document.getElementById('profile_achternaam').value,
      telefoon: document.getElementById('profile_telefoon').value,
      woonplaats: document.getElementById('profile_woonplaats').value,
      postcode: document.getElementById('profile_postcode').value,
      straat: document.getElementById('profile_straat').value,
      huisnummer: document.getElementById('profile_huisnummer').value,
      huisnummer_toevoeging: document.getElementById('profile_huisnummer_toevoeging').value
    };

    const { error } = await supabase.auth.updateUser({ data: updates });

    if (error) {
      profileMsg.textContent = error.message;
      profileMsg.className = 'message error';
    } else {
      profileMsg.textContent = 'Wijzigingen succesvol opgeslagen!';
      profileMsg.className = 'message success';
    }
  };

  // Account verwijderen (vereist Supabase Function)
  document.getElementById('deleteAccount').onclick = async () => {
    if (confirm('Weet je zeker dat je jouw account permanent wilt verwijderen? Deze actie kan niet ongedaan gemaakt worden.')) {
      const { error } = await supabase.functions.invoke('delete-user');
      if (!error) {
        await supabase.auth.signOut();
        location.href = '/index.html';
      } else {
        alert('Fout bij verwijderen account: ' + error.message);
      }
    }
  };

});
