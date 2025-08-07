// account.js – veilig accountbeheer met Supabase-authenticatie

// importeer de gedeelde Supabase-client
import { supabase } from './supabaseClient.js';

// ===== UTILITIES =====
function show(el) { el.style.display = 'block'; }
function hide(el) { el.style.display = 'none'; }

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  const authSect     = document.getElementById('auth-section');
  const profileSect  = document.getElementById('profile-section');
  const messageEl    = document.getElementById('auth-message');
  const profileMsg   = document.getElementById('profile-message');

  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const profileForm  = document.getElementById('profileForm');

  const showLogin    = () => { show(loginForm); hide(registerForm); };
  const showRegister = () => { hide(loginForm); show(registerForm); };

  document.getElementById('show-register')?.addEventListener('click', e => {
    e.preventDefault();
    showRegister();
  });

  document.getElementById('show-login')?.addEventListener('click', e => {
    e.preventDefault();
    showLogin();
  });

  // ===== SESSIECHECK BIJ PAGINALADEN =====
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    hide(authSect);
    show(profileSect);
    loadProfileData();
  } else {
    show(authSect);
    showLogin();
    hide(profileSect);
  }

  // ===== PROFIEL INVULLEN BIJ INGLOGD =====
  async function loadProfileData() {
    const { data: { user } } = await supabase.auth.getUser();
    const md = user.user_metadata || {};
    Object.entries(md).forEach(([key, value]) => {
      const el = document.getElementById(`profile_${key}`);
      if (el) el.value = value;
    });
  }

  // ===== LOGIN =====
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const email    = loginForm.email.value;
    const password = loginForm.password.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      messageEl.textContent = error.message;
      messageEl.className = 'message error';
      return;
    }

    messageEl.textContent = 'Inloggen gelukt!';
    messageEl.className = 'message success';

    // Wacht kort op sessie en redirect
    setTimeout(async () => {
      const { data: { session: newSession } } = await supabase.auth.getSession();
      if (newSession) {
        window.location.href = '/mestplan.html';
      } else {
        messageEl.textContent = 'Er ging iets mis met inloggen. Probeer opnieuw.';
        messageEl.className = 'message error';
      }
    }, 500);
  };

  // ===== REGISTRATIE =====
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
      messageEl.textContent = 'Registratie geslaagd! Bevestig je e-mail om verder te gaan.';
      messageEl.className = 'message success';
      showLogin();
    }
  };

  // ===== PROFIEL OPSLAAN =====
  profileForm.onsubmit = async (e) => {
    e.preventDefault();

    const updates = {
      voornaam: document.getElementById('profile_voornaam')?.value,
      tussenvoegsel: document.getElementById('profile_tussenvoegsel')?.value,
      achternaam: document.getElementById('profile_achternaam')?.value,
      telefoon: document.getElementById('profile_telefoon')?.value,
      woonplaats: document.getElementById('profile_woonplaats')?.value,
      postcode: document.getElementById('profile_postcode')?.value,
      straat: document.getElementById('profile_straat')?.value,
      huisnummer: document.getElementById('profile_huisnummer')?.value,
      huisnummer_toevoeging: document.getElementById('profile_huisnummer_toevoeging')?.value
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

  // ===== ACCOUNT VERWIJDEREN =====
  document.getElementById('deleteAccount')?.addEventListener('click', async () => {
    const confirmDelete = confirm('Weet je zeker dat je jouw account permanent wilt verwijderen?');
    if (!confirmDelete) return;

    const { error } = await supabase.functions.invoke('delete-user');
    if (error) {
      alert('Fout bij verwijderen account: ' + error.message);
    } else {
      await supabase.auth.signOut();
      location.href = '/index.html';
    }
  });
});
