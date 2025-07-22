console.log("[account.js] Start script laden");

const SUPABASE_URL = "https://joxzxtdkjenyayddtwmn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveHp4dGRramVueWF5ZGR0d21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwOTI4NTEsImV4cCI6MjA2ODY2ODg1MX0.4gHFI3jPjiVxLVTlgOsvhoa-i6XDkzcQP22FTPcaHm4";

console.log("[account.js] Voor createClient");
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("[account.js] Supabase client aangemaakt", supabase);

// Tabs
const tabRegister = document.getElementById('tab-register');
const tabLogin = document.getElementById('tab-login');
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const registerSuccess = document.getElementById('register-success');
const logoutBtn = document.getElementById('nav-logout');

console.log("[account.js] DOM elementen:", {tabRegister, tabLogin, registerForm, loginForm, registerSuccess, logoutBtn});

// Tabswitching
if (tabRegister && tabLogin) {
  console.log("[account.js] Tab functies worden ingesteld");
  tabRegister.onclick = () => {
    console.log("[account.js] Tab register klik");
    registerForm.style.display = "block";
    loginForm.style.display = "none";
    tabRegister.classList.add('btn-primary');
    tabLogin.classList.remove('btn-primary');
    registerSuccess.style.display = "none";
  };
  tabLogin.onclick = () => {
    console.log("[account.js] Tab login klik");
    registerForm.style.display = "none";
    loginForm.style.display = "block";
    tabLogin.classList.add('btn-primary');
    tabRegister.classList.remove('btn-primary');
    registerSuccess.style.display = "none";
  };
}

// SVG oogje
const svgEyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24">
  <path stroke="#000" stroke-width="2" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/>
  <circle cx="12" cy="12" r="3" stroke="#000" stroke-width="2"/>
</svg>`;
const svgEyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24">
  <path stroke="#000" stroke-width="2" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/>
  <circle cx="12" cy="12" r="3" stroke="#000" stroke-width="2"/>
  <line x1="4" y1="20" x2="20" y2="4" stroke="#000" stroke-width="2"/>
</svg>`;

console.log("[account.js] Oog SVGs klaar");

// Toggle password REGISTRATIE
const pwInput = document.getElementById('password');
const pwToggle = document.getElementById('toggle-password');
if (pwInput && pwToggle) {
  console.log("[account.js] Password toggle REGISTRATIE ready");
  pwToggle.addEventListener('click', () => {
    if (pwInput.type === 'password') {
      pwInput.type = 'text';
      pwToggle.innerHTML = svgEyeClosed;
    } else {
      pwInput.type = 'password';
      pwToggle.innerHTML = svgEyeOpen;
    }
  });
}

// Toggle password LOGIN
const loginPwInput = document.getElementById('loginPassword');
const loginPwToggle = document.getElementById('toggle-login-password');
if (loginPwInput && loginPwToggle) {
  console.log("[account.js] Password toggle LOGIN ready");
  loginPwToggle.addEventListener('click', () => {
    if (loginPwInput.type === 'password') {
      loginPwInput.type = 'text';
      loginPwToggle.innerHTML = svgEyeClosed;
    } else {
      loginPwInput.type = 'password';
      loginPwToggle.innerHTML = svgEyeOpen;
    }
  });
}

// Live validatie bij typen
function validateField(id, value) {
  // Log elke validatie
  console.log("[account.js] validateField", id, value);
  switch (id) {
    case 'firstName':
      return /^[A-Z][a-zA-Z]+$/.test(value) ? "" : "Voornaam moet beginnen met een hoofdletter en alleen letters bevatten.";
    case 'tussenvoegsel':
      return value === "" || /^[a-z]+$/.test(value) ? "" : "Tussenvoegsel mag geen hoofdletters bevatten.";
    case 'lastName':
      return /^[A-Z][a-zA-Z]+$/.test(value) ? "" : "Achternaam moet beginnen met een hoofdletter en alleen letters bevatten.";
    case 'email':
      return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value) ? "" : "Voer een geldig e-mailadres in (alleen kleine letters).";
    case 'phone':
      return /^\+31 6 [0-9]{8}$/.test(value) ? "" : "Telefoonnummer moet beginnen met '+31 6 ' en gevolgd worden door exact 8 cijfers.";
    case 'city':
      return /^[A-Z][a-zA-Z]+$/.test(value) ? "" : "Woonplaats moet beginnen met een hoofdletter en alleen letters bevatten.";
    case 'postcode':
      return /^[0-9]{4} [A-Z]{2}$/.test(value) ? "" : "Postcode moet in het formaat 1234 AB.";
    case 'street':
      return /^[A-Z][a-zA-Z\s]+$/.test(value) ? "" : "Straatnaam moet beginnen met een hoofdletter en alleen letters of spaties bevatten.";
    case 'huisnummer':
      return /^[0-9]+$/.test(value) ? "" : "Huisnummer mag alleen cijfers bevatten.";
    case 'password':
      return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/.test(value)
        ? ""
        : "Wachtwoord moet minimaal 6 tekens bevatten, met ten minste 1 hoofdletter, 1 kleine letter en 1 cijfer.";
    default:
      return "";
  }
}

if (registerForm) {
  console.log("[account.js] Register form gevonden!");

  Array.from(registerForm.elements).forEach(input => {
    console.log("[account.js] Koppel oninput event aan:", input.id);
    input.oninput = e => {
      const err = validateField(e.target.id, e.target.value);
      console.log("[account.js] oninput", e.target.id, "err:", err);
      document.getElementById(`err-${e.target.id}`)?.textContent = err;
    };
  });

  // Submit registratie
  registerForm.onsubmit = async e => {
    console.log("[account.js] Register submit klik!");
    e.preventDefault();
    let errors = 0;
    Array.from(registerForm.elements).forEach(input => {
      const err = validateField(input.id, input.value);
      if (err) {
        console.log("[account.js] Error bij veld:", input.id, err);
        document.getElementById(`err-${input.id}`)?.textContent = err;
        errors++;
      } else {
        document.getElementById(`err-${input.id}`)?.textContent = "";
      }
    });
    if (errors > 0) {
      console.log("[account.js] Errors gevonden, abort submit.");
      return;
    }

    // Supabase registratie
    console.log("[account.js] Verstuur signup request:", {
      email: registerForm.email.value,
      password: registerForm.password.value
    });
    const { data, error } = await supabase.auth.signUp({
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
          huisnummer_toevoeging: registerForm.huisnummer_toevoeging.value,
        },
        emailRedirectTo: `${window.location.origin}/mestplan.html`
      }
    });
    console.log("[account.js] Signup response", {data, error});
    if (error) {
      document.getElementById("err-email").textContent = error.message && error.message.includes("already registered")
        ? "Dit e-mailadres is al geregistreerd." : error.message;
      return;
    }
    registerSuccess.textContent = "Account succesvol aangemaakt. Controleer uw e-mail en klik op de link om te activeren.";
    registerSuccess.style.display = "block";
    registerForm.style.display = "none";
  };
} else {
  console.log("[account.js] Geen registerForm gevonden!");
}

// Submit login
if (loginForm) {
  console.log("[account.js] loginForm gevonden!");

  loginForm.onsubmit = async e => {
    console.log("[account.js] Login submit klik!");
    e.preventDefault();
    document.getElementById('err-login-general').textContent = '';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.loginEmail.value,
        password: loginForm.loginPassword.value,
      });
      console.log("[account.js] Login response", {data, error});
      if (error) {
        document.getElementById('err-login-general').textContent = "Foutieve inloggegevens of e-mail niet geverifieerd.";
        return;
      }
      if (!data || !data.session) {
        document.getElementById('err-login-general').textContent = "Uw account is nog niet geactiveerd (controleer uw e-mail).";
        return;
      }
      window.location.href = "/mestplan.html";
    } catch (err) {
      console.log("[account.js] Login error:", err);
      document.getElementById('err-login-general').textContent = "Er is een fout opgetreden bij het inloggen.";
    }
  };
} else {
  console.log("[account.js] Geen loginForm gevonden!");
}

// Session check: protect route mestplan.html
if (window.location.pathname.endsWith('mestplan.html')) {
  console.log("[account.js] Check session voor mestplan.html");
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      console.log("[account.js] Geen actieve sessie, redirect naar account.html");
      window.location.href = '/account.html';
    } else {
      console.log("[account.js] Sessie gevonden:", session);
    }
  });
}

// Uitloggen
if (logoutBtn) {
  console.log("[account.js] Logout knop gevonden!");
  logoutBtn.onclick = async () => {
    console.log("[account.js] Uitloggen...");
    await supabase.auth.signOut();
    window.location.href = "/account.html";
  };
} else {
  console.log("[account.js] Geen logoutBtn gevonden!");
}

console.log("[account.js] Script einde");
