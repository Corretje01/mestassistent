// Client‑side logic for registration, login, profile management in MestAssistent

console.log("[account.js] Script start");

const SUPABASE_URL = "https://joxzxtdkjenyayddtwmn.supabase.co";
const SUPABASE_KEY = "<YOUR_SUPABASE_KEY>";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("[account.js] Supabase client ready");

function validateField(id, value) { /* bestaande validatie */ }

// Password toggles (ongewijzigd)

// DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  const authSect    = document.getElementById('auth-section');
  const profileSect = document.getElementById('profile-section');
  const registerForm = document.getElementById('registerForm');
  const loginForm    = document.getElementById('loginForm');
  const profileForm  = document.getElementById('profileForm');

  // Toggle auth tabs
  document.getElementById('showRegister').addEventListener('click', () => {
    registerForm.style.display = 'block';
    loginForm.style.display    = 'none';
  });
  document.getElementById('showLogin').addEventListener('click', () => {
    registerForm.style.display = 'none';
    loginForm.style.display    = 'block';
  });

  const { data: { session }, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) { console.error(sessErr.message); return; }

  if (session) {
    authSect.style.display    = 'none';
    profileSect.style.display = 'block';
    const md = session.user.user_metadata || {};
    document.getElementById('profileFirstName').value             = md.voornaam              || '';
    document.getElementById('profileTussenvoegsel').value         = md.tussenvoegsel         || '';
    document.getElementById('profileLastName').value              = md.achternaam            || '';
    document.getElementById('profilePhone').value                 = md.telefoon              || '';
    document.getElementById('profileCity').value                  = md.woonplaats            || '';
    document.getElementById('profilePostcode').value              = md.postcode              || '';
    document.getElementById('profileStreet').value                = md.straat                || '';
    document.getElementById('profileHuisnummer').value            = md.huisnummer            || '';
    document.getElementById('profileHuisnummer_toevoeging').value = md.huisnummer_toevoeging || '';
    document.getElementById('profileEmail').value                 = session.user.email || '';

    profileForm.onsubmit = async e => {
      e.preventDefault();
      const updates = { data: {
        voornaam: md.voornaam       = document.getElementById('profileFirstName').value,
        tussenvoegsel:               document.getElementById('profileTussenvoegsel').value,
        achternaam:                  document.getElementById('profileLastName').value,
        telefoon:                    document.getElementById('profilePhone').value,
        woonplaats:                  document.getElementById('profileCity').value,
        postcode:                    document.getElementById('profilePostcode').value,
        straat:                      document.getElementById('profileStreet').value,
        huisnummer:                  document.getElementById('profileHuisnummer').value,
        huisnummer_toevoeging:       document.getElementById('profileHuisnummer_toevoeging').value
      }};
      const { error } = await supabase.auth.updateUser(updates);
      if (error) {
        console.error(error.message);
        document.getElementById('err-profileFirstName').textContent = error.message;
      } else {
        alert('Wijzigingen opgeslagen!');
      }
    };

    document.getElementById('btnDeleteAccount').onclick = async () => {
      if (!confirm('Weet u zeker dat u uw account wilt verwijderen?')) return;
      await supabase.from('profiles').delete().eq('id', session.user.id);
      await supabase.auth.signOut();
      window.location.href = '/account.html';
    };

    document.getElementById('btnLogoutInline').onclick = async () => {
      await supabase.auth.signOut();
      window.location.href = '/account.html';
    };
  } else {
    authSect.style.display    = 'block';
    profileSect.style.display = 'none';
  }

  // 5) LIVE validatie registratie
  if (registerForm) {
    Array.from(registerForm.elements).forEach(input => {
      input.oninput = e => {
        const err = validateField(e.target.id, e.target.value);
        const errEl = document.getElementById(`err-${e.target.id}`);
        if (errEl) errEl.textContent = err;
      };
    });

    // SUBMIT registratie
    registerForm.onsubmit = async e => {
      e.preventDefault();
      let errors = 0;
      Array.from(registerForm.elements).forEach(input => {
        const err = validateField(input.id, input.value);
        const errEl = document.getElementById(`err-${input.id}`);
        if (err) {
          errors++;
          if (errEl) errEl.textContent = err;
        } else if (errEl) {
          errEl.textContent = '';
        }
      });
      if (errors) return;

      // Signup API call
      const { error } = await supabase.auth.signUp({
        email: registerForm.email.value,
        password: registerForm.password.value,
        options: {
          data: {
            voornaam: registerForm.firstName.value,
            tussenvoegsel: registerForm.tussenvoegsel.value,
            achternaam: registerForm.lastName.value,
            telefoon: registerForm.phone.value,
            woonplaats: registerForm.city.value,
            postcode: registerForm.postcode.value,
            straat: registerForm.street.value,
            huisnummer: registerForm.huisnummer.value,
            huisnummer_toevoeging: registerForm.huisnummer_toevoeging.value
          },
          emailRedirectTo: `${window.location.origin}/mestplan.html`
        }
      });
      if (error) {
        document.getElementById('err-email').textContent = error.message.includes("already registered")
          ? "Dit e-mailadres is al geregistreerd." : error.message;
        return;
      }
      registerSuccess.textContent = "Account aangemaakt! Controleer uw e-mail om te activeren.";
      registerSuccess.style.display = 'block';
      registerForm.style.display = 'none';
    };
  }

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
