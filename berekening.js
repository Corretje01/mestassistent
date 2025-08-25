// berekening.js — automatische (her)berekening zonder knop
import { supabase } from './supabaseClient.js';
import { parcels as liveParcels } from './kaart.js'; // live binding; handig voor initiale staat

/* -------------------------------
   0) DOM refs + UI helpers
-------------------------------- */
const resultsSection = document.getElementById('results-section');
const aInput = document.getElementById('res_n_dierlijk');
const bInput = document.getElementById('res_n_totaal');
const cInput = document.getElementById('res_p_totaal');

// Verberg of toon de resultaten sectie
function setResultsVisible(show) {
  if (!resultsSection) return;
  resultsSection.style.display = show ? 'block' : 'none';
  if (!show) {
    if (aInput) aInput.value = '';
    if (bInput) bInput.value = '';
    if (cInput) cInput.value = '';
  }
}

// Bereken-knop/form zo veel mogelijk weghalen
(function hideLegacyForm() {
  const mestForm = document.getElementById('mestForm');
  if (!mestForm) return;
  const section = mestForm.closest('section');
  if (section) {
    // Hele sectie uit de DOM verwijderen
    section.remove();
  } else {
    // fallback: verberg in elk geval het form
    mestForm.style.display = 'none';
  }
})();

// Start: geen percelen → sectie verbergen
setResultsVisible(Array.isArray(liveParcels) && liveParcels.length > 0);

/* -------------------------------
   1) Stikstofnormen laden
-------------------------------- */
let stikstofnormen = null;
let normenLoaded = false;
let pendingRecalc = false;

fetch('/data/stikstofnormen_tabel2.json', { cache: 'no-store' })
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(json => {
    stikstofnormen = json;
    normenLoaded = true;
    if (pendingRecalc) recalcNow(); // voer eventuele uitgestelde berekening uit
  })
  .catch(err => {
    console.error('❌ Kan stikstofnormen niet laden:', err);
    stikstofnormen = {}; // blijf functioneel; B-norm valt dan terug op 0
    normenLoaded = true;
  });

/* -------------------------------
   2) Event: percelen gewijzigd
   (Komt uit kaart.js → CustomEvent 'parcels:changed')
-------------------------------- */
window.addEventListener('parcels:changed', () => {
  // Toon/verberg sectie obv aantal percelen
  const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
  setResultsVisible(hasParcels);

  // Herberekenen (of uitstellen totdat normen er zijn)
  if (!hasParcels) return; // niks te rekenen
  if (!normenLoaded) {
    pendingRecalc = true;
    return;
  }
  recalcNow();
});

/* -------------------------------
   2b) Kleine patch: ook reageren op rvo:imported
   (Excel-import kan parcels vullen vóór de eerste klik)
-------------------------------- */
window.addEventListener('rvo:imported', () => {
  const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
  if (hasParcels) setResultsVisible(true);
  // Rekenen blijft gedreven door 'parcels:changed' om de kernlogica ongemoeid te laten.
});

/* -------------------------------
   3) Init: als er al percelen zijn, meteen rekenen
-------------------------------- */
if (Array.isArray(liveParcels) && liveParcels.length > 0) {
  if (normenLoaded) recalcNow();
  else pendingRecalc = true;
}

/* -------------------------------
   4) Kern-berekening
-------------------------------- */
function recalcNow() {
  pendingRecalc = false;

  const list = Array.isArray(liveParcels) ? liveParcels : [];
  if (list.length === 0) {
    setResultsVisible(false);
    return;
  }

  let totaalA = 0; // N uit dierlijke mest (A)
  let totaalB = 0; // grondgebonden N (B)
  let totaalC = 0; // P uit mest (C)

  for (const p of list) {
    const ha         = toNum(p.ha) || 0;
    const grond      = String(p.grondsoort || '').trim();
    const gewasCode  = p.gewasCode;
    const gewasNaam  = p.gewasNaam;
    const landgebruik= String(p.landgebruik || '').toLowerCase();

    // A: vaste EU-norm per ha
    const A_ha = 170;

    // B: uit normen JSON
    const entry = findNormEntry(stikstofnormen, gewasNaam, gewasCode);
    const B_ha  = entry ? pickBnorm(entry, grond) : 0;

    // C: simpele regel — grasland 75 kg P/ha, anders 40 kg P/ha
    const C_ha = landgebruik.includes('gras') ? 75 : 40;

    totaalA += A_ha * ha;
    totaalB += B_ha * ha;
    totaalC += C_ha * ha;
  }

  // UI bijwerken (op hele kg)
  if (aInput) aInput.value = String(Math.round(totaalA));
  if (bInput) bInput.value = String(Math.round(totaalB));
  if (cInput) cInput.value = String(Math.round(totaalC));

  setResultsVisible(true);

  // Opslaan (best effort)
  persistResults(totaalA, totaalB, totaalC).catch(() => {});
}

/* -------------------------------
   5) Hulpfuncties: normen & utils
-------------------------------- */

// Zoek een normenrecord obv gewasNaam of (fallback) gewasCode in 'Gewascodes'
function findNormEntry(normDb, gewasNaam, gewasCode) {
  if (!normDb) return null;

  // 1) Directe key op gewasNaam (exacte match)
  if (gewasNaam && normDb[gewasNaam]) return normDb[gewasNaam];

  // 2) Case-insensitive poging op gewasNaam
  if (gewasNaam) {
    const key = Object.keys(normDb).find(
      k => k.toLowerCase() === String(gewasNaam).toLowerCase()
    );
    if (key) return normDb[key];
  }

  // 3) Zoeken via gewasCode in de array 'Gewascodes'
  if (gewasCode != null) {
    const codeStr = String(gewasCode);
    for (const obj of Object.values(normDb)) {
      const codes = obj?.Gewascodes;
      if (Array.isArray(codes) && codes.map(String).includes(codeStr)) {
        return obj;
      }
    }
  }

  return null;
}

// B-norm uit entry halen, met slimme grondsoort-fallbacks
function pickBnorm(entry, grond) {
  if (!entry || typeof entry !== 'object') return 0;

  // Normaliseer grond
  const g = normalizeGrond(grond);

  // 1) directe match
  if (entry[g] != null) return toNum(entry[g]) || 0;

  // 2) veelgebruikte alias/fallbacks
  const fallbacks = {
    zand: [
      'Noordelijk, westelijk en centraal zand',
      'Zand (N/W/C)',
      'Zand'
    ],
    klei: ['Klei'],
    veen: ['Veen'],
    löss: ['Löss', 'Löss/Leem', 'Löss en leem']
  };

  const tries = fallbacks[g] || [];
  for (const k of tries) {
    if (entry[k] != null) return toNum(entry[k]) || 0;
  }

  // 3) laatste redmiddel: pak de eerste numerieke waarde in de entry
  for (const v of Object.values(entry)) {
    const n = toNum(v);
    if (Number.isFinite(n)) return n;
  }

  return 0;
}

function normalizeGrond(s) {
  const t = String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  if (t.includes('zand')) return 'zand';
  if (t.includes('klei')) return 'klei';
  if (t.includes('veen')) return 'veen';
  if (t.includes('loss') || t.includes('lö') || t.includes('loess')) return 'löss';
  // default-keuze (conservatief): zand
  return 'zand';
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------
   6) Opslaan (Supabase + lokaal)
-------------------------------- */
async function persistResults(totaalA, totaalB, totaalC) {
  // lokaal bewaren (voor stap 2 fallback)
  try {
    localStorage.setItem('mestplan_last_results', JSON.stringify({
      res_n_dierlijk: Math.round(totaalA),
      res_n_totaal:   Math.round(totaalB),
      res_p_totaal:   Math.round(totaalC),
      ts: Date.now()
    }));
  } catch {}

  // Supabase (indien ingelogd)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('user_mestplan')
      .upsert({
        user_id:        user.id,
        res_n_dierlijk: Math.round(totaalA),
        res_n_totaal:   Math.round(totaalB),
        res_p_totaal:   Math.round(totaalC),
        updated_at:     new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) console.error('upsert mestplan error:', error);
  } catch (e) {
    console.warn('Supabase opslaan overgeslagen:', e?.message || e);
  }
}

/* -------------------------------
   7) Stap 2 — navigatie
-------------------------------- */
(function initStep2Button(){
  const btnStep2 = document.getElementById('go-to-step2');
  if (!btnStep2) return;
  if (btnStep2.dataset._bound === '1') return; // dubbele binding voorkomen
  btnStep2.dataset._bound = '1';

  btnStep2.addEventListener('click', () => {
    // Optioneel: blokkeer als er (nog) geen percelen zijn
    if (!Array.isArray(liveParcels) || liveParcels.length === 0) {
      alert('Selecteer eerst minstens één perceel op de kaart.');
      return;
    }
    window.location.href = '/mestplan.html';
  });
})();
