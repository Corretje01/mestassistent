// File: core/domain/berekening.js
// Zelfde gedrag als je oude berekening.js, maar met paden die in je nieuwe structuur kloppen.

import { supabase } from '../../supabaseClient.js';
import { parcels as liveParcels } from '../../pages/plaatsingsruimte/plaatsingsruimte.js';

/* ------------------------------- 0) DOM & helpers ------------------------------- */
const resultsSection = document.getElementById('results-section');
const aInput = document.getElementById('res_n_dierlijk');
const bInput = document.getElementById('res_n_totaal');
const cInput = document.getElementById('res_p_totaal');

function setResultsVisible(show) {
  if (!resultsSection) return;
  resultsSection.style.display = show ? 'block' : 'none';
  if (!show) { if (aInput) aInput.value = ''; if (bInput) bInput.value = ''; if (cInput) cInput.value = ''; }
}
setResultsVisible(Array.isArray(liveParcels) && liveParcels.length > 0);

/* ------------------------------- 1) Normen laden ------------------------------- */
let stikstofnormen = null, normenLoaded = false, pendingRecalc = false;

fetch('./core/domain/data/stikstofnormen_tabel2.json', { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(json => { stikstofnormen = json; normenLoaded = true; if (pendingRecalc) recalcNow(); })
  .catch(err => { console.error('❌ Kan stikstofnormen niet laden:', err); stikstofnormen = {}; normenLoaded = true; });

/* ------------------------------- 2) Events uit kaart ------------------------------- */
window.addEventListener('parcels:changed', () => {
  const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
  setResultsVisible(hasParcels);
  if (!hasParcels) return;
  if (!normenLoaded) { pendingRecalc = true; return; }
  recalcNow();
});

window.addEventListener('rvo:imported', () => {
  const hasParcels = Array.isArray(liveParcels) && liveParcels.length > 0;
  if (hasParcels) setResultsVisible(true);
});

/* ------------------------------- 3) Init ------------------------------- */
if (Array.isArray(liveParcels) && liveParcels.length > 0) {
  if (normenLoaded) recalcNow(); else pendingRecalc = true;
}

/* ------------------------------- 4) Kern-berekening ------------------------------- */
function recalcNow() {
  pendingRecalc = false;
  const list = Array.isArray(liveParcels) ? liveParcels : [];
  if (list.length === 0) { setResultsVisible(false); return; }

  let totaalA = 0, totaalB = 0, totaalC = 0;

  for (const p of list) {
    const ha = toNum(p.ha) || 0;
    const grond = String(p.grondsoort || '').trim();
    const gewasCode = p.gewasCode;
    const gewasNaam = p.gewasNaam;
    const landgebruik = String(p.landgebruik || '').toLowerCase();

    const A_ha = 170; // EU-norm
    const entry = findNormEntry(stikstofnormen, gewasNaam, gewasCode);
    const B_ha = entry ? pickBnorm(entry, grond) : 0;
    const C_ha = landgebruik.includes('gras') ? 75 : 40;

    totaalA += A_ha * ha;
    totaalB += B_ha * ha;
    totaalC += C_ha * ha;
  }

  if (aInput) aInput.value = String(Math.round(totaalA));
  if (bInput) bInput.value = String(Math.round(totaalB));
  if (cInput) cInput.value = String(Math.round(totaalC));

  setResultsVisible(true);
  persistResults(totaalA, totaalB, totaalC).catch(() => {});
}

/* ------------------------------- 5) Normen & utils ------------------------------- */
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

function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/* ------------------------------- 6) Opslaan ------------------------------- */
async function persistResults(totaalA, totaalB, totaalC) {
  try {
    localStorage.setItem('mestplan_last_results', JSON.stringify({
      res_n_dierlijk: Math.round(totaalA),
      res_n_totaal:   Math.round(totaalB),
      res_p_totaal:   Math.round(totaalC),
      ts: Date.now()
    }));
  } catch {}

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

/* ------------------------------- 7) Stap 2 knop ------------------------------- */
(function initStep2Button(){
  const btnStep2 = document.getElementById('go-to-step2');
  if (!btnStep2) return;
  if (btnStep2.dataset._bound === '1') return;
  btnStep2.dataset._bound = '1';

  btnStep2.addEventListener('click', () => {
    if (!Array.isArray(liveParcels) || liveParcels.length === 0) {
      alert('Selecteer eerst minstens één perceel op de kaart.');
      return;
    }
    // Relatief (geen leading slash), net als op je andere pagina’s
    window.location.href = 'mestplan.html';
  });
})();
