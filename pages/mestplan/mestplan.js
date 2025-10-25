// pages/mestplan/mestplan.js
// Snel & robuust: instant fill (URL/LocalStorage) + DB overwrite + integer-only UI

import { supabase } from '../../supabaseClient.js';

// Domein (lowercase paden blijven)
import * as SM from '../../core/domain/statemanager.js';
import * as UI from '../../core/ui/uicontroller.js';
import * as LE from '../../core/domain/logicengine.js';
import * as VE from '../../core/domain/validationengine.js';

const StateManager     = SM.StateManager     || SM.default || SM;
const UIController     = UI.UIController     || UI.default || UI;
const LogicEngine      = LE.LogicEngine      || LE.default || LE;
const ValidationEngine = VE.ValidationEngine || VE.default || VE;

/* =========================================================================
   Helpers: auth, URL, LS, integers
=========================================================================== */
async function getAuthedUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.warn('getSession error:', error);
  return session?.user || null;
}

function parseABCFromQuery() {
  const p = new URLSearchParams(location.search);
  const A = Number(p.get('totaalA'));
  const B = Number(p.get('totaalB'));
  const C = Number(p.get('totaalC'));
  return {
    A: Number.isFinite(A) && A > 0 ? Math.round(A) : null,
    B: Number.isFinite(B) && B > 0 ? Math.round(B) : null,
    C: Number.isFinite(C) && C > 0 ? Math.round(C) : null
  };
}

function readABCFromLocalStorage() {
  try {
    const raw = localStorage.getItem('mestplan_last_results');
    if (!raw) return null;
    const j = JSON.parse(raw);
    const A = Number(j.res_n_dierlijk);
    const B = Number(j.res_n_totaal);
    const C = Number(j.res_p_totaal);
    if ([A,B,C].every(v => Number.isFinite(v) && v >= 0)) {
      return { A: Math.round(A), B: Math.round(B), C: Math.round(C) };
    }
  } catch {}
  return null;
}

function clampInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function ensureIntegerTextInputs(...els) {
  els.forEach(el => {
    if (!el) return;
    el.type = 'number';
    el.min = '0';
    el.step = '1';
    el.inputMode = 'numeric';
    el.addEventListener('input', () => { el.value = String(clampInt(el.value)); });
    el.addEventListener('change', () => { el.value = String(clampInt(el.value)); });
  });
}

function forceAllRangeSlidersToIntegers() {
  // Standaard + mestsliders krijgen step=1 en worden afgerond bij input
  const container = document.getElementById('sliders-container');
  if (!container) return;
  container.querySelectorAll('input[type="range"]').forEach(sl => {
    sl.step = '1';
    // zet bestaande waarde ook op heel getal
    sl.value = String(clampInt(sl.value));
    if (!sl.dataset._intBound) {
      sl.addEventListener('input', () => { sl.value = String(clampInt(sl.value)); });
      sl.addEventListener('change', () => { sl.value = String(clampInt(sl.value)); });
      sl.dataset._intBound = '1';
    }
  });
}

/* =========================================================================
   DB I/O (met kolom-mapper & logging)
=========================================================================== */

// Probeer meerdere veldnamen (voor oude/nieuwe schema's)
function pickNum(row, candidates, def = 0) {
  for (const k of candidates) {
    const v = row?.[k];
    if (v != null && Number.isFinite(Number(v))) return clampInt(v);
  }
  return def;
}

async function loadABCFromDB() {
  const user = await getAuthedUser();
  if (!user) {
    console.log('DB-read overgeslagen: geen gebruiker.');
    return null;
  }

  const { data, error, status } = await supabase
    .from('user_mestplan')
    .select('*')                 // alles ophalen om kolomnamen te zien
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('DB-read fout:', { status, message: error.message, code: error.code });
    return null;
  }
  if (!data) {
    console.log('DB-read: geen rij gevonden.');
    return null;
  }

  console.log('DB raw row:', data);

  // Map meerdere varianten → A,B,C
  const A = pickNum(data, ['res_n_dierlijk','n_dierlijk','resN_dierlijk','res_n_dierlijk_kg'], 0);
  const B = pickNum(data, ['res_n_totaal',  'n_totaal',  'resN_totaal',  'res_n_totaal_kg'  ], 0);
  const C = pickNum(data, ['res_p_totaal',  'p_totaal',  'resP_totaal',  'res_p_totaal_kg'  ], 0);

  return { A, B, C };
}

let saveTO = null;
async function debouncedSaveABC() {
  clearTimeout(saveTO);
  saveTO = setTimeout(async () => {
    const user = await getAuthedUser();
    if (!user) return;

    const a = clampInt(document.getElementById('prev_res_n_dierlijk')?.value);
    const b = clampInt(document.getElementById('prev_res_n_totaal')?.value);
    const c = clampInt(document.getElementById('prev_res_p_totaal')?.value);

    // Bewaar ook lokaal als fallback
    try {
      localStorage.setItem('mestplan_last_results', JSON.stringify({
        res_n_dierlijk: a, res_n_totaal: b, res_p_totaal: c, ts: Date.now()
      }));
    } catch {}

    const { error } = await supabase
      .from('user_mestplan')
      .upsert({
        user_id:        user.id,
        res_n_dierlijk: a,
        res_n_totaal:   b,
        res_p_totaal:   c,
        updated_at:     new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) console.error('DB-save error:', error);
  }, 250);
}

/* =========================================================================
   Data: mestsoorten
=========================================================================== */
async function loadMestsoorten() {
  const tryPaths = [
    './core/domain/data/mestsoorten.json',
    '/data/mestsoorten.json'
  ];
  for (const p of tryPaths) {
    try {
      const r = await fetch(p, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}
  }
  throw new Error('mestsoorten.json niet gevonden op bekende paden');
}

/* =========================================================================
   UI binding
=========================================================================== */
function bindABCInputsAndState({ A, B, C }) {
  const aEl = document.getElementById('prev_res_n_dierlijk');
  const bEl = document.getElementById('prev_res_n_totaal');
  const cEl = document.getElementById('prev_res_p_totaal');

  if (!aEl || !bEl || !cEl) {
    console.warn('Stap-2 inputs ontbreken in de DOM.');
    return;
  }

  ensureIntegerTextInputs(aEl, bEl, cEl);

  aEl.value = String(clampInt(A));
  bEl.value = String(clampInt(B));
  cEl.value = String(clampInt(C));

  StateManager.setGebruiksruimte(clampInt(A), clampInt(B), clampInt(C));

  const onChange = () => {
    const a = clampInt(aEl.value);
    const b = clampInt(bEl.value);
    const c = clampInt(cEl.value);

    // Actieve mest leegmaken (consistent met jouw gedrag)
    document.querySelectorAll('.mest-btn.active').forEach(btn => {
      btn.classList.remove('active');
      const key = `${btn.dataset.type}-${btn.dataset.animal}`;
      StateManager.removeMestType(key);
    });
    UIController.hideSlidersContainer();

    StateManager.setGebruiksruimte(a, b, c);
    UIController.updateSliders();
    forceAllRangeSlidersToIntegers();

    debouncedSaveABC();
  };

  [aEl, bEl, cEl].forEach(el => {
    el.addEventListener('input', onChange);
    el.addEventListener('change', onChange);
  });
}

function bindMestButtons(mestsoortenData) {
  const mapTypeKey = (type) =>
    ({ drijfmest: 'drijfmest', vastemest: 'vaste_mest', overig: 'overig' }[type]);

  document.querySelectorAll('.mest-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const type = btn.dataset.type;
      const animal = btn.dataset.animal;
      const key = `${type}-${animal}`;

      if (btn.classList.contains('active')) {
        const jsonType = mapTypeKey(type);
        const mestData = mestsoortenData?.[jsonType]?.[animal];
        if (!mestData) {
          btn.classList.remove('active');
          alert(`Geen specificaties gevonden voor: ${type} – ${animal}.`);
          return;
        }
        StateManager.addMestType(key, mestData);
        UIController.renderMestsoortSlider(
          key,
          `${type} ${animal}`,
          ValidationEngine.getMaxTonnage(key)
        );
        UIController.showSlidersContainer();
      } else {
        StateManager.removeMestType(key);
        document.getElementById(`group-${key}`)?.remove();
        if (Object.keys(StateManager.getActieveMest()).length === 0) {
          UIController.hideSlidersContainer();
        }
      }
      UIController.updateSliders();
      forceAllRangeSlidersToIntegers();
    });
    btn.dataset.bound = '1';
  });
}

function bindOptimizeButton() {
  const btn = document.getElementById('optimaliseer-btn');
  if (!btn || btn.dataset.bound) return;
  btn.addEventListener('click', async () => {
    try {
      await ensureGLPK();
      await LogicEngine.optimize?.();
      UIController.updateSliders();
      forceAllRangeSlidersToIntegers();
    } catch (e) {
      console.error('Optimalisatie mislukt:', e);
      alert('Optimalisatie lukt niet (GLPK niet beschikbaar?).');
    }
  });
  btn.dataset.bound = '1';
}

async function ensureGLPK() {
  let tries = 0;
  return new Promise((res, rej) => {
    const tick = () => {
      if (typeof window.glp_create_prob !== 'undefined') return res(window);
      if (++tries > 80) return rej(new Error('GLPK niet beschikbaar'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

/* =========================================================================
   Init
=========================================================================== */
async function initializeApp() {
  try {
    // 1) Instant seed: URL → LocalStorage → (nog even 0) —> direct de UI klaarzetten
    const q = parseABCFromQuery();
    const ls = readABCFromLocalStorage();
    const seed = q.A || q.B || q.C ? q : (ls || { A: 0, B: 0, C: 0 });

    bindABCInputsAndState(seed);

    // 2) Standaard sliders renderen (daarna direct integer-step forceren)
    UIController.initStandardSliders();
    UIController.updateSliders();
    forceAllRangeSlidersToIntegers();

    // 3) mestsoorten.json
    let mestsoortenData = {};
    try {
      mestsoortenData = await loadMestsoorten();
      StateManager.setMestTypes(mestsoortenData);
    } catch (e) {
      console.warn('mestsoorten.json niet gevonden; knoppen geven melding bij gebruik.', e);
    }
    bindMestButtons(mestsoortenData);
    bindOptimizeButton();

    // 4) Als URL waardes bevat en gebruiker ingelogd is → meteen DB upsert
    const user = await getAuthedUser();
    if (user && (q.A !== null || q.B !== null || q.C !== null)) {
      const a = clampInt(q.A ?? seed.A ?? 0);
      const b = clampInt(q.B ?? seed.B ?? 0);
      const c = clampInt(q.C ?? seed.C ?? 0);
      await supabase.from('user_mestplan').upsert({
        user_id: user.id,
        res_n_dierlijk: a,
        res_n_totaal:   b,
        res_p_totaal:   c,
        updated_at:     new Date().toISOString()
      }, { onConflict: 'user_id' });
      try {
        localStorage.setItem('mestplan_last_results', JSON.stringify({
          res_n_dierlijk: a, res_n_totaal: b, res_p_totaal: c, ts: Date.now()
        }));
      } catch {}
    }

    // 5) DB read (asynchroon) → UI/State overschrijven als DB > 0 of seed==0
    const db = await loadABCFromDB();
    if (db && (db.A + db.B + db.C > 0)) {
      const aEl = document.getElementById('prev_res_n_dierlijk');
      const bEl = document.getElementById('prev_res_n_totaal');
      const cEl = document.getElementById('prev_res_p_totaal');
      if (aEl && bEl && cEl) {
        aEl.value = String(db.A); bEl.value = String(db.B); cEl.value = String(db.C);
      }
      StateManager.setGebruiksruimte(db.A, db.B, db.C);
      UIController.updateSliders();
      forceAllRangeSlidersToIntegers();
      console.log('🔁 DB overwrite toegepast:', db);
    } else {
      console.log('ℹ️ DB leverde geen (zinvolle) waarden; seed blijft actief.', db);
    }

    // 6) Realtime sync op deze gebruiker
    if (user) {
      const channel = supabase
        .channel('mestplan-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_mestplan', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const nA = clampInt(payload.new?.res_n_dierlijk ?? 0);
            const nB = clampInt(payload.new?.res_n_totaal   ?? 0);
            const nC = clampInt(payload.new?.res_p_totaal   ?? 0);
            const aEl = document.getElementById('prev_res_n_dierlijk');
            const bEl = document.getElementById('prev_res_n_totaal');
            const cEl = document.getElementById('prev_res_p_totaal');
            if (!aEl || !bEl || !cEl) return;

            if ((clampInt(aEl.value) !== nA) || (clampInt(bEl.value) !== nB) || (clampInt(cEl.value) !== nC)) {
              aEl.value = String(nA); bEl.value = String(nB); cEl.value = String(nC);
              StateManager.setGebruiksruimte(nA, nB, nC);
              UIController.updateSliders();
              forceAllRangeSlidersToIntegers();
            }
          }
        )
        .subscribe();
      window.addEventListener('beforeunload', () => supabase.removeChannel(channel));
    }

    console.log('✅ Mestplan init voltooid (instant-fill + DB overwrite + integers)');
  } catch (err) {
    console.error('❌ Fout bij initialisatie:', err);
    alert('⚠️ Er ging iets mis bij initialisatie. Check de console (imports/DB).');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}
