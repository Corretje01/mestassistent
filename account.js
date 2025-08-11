// account.js — robuuste login/registratie/profiel + mobiele fixes
import { supabase } from './supabaseClient.js';

/* ========== helpers ========== */
const $ = (id) => document.getElementById(id);
const show = (el) => { if (el) el.style.display = 'block'; };
const hide = (el) => { if (el) el.style.display = 'none'; };

function setMsg(el, text, type = 'info') {
  if (!el) return;
  el.textContent = text || '';
  el.className = `message ${type}`;
}

function parseQuery() {
  const p = new URLSearchParams(location.search);
  return {
    signin:   p.get('signin') === '1',
    logout:   p.get('logout') === '1',
    register: p.get('register') === '1',
  };
}

async function getSessionSafe() {
  try {
    return (await supabase.auth.getSession()).data.session;
  } catch {
    return null;
  }
}

/* ========== secties/elementen ========== */
let authSect, profileSect, messageEl, profileMsg;
let loginForm, registerForm, profileForm;

/* ========== UI schakelen ========== */
async function syncUIBySession() {
  const session = await getSessionSafe();
  const isAuthed = !!session;

  if (isAuthed) {
    hide(authSect);
    show(profileSect);
    profileSect?.removeAttribute('hidden');
    await fillProfileFromUser();
  } else {
    show(authSect);
    show(loginForm);
    hide(registerForm);
    hide(profileSect);
    profileSect?.setAttribute('hidden', '');
  }
}

/* Profielvelden vullen vanuit user_metadata */
async function fillProfileFromUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const md = user.user_metadata || {};
  const mapping = [
    'voornaam', 'tussenvoegsel', 'achternaam', 'telefoon',
    'woonplaats', 'postcode', 'straat', 'huisnummer', 'huisnummer_toevoeging'
  ];
  mapping.forEach(key => {
    const el = $(`profile_${key}`);
    if (el) el.value = md[key] ?? '';
  });
  const emailEl = $('profile_email'); // optioneel veld
  if (emailEl) emailEl.value = user.email || '';
}

/* Na succesvolle login: directe harde redirect (voorkom terug naar auth) */
function gotoAfterLogin() {
  // Relatief pad werkt overal (root/subdir/Netlify)
  location.replace('stap1.html');
}

/* Na account delete: zeker weten uitgelogd + terug naar account.html */
async function robustSignOutAndBackToAccount() {
  try { await supabase.auth.signOut(); } catch {}
  try {
    Object.keys(localStorage).forEach(k => k.startsWith('sb-') && localStorage.removeItem(k));
    Object.keys(sessionStorage).forEach(k => k.startsWith('sb-') && sessionStorage.removeItem(k));
  } catch {}
  location.replace('account.html?logout=1');
}

/* ========== INIT ========== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    authSect    = $('auth-section');
    profileSect = $('profile-section');
    messageEl   = $('auth-message');
    profileMsg  = $('profile-message');

    loginForm    = $('loginForm');
    registerForm = $('registerForm');
    profileForm  = $('profileForm');

    // Progressive enhancement: startsituatie voor mobiel/slow JS
    authSect?.removeAttribute('hidden');
    profileSect?.setAttribute('hidden', '');

    // toggles login <-> register
    $('show-register')?.addEventListener('click', (e) => {
      e.preventDefault();
      hide(loginForm);
      show(registerForm);
    });
    $('show-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      show(loginForm);
      hide(registerForm);
    });

    // Query feedback (bv. ?signin=1 / ?logout=1 / ?register=1)
    const q = parseQuery();
    if (q.logout)  setMsg(messageEl, 'Je bent uitgelogd.', 'success');
    if (q.register) {
      hide(loginForm);
      show(registerForm);
      setMsg(messageEl, 'Maak je account aan om te starten.', 'info');
    }

    // UI sync bij laden
    await syncUIBySession();

    /* ===== LOGIN ===== */
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setMsg(messageEl, '');
        const btn = loginForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;

        const email = loginForm.email.value.trim();
        const password = loginForm.password.value;

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMsg(messageEl, error.message, 'error');
          if (btn) btn.disabled = false;
          return;
        }

        // ✅ Meteen navigeren; guard op /stap1(.html) beschermt als sessie nog niet klaar is
        const go = (href) => { location.replace(href); };
        go('stap1.html');

        // ✅ Watchdog (max ~2s): als we nog op account zitten, check sessie en navigeer alsnog.
        let tries = 0;
        const t = setInterval(async () => {
          tries++;
          if (!/account\.html$/i.test(location.pathname)) { clearInterval(t); return; }
          const s = await getSessionSafe();
          if (s) { clearInterval(t); go('stap1.html'); }
          if (tries > 10) { clearInterval(t); if (btn) btn.disabled = false; }
        }, 200);
      });
    }

    /* ===== REGISTRATIE ===== */
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setMsg(messageEl, '');
        const btn = registerForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;

        const fd = new FormData(registerForm);
        const formData = Object.fromEntries(fd);

        const { error } = await supabase.auth.signUp({
          email: formData.email,       // uit #email_reg (name="email")
          password: formData.password, // uit #password_reg (name="password")
          options: {
            data: {
              voornaam: formData.voornaam || '',
              tussenvoegsel: formData.tussenvoegsel || '',
              achternaam: formData.achternaam || '',
              telefoon: formData.telefoon || '',
              woonplaats: formData.woonplaats || '',
              postcode: formData.postcode || '',
              straat: formData.straat || '',
              huisnummer: formData.huisnummer || '',
              huisnummer_toevoeging: formData.huisnummer_toevoeging || ''
            }
          }
        });

        if (error) {
          setMsg(messageEl, error.message, 'error');
          if (btn) btn.disabled = false;
          return;
        }

        setMsg(messageEl, 'Registratie gelukt! Bevestig je e-mail om in te loggen.', 'success');
        show(loginForm);
        hide(registerForm);
        if (btn) btn.disabled = false;
      });
    }

    /* ===== PROFIEL OPSLAAN ===== */
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setMsg(profileMsg, '');
        const btn = profileForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;

        const updates = {
          voornaam: $('profile_voornaam')?.value ?? '',
          tussenvoegsel: $('profile_tussenvoegsel')?.value ?? '',
          achternaam: $('profile_achternaam')?.value ?? '',
          telefoon: $('profile_telefoon')?.value ?? '',
          woonplaats: $('profile_woonplaats')?.value ?? '',
          postcode: $('profile_postcode')?.value ?? '',
          straat: $('profile_straat')?.value ?? '',
          huisnummer: $('profile_huisnummer')?.value ?? '',
          huisnummer_toevoeging: $('profile_huisnummer_toevoeging')?.value ?? ''
        };

        const { error } = await supabase.auth.updateUser({ data: updates });
        if (error) {
          setMsg(profileMsg, error.message, 'error');
        } else {
          setMsg(profileMsg, 'Wijzigingen succesvol opgeslagen!', 'success');
        }
        if (btn) btn.disabled = false;
      });
    }

    /* ===== ACCOUNT VERWIJDEREN ===== */
    $('deleteAccount')?.addEventListener('click', async () => {
      if (!confirm('Weet je zeker dat je je account permanent wilt verwijderen?')) return;

      try {
        const { error } = await supabase.functions.invoke('delete-user');
        if (error) throw error;
        await robustSignOutAndBackToAccount();
      } catch (err) {
        alert('Fout bij verwijderen account: ' + (err?.message || err));
      }
    });

    /* ===== Auth-state volgen voor UI-consistentie ===== */
    supabase.auth.onAuthStateChange(async (evt) => {
      if (evt === 'SIGNED_IN') {
        gotoAfterLogin();
        return;
      }
      await syncUIBySession();
    });

    /* ===== BFCache fix: terugknop moet UI updaten ===== */
    window.addEventListener('pageshow', () => { syncUIBySession(); });

  } catch (err) {
    const msg = $('auth-message');
    if (msg) {
      msg.className = 'message error';
      msg.textContent = 'Er ging iets mis bij het laden. Vernieuw de pagina en probeer opnieuw.';
    }
    console.error('[account] init error:', err);
  }
});
