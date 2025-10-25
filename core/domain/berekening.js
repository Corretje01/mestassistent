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

    // A: EU-norm dierlijke N (kg/ha)
    const A_ha = 170;

    // B: grondgebonden N uit normen-tabel via gewas/grond
    const entry = findNormEntry(stikstofnormen, gewasNaam, gewasCode);
    const B_ha = entry ? pickBnorm(entry, grond) : 0;

    // C: fosfaat P (kg/ha) — eenvoudige benadering
    const C_ha = landgebruik.includes('gras') ? 75 : 40;

    totaalA += A_ha * ha;
    totaalB += B_ha * ha;
    totaalC += C_ha * ha;
  }

  // Integers afdwingen (hele kg)
  const A = Math.round(totaalA);
  const B = Math.round(totaalB);
  const C = Math.round(totaalC);

  if (aInput) aInput.value = String(A);
  if (bInput) bInput.value = String(B);
  if (cInput) cInput.value = String(C);

  setTotals(A, B, C);
  setResultsVisible(true);
  setStep2Enabled(true);

  // Start save (debounced), maar we flushen vóór navigatie
  persistResults(A, B, C, { immediate: false }).catch(() => {});
}

/* ------------------------------- 6) Normen & utils ------------------------------- */
function findNormEntry(normDb, gewasNaam, gewasCode) {
  if (!normDb) return null;

  if (gewasNaam && normDb[gewasNaam]) return normDb[gewasNaam];

  if (gewasNaam) {
    const key = Object.keys(normDb).find(k => k.toLowerCase() === String(gewasNaam).toLowerCase());
    if (key) return normDb[key];
  }

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

  const fallbacks = {
    zand: ['Noordelijk, westelijk en centraal zand', 'Zand (N/W/C)', 'Zand'],
    klei: ['Klei'],
    veen: ['Veen'],
    löss: ['Löss', 'Löss/Leem', 'Löss en leem']
  };
  for (const k of (fallbacks[g] || [])) {
    if (entry[k] != null) return toNum(entry[k]) || 0;
  }

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

/* ------------------------------- 7) Opslaan (debounce + flush) ------------------------------- */
let saveTimer = null;
let lastPayload = null;
let pendingSavePromise = null;

async function persistResults(A, B, C, { immediate = false } = {}) {
  // LocalStorage (snelle fallback)
  try {
    localStorage.setItem('mestplan_last_results', JSON.stringify({
      res_n_dierlijk: A,
      res_n_totaal:   B,
      res_p_totaal:   C,
      ts: Date.now()
    }));
    console.log('💾 LS save OK:', { A, B, C });
  } catch (e) {
    console.warn('LS save failed:', e);
  }

  lastPayload = { A, B, C };

  // Immediate = nu wegschrijven; anders debounce
  if (immediate) {
    clearTimeout(saveTimer);
    pendingSavePromise = doUpsert(lastPayload);
    await pendingSavePromise;
    pendingSavePromise = null;
    return;
  }

  clearTimeout(saveTimer);
  pendingSavePromise = null;
  saveTimer = setTimeout(async () => {
    pendingSavePromise = doUpsert(lastPayload);
    try { await pendingSavePromise; } finally { pendingSavePromise = null; }
  }, 250);
}

async function doUpsert({ A, B, C }) {
  // wacht op sessie (max 3 pogingen, 300ms tussenpauze)
  let user = null;
  for (let i = 0; i < 3 && !user; i++) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      user = session?.user || null;
    } catch {}
    if (!user) await new Promise(r => setTimeout(r, 300));
  }
  if (!user) {
    console.warn('⚠️ Supabase: geen user tijdens persist; DB-save overgeslagen.', { A, B, C });
    return;
  }

  const row = {
    user_id:        user.id,
    res_n_dierlijk: Math.round(A),
    res_n_totaal:   Math.round(B),
    res_p_totaal:   Math.round(C),
    updated_at:     new Date().toISOString()
  };

  const { error } = await supabase
    .from('user_mestplan')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    console.error('❌ Supabase upsert error:', error, row);
  } else {
    console.log('✅ Supabase upsert OK:', row);
  }
}

// Publieke flush, zodat we vóór navigatie altijd opslaan
async function flushPersistNow() {
  clearTimeout(saveTimer);
  if (pendingSavePromise) {
    await pendingSavePromise;
  } else if (lastPayload) {
    await doUpsert(lastPayload);
  }
}

/* ------------------------------- 8) “Ga naar stap 2” ------------------------------- */
(function initStep2Button(){
  if (!btnStep2) return;
  if (btnStep2.dataset._bound === '1') return;
  btnStep2.dataset._bound = '1';

  btnStep2.addEventListener('click', async () => {
    const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
    if (!hasParcels) {
      alert('Selecteer eerst minstens één perceel op de kaart.');
      return;
    }

    // 1) Flush DB-save vóór navigatie (belangrijk!)
    try {
      await flushPersistNow();
    } catch (e) {
      console.warn('Flush persist faalde (we gaan door met URL-fallback):', e);
    }

    // 2) Zet URL-query als extra vangnet naast DB-opslag
    const q = new URLSearchParams({
      totaalA: String(currentTotals.A || 0),
      totaalB: String(currentTotals.B || 0),
      totaalC: String(currentTotals.C || 0)
    });

    // 3) Relatief pad (geen leading slash), net als elders
    window.location.href = `mestplan.html?${q.toString()}`;
  });
})();
