// Handles login, registration and profile toggles based on URL hash and Supabase session

const SUPABASE_URL = "https://joxzxtdkjenyayddtwmn.supabase.co";
const SUPABASE_KEY = "<YOUR_SUPABASE_KEY>";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Toggle visibility helpers
function show(el) { el.style.display = 'block'; }
function hide(el) { el.style.display = 'none'; }

// On load
document.addEventListener('DOMContentLoaded', async () => {
  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const profileSect  = document.getElementById('profile-section');
  const authSect     = document.getElementById('auth-section');

  // Determine initial tab from URL hash
  function showTab(hash) {
    if (hash === '#register') {
      show(registerForm); hide(loginForm);
    } else {
      show(loginForm); hide(registerForm);
    }
  }
  window.addEventListener('hashchange', () => {
    showTab(window.location.hash);
  });

  // Toggle buttons
  document.getElementById('showLogin').addEventListener('click', () => {
    window.location.hash = '#login';
    showTab('#login');
  });
  document.getElementById('showRegister').addEventListener('click', () => {
    window.location.hash = '#register';
    showTab('#register');
  });

  // Links inside forms
  document.getElementById('toRegisterBottom').addEventListener('click', e => {
    e.preventDefault(); window.location.hash = '#register'; showTab('#register');
  });
  document.getElementById('toLoginTop').addEventListener('click', e => {
    e.preventDefault(); window.location.hash = '#login'; showTab('#login');
  });

  // Supabase session check
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Session error:', error.message);
  }
  if (session) {
    // User logged in: show profile section
    hide(authSect);
    show(profileSect);
  } else {
    // Not logged in: show auth forms
    show(authSect);
    hide(profileSect);
  }

  // LOGIN submit
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      document.getElementById('err-login-general').textContent = loginError.message;
    } else {
      window.location.href = '/account.html';
    }
  });

  // REGISTER submit
  registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
      options: {
        data: {
          voornaam: document.getElementById('firstName').value,
          tussenvoegsel: document.getElementById('tussenvoegsel').value,
          achternaam: document.getElementById('lastName').value,
          telefoon: document.getElementById('phone').value,
          woonplaats: document.getElementById('city').value,
          postcode: document.getElementById('postcode').value,
          straat: document.getElementById('street').value,
          huisnummer: document.getElementById('huisnummer').value,
          huisnummer_toevoeging: document.getElementById('huisnummer_toevoeging').value
        }
      }
    };
    const { data, error: regError } = await supabase.auth.signUp(payload);
    if (regError) {
      document.getElementById('register-success').textContent = regError.message;
    } else {
      document.getElementById('register-success').textContent = 'Registratie gelukt! Check je mail voor bevestiging.';
    }
  });

  // 6) LOGIN formulier submit
  if (loginForm) {
    loginForm.onsubmit = async e => {
      e.preventDefault();
      const generalErrEl = document.getElementById('err-login-general');
      if (generalErrEl) generalErrEl.textContent = '';

      const email    = loginForm.loginEmail.value;
      const password = loginForm.loginPassword.value;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        if (generalErrEl) generalErrEl.textContent = "Ongeldige gegevens of e-mail niet geverifieerd.";
        return;
      }
      window.location.href = '/mestplan.html';
    };
  }

}); // end DOMContentLoaded

console.log("[account.js] Script end");
