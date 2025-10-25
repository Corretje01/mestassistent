// File: core/domain/berekening.js
// Berekent A/B/C op basis van gekoppelde percelen, toont in stap 1,
// slaat op in Supabase, en navigeert naar stap 2 met querystring fallback.

import { supabase } from '../../supabaseClient.js';
import { parcels as liveParcels } from '../../pages/plaatsingsruimte/plaatsingsruimte.js';

/* ------------------------------- 0) DOM & helpers ------------------------------- */
const resultsSection = document.getElementById('results-section');
const aInput = document.getElementById('res_n_dierlijk');
const bInput = document.getElementById('res_n_totaal');
const cInput = document.getElementById('res_p_totaal');
const btnStep2 = document.getElementById('go-to-step2');

function setResultsVisible(show) {
  if (!resultsSection) return;
  resultsSection.style.display = show ? 'block' : 'none';
  if (!show) {
    if (aInput) aInput.value = '';
    if (bInput) bInput.value = '';
    if (cInput) cInput.value = '';
  }
}

function setStep2Enabled(enabled) {
  if (!btnStep2) return;
  btnStep2.disabled = !enabled;
  btnStep2.setAttribute('aria-disabled', String(!enabled));
}

function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/* ------------------------------- 1) Normen laden ------------------------------- */
let stikstofnormen = null;
let normenLoaded = false;
let pendingRecalc = false;

// Pad in je nieuwe structuur
fetch('./core/domain/data/stikstofnormen_tabel2.json', { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(json => { stikstofnormen = json; normenLoaded = true; if (pendingRecalc) recalcNow(); })
  .catch(err => { console.error('❌ Kan stikstofnormen niet laden:', err); stikstofnormen = {}; normenLoaded = true; });

/* ------------------------------- 2) Huidige totals (A/B/C) ------------------------------- */
let currentTotals = { A: 0, B: 0, C: 0 };
function setTotals(A, B, C) {
  currentTotals.A = Math.round(A);
  currentTotals.B = Math.round(B);
  currentTotals.C = Math.round(C);
}

/* ------------------------------- 3) Events uit kaart ------------------------------- */
window.addEventListener('parcels:changed', () => {
  const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
  setResultsVisible(hasParcels);
  setStep2Enabled(hasParcels);
  if (!hasParcels) return;
  if (!normenLoaded) { pendingRecalc = true; return; }
  recalcNow();
});

window.addEventListener('rvo:imported', () => {
  const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
  setResultsVisible(hasParcels);
  setStep2Enabled(hasParcels);
});

/* ------------------------------- 4) Init bij load ------------------------------- */
(function initOnLoad() {
  const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
  setResultsVisible(hasParcels);
  setStep2Enabled(hasParcels);
  if (!hasParcels) return;
  if (normenLoaded) recalcNow();
  else pendingRecalc = true;
})();

/* ------------------------------- 5) Kern-berekening ------------------------------- */
function recalcNow() {
  pendingRecalc = false;
  const list = Array.isArray(liveParcels) ? liveParcels : [];
  if (list.length === 0) { setResultsVisible(false); setStep2Enabled(false); return; }

  let totaalA = 0, totaalB = 0, totaalC = 0;

  for (const p of list) {
    const ha = toNum(p.ha) || 0;
    const grond = String(p.grondsoort || '').trim();
    const gewasCode = p.gewasCode;
    const gewasNaam = p.gewasNaam;
    const landgebruik = String(p.landgebruik || '').toLowerCase();

    // A: EU-norm dierlijke N
    const A_ha = 170;

    // B: grondgebonden N uit normen-tabel via gewas/grond
    const entry = findNormEntry(stikstofnormen, gewasNaam, gewasCode);
    const B_ha = entry ? pickBnorm(entry, grond) : 0;

    // C: fosfaat P: simpele bandbreedte (gras/bouwland)
    const C_ha = landgebruik.includes('gras') ? 75 : 40;

    totaalA += A_ha * ha;
    totaalB += B_ha * ha;
    totaalC += C_ha * ha;
  }

  // Rond af en toon
  const A = Math.round(totaalA);
  const B = Math.round(totaalB);
  const C = Math.round(totaalC);

  if (aInput) aInput.value = String(A);
  if (bInput) bInput.value = String(B);
  if (cInput) cInput.value = String(C);

  setTotals(A, B, C);
  setResultsVisible(true);
  setStep2Enabled(true);

  persistResults(A, B, C).catch(() => {});
}

/* ------------------------------- 6) Normen & utils ------------------------------- */
function findNormEntry(normDb, gewasNaam, gewasCode) {
  if (!normDb) return null;

  // 1) Exacte naam-key
  if (gewasNaam && normDb[gewasNaam]) return normDb[gewasNaam];

  // 2) Case-insensitive exacte match
  if (gewasNaam) {
    const key = Object.keys(normDb).find(k => k.toLowerCase() === String(gewasNaam).toLowerCase());
    if (key) return normDb[key];
  }

  // 3) Code-lookup
  if (gewasCode != null) {
    const codeStr = String(gewasCode);
    for (const obj of Object.values(normDb)) {
      const codes = obj?.Gewascodes;
      if (Array.isArray(codes) && codes.map(String).includes(codeStr)) return obj;
    }
  }
  return null;
}

function pickBnorm(entry, grond) {
  if (!entry || typeof entry !== 'object') return 0;

  const g = normalizeGrond(grond);
  if (entry[g] != null) return toNum(entry[g]) || 0;

  // Fallbacks voor variantenamen
  const fallbacks = {
    zand: ['Noordelijk, westelijk en centraal zand', 'Zand (N/W/C)', 'Zand'],
    klei: ['Klei'],
    veen: ['Veen'],
    löss: ['Löss', 'Löss/Leem', 'Löss en leem']
  };
  for (const k of (fallbacks[g] || [])) {
    if (entry[k] != null) return toNum(entry[k]) || 0;
  }

  // Allerlaatste fallback: eerste numerieke waarde uit entry
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
  return 'zand';
}

/* ------------------------------- 7) Opslaan ------------------------------- */
// NB: je oude code deed dit ook; laat staan — mestplan.js leest het terug.
let saveTimer;
async function persistResults(A, B, C) {
  // LocalStorage (snelle fallback)
  try {
    localStorage.setItem('mestplan_last_results', JSON.stringify({
      res_n_dierlijk: A,
      res_n_totaal:   B,
      res_p_totaal:   C,
      ts: Date.now()
    }));
  } catch {}

  // Debounced upsert naar Supabase
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('user_mestplan')
        .upsert({
          user_id:        user.id,
          res_n_dierlijk: A,
          res_n_totaal:   B,
          res_p_totaal:   C,
          updated_at:     new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (error) console.error('upsert mestplan error:', error);
    } catch (e) {
      console.warn('Supabase opslaan overgeslagen:', e?.message || e);
    }
  }, 250);
}

/* ------------------------------- 8) “Ga naar stap 2” ------------------------------- */
(function initStep2Button(){
  if (!btnStep2) return;
  if (btnStep2.dataset._bound === '1') return;
  btnStep2.dataset._bound = '1';

  btnStep2.addEventListener('click', () => {
    const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
    if (!hasParcels) {
      alert('Selecteer eerst minstens één perceel op de kaart.');
      return;
    }

    // Zet URL-query als extra vangnet naast DB-opslag
    const q = new URLSearchParams({
      totaalA: String(currentTotals.A || 0),
      totaalB: String(currentTotals.B || 0),
      totaalC: String(currentTotals.C || 0)
    });

    // Relatief pad (geen leading slash), net als elders
    window.location.href = `mestplan.html?${q.toString()}`;
  });
})();
