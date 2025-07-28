// nav.js

// Supabase-configuratie
const SUPABASE_URL = "https://joxzxtdkjenyayddtwmn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveHp4dGRramVueWF5ZGR0d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwOTI4NTEsImV4cCI6MjA2ODY2ODg1MX0.4gHFI3jPjiVxLVTlgOsvhoa-i6XDkzcQP22FTPcaHm4";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Functie om navigatie te updaten op basis van sessie
async function updateNavUI() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Sessie ophalen mislukt:', error.message);
    return;
  }

  // Selecteer navigatie-elementen
  const navRegister = document.getElementById('nav-register');
  const navAccount  = document.getElementById('nav-account');
  const navLogout   = document.getElementById('nav-logout');

  // Toon/verberg navigatieknoppen op basis van inlogstatus
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

// Initialiseer navigatie zodra pagina is geladen
document.addEventListener('DOMContentLoaded', () => {
  updateNavUI();

  // Luister naar sessiewijzigingen (login/logout)
  supabase.auth.onAuthStateChange(() => {
    updateNavUI();
  });

  // Voeg navigatie-klikgedrag toe
  document.getElementById('nav-register')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/account.html';
  });

  document.getElementById('nav-account')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/account.html';
  });

  document.getElementById('nav-logout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Uitloggen mislukt:', error.message);
    } else {
      window.location.href = '/account.html';
    }
  });
});
