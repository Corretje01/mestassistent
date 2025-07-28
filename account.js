// Client‑side logic for registration, login, profile management in MestAssistent

console.log("[account.js] Script start");

// 1) Supabase client initialiseren
const SUPABASE_URL = "https://joxzxtdkjenyayddtwmn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveHp4dGRramVueWF5ZGR0d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwOTI4NTEsImV4cCI6MjA2ODY2ODg1MX0.4gHFI3jPjiVxLVTlgOsvhoa-i6XDkzcQP22FTPcaHm4";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("[account.js] Supabase client ready");

// 2) Utility: veldvalidatie
function validateField(id, value) {
  switch (id) {
    case 'firstName':
      return /^[A-Z][a-zA-Z]+$/.test(value)
        ? "" : "Voornaam moet beginnen met hoofdletter en alleen letters bevatten.";
    case 'tussenvoegsel':
      return value === "" || /^[a-z]+$/.test(value)
        ? "" : "Tussenvoegsel mag alleen kleine letters bevatten.";
    case 'lastName':
      return /^[A-Z][a-zA-Z]+$/.test(value)
        ? "" : "Achternaam moet beginnen met hoofdletter en alleen letters bevatten.";
    case 'email':
      return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value)
        ? "" : "Voer een geldig e-mailadres in (kleine letters).";
    case 'phone':
      return /^\+31 6 [0-9]{8}$/.test(value)
        ? "" : "Telefoon moet beginnen met '+31 6 ' en gevolgd door 8 cijfers.";
    case 'city':
      return /^[A-Z][a-zA-Z]+$/.test(value)
        ? "" : "Woonplaats moet beginnen met hoofdletter en alleen letters bevatten.";
    case 'postcode':
      return /^[0-9]{4} [A-Z]{2}$/.test(value)
        ? "" : "Postcode moet in het formaat 1234 AB.";
    case 'street':
      return /^[A-Z][a-zA-Z\s]+$/.test(value)
        ? "" : "Straat moet beginnen met hoofdletter en alleen letters/spaties bevatten.";
    case 'huisnummer':
      return /^[0-9]+$/.test(value)
        ? "" : "Huisnummer mag alleen cijfers bevatten.";
    case 'password':
      return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/.test(value)
        ? "" : "Wachtwoord min. 6 tekens, met 1 hoofdletter, 1 kleine letter en 1 cijfer.";
    default:
      return "";
  }
}

// 3) Password visibility toggles
const svgEyeOpen = `...`;   // (je bestaande eye-open SVG markup)
const svgEyeClosed = `...`; // (je bestaande eye-closed SVG markup)

['password','loginPassword'].forEach(fieldId => {
  const input = document.getElementById(fieldId);
  const toggle = document.getElementById(
    fieldId === 'password' ? 'toggle-password' : 'toggle-login-password'
  );
  if (input && toggle) {
    toggle.innerHTML = svgEyeOpen;
    toggle.addEventListener('click', () => {
      if (input.type === 'password') {
        input.type = 'text';
        toggle.innerHTML = svgEyeClosed;
      } else {
        input.type = 'password';
        toggle.innerHTML = svgEyeOpen;
      }
    });
  }
});

// 4) DOMContentLoaded: sessie-check & secties tonen/verbergen
document.addEventListener('DOMContentLoaded', async () => {
  console.log("[account.js] DOM ready");
  const path = window.location.pathname;
  if (!path.endsWith('account.html')) return;

  const authSect    = document.getElementById('auth-section');
  const profileSect = document.getElementById('profile-section');
  const registerForm = document.getElementById('registerForm');
  const loginForm    = document.getElementById('loginForm');
  const profileForm  = document.getElementById('profileForm');
  const registerSuccess = document.getElementById('register-success');
  const btnDeleteAccount = document.getElementById('btnDeleteAccount');
  const btnLogoutInline  = document.getElementById('btnLogoutInline');

  // Haal sessie op
  const { data: { session }, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) {
    console.error("Fout sessie ophalen:", sessErr.message);
    return;
  }

  if (session) {
    // INGLOGED: toon profiel, verberg auth
    authSect && (authSect.style.display    = 'none');
    profileSect && (profileSect.style.display = 'block');

    // Voorinvullen
    const user = session.user;
    const md   = user.user_metadata || {};
    document.getElementById('profileFirstName').value             = md.voornaam              || '';
    document.getElementById('profiletussenvoegsel').value         = md.tussenvoegsel         || '';
    document.getElementById('profileLastName').value              = md.achternaam            || '';
    document.getElementById('profilePhone').value                 = md.telefoon              || '';
    document.getElementById('profileCity').value                  = md.woonplaats            || '';
    document.getElementById('profilePostcode').value              = md.postcode              || '';
    document.getElementById('profileStreet').value                = md.straat                || '';
    document.getElementById('profileHuisnummer').value            = md.huisnummer            || '';
    document.getElementById('profileHuisnummer_toevoeging').value = md.huisnummer_toevoeging || '';
    document.getElementById('profileEmail').value = user.email || '';

    // OPSLAAN knoplabel
    document.getElementById('btnSaveProfile').textContent = 'Wijzigingen opslaan';

    // PROFIEL OPSLAAN
    if (profileForm) {
      profileForm.onsubmit = async e => {
        e.preventDefault();
        document.getElementById('btnSaveProfile').disabled = true;
        const updates = {
          data: {
            voornaam:           document.getElementById('profileFirstName').value,
            tussenvoegsel:      document.getElementById('profileTussenvoegsel').value,
            achternaam:         document.getElementById('profileLastName').value,
            // Email laat je achterwege of alleen lezen: updateUser pakt email niet via data
            telefoon:           document.getElementById('profilePhone').value,
            woonplaats:         document.getElementById('profileCity').value,
            postcode:           document.getElementById('profilePostcode').value,
            straat:             document.getElementById('profileStreet').value,
            huisnummer:         document.getElementById('profileHuisnummer').value,
            huisnummer_toevoeging: document.getElementById('profileHuisnummer_toevoeging').value
          }
        };
        const { error } = await supabase.auth.updateUser(updates);
        document.getElementById('btnSaveProfile').disabled = false;
        if (error) {
          console.error("Update fout:", error.message);
          document.getElementById('err-profileFirstName').textContent = error.message;
        } else {
          alert("Wijzigingen opgeslagen!");
        }
      };
    }

    // ACCOUNT VERWIJDEREN
    if (btnDeleteAccount) {
      btnDeleteAccount.onclick = async () => {
        if (!confirm("Weet u zeker dat u uw account wilt verwijderen?")) return;
        // Verwijder eventueel profielrecord uit 'profiles' tabel
        await supabase.from('profiles').delete().eq('id', user.id);
        // Verwijder auth-account
        await supabase.auth.signOut();
        window.location.href = '/account.html';
      };
    }

    // INLINE UITLOGGEN
    if (btnLogoutInline) {
      btnLogoutInline.onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = '/account.html';
      };
    }

  } else {
    // NIET-INGELOGD: toon registratie/login
    authSect && (authSect.style.display    = 'block');
    profileSect && (profileSect.style.display = 'none');
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
