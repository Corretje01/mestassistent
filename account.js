// Handles login, registration and profile toggles based on URL hash and Supabase session

const SUPABASE_URL = "https://joxzxtdkjenyayddtwmn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveHp4dGRramVueWF5ZGR0d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwOTI4NTEsImV4cCI6MjA2ODY2ODg1MX0.4gHFI3jPjiVxLVTlgOsvhoa-i6XDkzcQP22FTPcaHm4";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Toggle visibility helpers
function show(el) { el.style.display = 'block'; }
function hide(el) { el.style.display = 'none'; }

// On load
document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const profileSect = document.getElementById('profile-section');
  const authSect = document.getElementById('auth-section');

  const messageEl = document.getElementById('auth-message');

  async function handleAuth(form, action) {
    const formData = Object.fromEntries(new FormData(form));
    let result;

    if (action === 'login') {
      result = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });
    } else if (action === 'register') {
      result = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { data: formData }
      });
    }

    if (result.error) {
      messageEl.textContent = result.error.message;
      messageEl.className = 'message error';
    } else {
      messageEl.textContent = action === 'login' ? 'Succesvol ingelogd!' : 'Registratie geslaagd! Controleer je mail.';
      messageEl.className = 'message success';
      setTimeout(() => location.href = '/mestplan.html', 1500);
    }
  }

  loginForm.onsubmit = (e) => {
    e.preventDefault();
    handleAuth(e.target, 'login');
  };

  registerForm.onsubmit = (e) => {
    e.preventDefault();
    handleAuth(e.target, 'register');
  };

  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    authSect.style.display = 'none';
    profileSect.style.display = 'block';

    const { data: { user } } = await supabase.auth.getUser();
    const md = user.user_metadata;
    ['voornaam', 'tussenvoegsel', 'achternaam', 'telefoon', 'woonplaats', 'postcode', 'straat', 'huisnummer', 'huisnummer_toevoeging']
    .forEach(id => document.getElementById(id).value = md[id] || '');
  }

  document.getElementById('profileForm').onsubmit = async (e) => {
    e.preventDefault();
    const updates = Object.fromEntries(new FormData(e.target));
    const { error } = await supabase.auth.updateUser({ data: updates });

    const profileMsg = document.getElementById('profile-message');
    if (error) {
      profileMsg.textContent = error.message;
      profileMsg.className = 'message error';
    } else {
      profileMsg.textContent = 'Wijzigingen opgeslagen!';
      profileMsg.className = 'message success';
    }
  };

  document.getElementById('deleteAccount').onclick = async () => {
    if (confirm('Weet je zeker dat je jouw account permanent wilt verwijderen?')) {
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
// end DOMContentLoaded
console.log("[account.js] Script end");
