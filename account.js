// Vul je Supabase projectgegevens in:
const SUPABASE_URL = "https://jouw-project-url.supabase.co";
const SUPABASE_KEY = "public-anon-key"; // Zet in .env voor productie

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Tabs
const tabRegister = document.getElementById('tab-register');
const tabLogin = document.getElementById('tab-login');
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const registerSuccess = document.getElementById('register-success');
const logoutBtn = document.getElementById('nav-logout');

// Toggle forms
tabRegister.onclick = () => {
  registerForm.style.display = "block";
  loginForm.style.display = "none";
  tabRegister.classList.add('btn-primary');
  tabLogin.classList.remove('btn-primary');
};
tabLogin.onclick = () => {
  registerForm.style.display = "none";
  loginForm.style.display = "block";
  tabLogin.classList.add('btn-primary');
  tabRegister.classList.remove('btn-primary');
};

// Live validatie per veld
function validateField(id, value) {
  switch (id) {
    case 'firstName':
      return /^[A-Z][a-zA-Z]+$/.test(value) ? "" : "Voornaam moet beginnen met een hoofdletter.";
    case 'tussenvoegsel':
      return value === "" || /^[a-z]+$/.test(value) ? "" : "Tussenvoegsel mag geen hoofdletters bevatten.";
    case 'lastName':
      return /^[A-Z][a-zA-Z]+$/.test(value) ? "" : "Achternaam moet beginnen met een hoofdletter.";
    case 'email':
      return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value) ? "" : "Voer een geldig e-mailadres in (kleine letters).";
    case 'phone':
      return /^\+31 6 [0-9]{8}$/.test(value) ? "" : "Telefoonnummer moet beginnen met ‘+31 6’ en 8 cijfers bevatten.";
    case 'city':
      return /^[A-Z][a-zA-Z]+$/.test(value) ? "" : "Woonplaats moet beginnen met een hoofdletter.";
    case 'postcode':
      return /^[0-9]{4} [A-Z]{2}$/.test(value) ? "" : "Postcode moet in het formaat 1234 AB.";
    case 'street':
      return /^[A-Z][a-zA-Z\s]+$/.test(value) ? "" : "Straatnaam moet beginnen met een hoofdletter.";
    case 'huisnummer':
      return /^[0-9]+$/.test(value) ? "" : "Huisnummer mag alleen cijfers bevatten.";
    case 'password':
      return /^(?=.*[A-Z])(?=.*[0-9]).{6,}$/.test(value) ? "" : "Wachtwoord moet minimaal 6 tekens, een hoofdletter en een cijfer bevatten.";
    case 'voorwaarden':
      return value ? "" : "U moet akkoord gaan met de voorwaarden.";
    default:
      return "";
  }
}

Array.from(registerForm.elements).forEach(input => {
  input.oninput = e => {
    const err = validateField(e.target.id, e.target.value);
    document.getElementById(`err-${e.target.id}`)?.textContent = err;
  };
});

// Submit registratie
registerForm.onsubmit = async e => {
  e.preventDefault();
  let errors = 0;
  Array.from(registerForm.elements).forEach(input => {
    const err = validateField(input.id, input.type === "checkbox" ? input.checked : input.value);
    if (err) {
      document.getElementById(`err-${input.id}`)?.textContent = err;
      errors++;
    } else {
      document.getElementById(`err-${input.id}`)?.textContent = "";
    }
  });
  if (errors > 0) return;

  // Supabase registratie: email, password, extra user data
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
  if (error) {
    document.getElementById("err-email").textContent = error.message.includes("already registered")
      ? "Dit e-mailadres is al geregistreerd." : error.message;
    return;
  }
  registerSuccess.textContent = "Account succesvol aangemaakt. Controleer uw e-mail en klik op de link om te activeren.";
  registerSuccess.style.display = "block";
  registerForm.style.display = "none";
};

// Submit login
loginForm.onsubmit = async e => {
  e.preventDefault();
  document.getElementById('err-login-general').textContent = '';
  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginForm.loginEmail.value,
    password: loginForm.loginPassword.value,
  });
  if (error) {
    document.getElementById('err-login-general').textContent = "Foutieve inloggegevens of e-mail niet geverifieerd.";
    return;
  }
  // Check: email geverifieerd?
  if (!data.session) {
    document.getElementById('err-login-general').textContent = "Uw account is nog niet geactiveerd (controleer uw e-mail).";
    return;
  }
  window.location.href = "/mestplan.html";
};

// Session check: protect route mestplan.html
if (window.location.pathname.endsWith('mestplan.html')) {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) window.location.href = '/account.html';
  });
}

// Uitloggen
logoutBtn.onclick = async () => {
  await supabase.auth.signOut();
  window.location.href = "/account.html";
};
