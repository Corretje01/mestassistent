// pages/mestplan/mestplan.js
// ABC integer-only + robuuste bronkeuze (URL → LS → DB) + late auth retry + realtime sync

import { supabase } from '../../supabaseClient.js';

// === Module imports (lowercase paden) + shims voor default/named exports ===
import * as SM from '../../core/domain/statemanager.js';
import * as UI from '../../core/ui/uicontroller.js';
import * as LE from '../../core/domain/logicengine.js';
import * as VE from '../../core/domain/validationengine.js';

const StateManager     = SM.StateManager     || SM.default || SM;
const UIController     = UI.UIController     || UI.default || UI;
const LogicEngine      = LE.LogicEngine      || LE.default || LE;
const ValidationEngine = VE.ValidationEngine || VE.default || VE;

/* ===========================
   Kleine helpers
=========================== */
const roundInt = (v) => Number.isFinite(v) ? Math.round(v) : 0;
const toPosInt = (v) => Math.max(0, roundInt(Number(v)));

function setABCInputs({ A, B, C }) {
  const aEl = document.getElementById('prev_res_n_dierlijk');
  const bEl = document.getElementById('prev_res_n_totaal');
  const cEl = document.getElementById('prev_res_p_totaal');
  if (!aEl || !bEl || !cEl) return false;
  aEl.value = toPosInt(A);
  bEl.value = toPosInt(B);
  cEl.value = toPosInt(C);
  return true;
}

function getABCFromInputs() {
  return {
    A: toPosInt(document.getElementById('prev_res_n_dierlijk')?.value),
    B: toPosInt(document.getElementById('prev_res_n_totaal')?.value),
    C: toPosInt(document.getElementById('prev_res_p_totaal')?.value),
  };
}

function saveABCToLocalStorage({ A, B, C }) {
  try {
    localStorage.setItem('mestplan_last_results', JSON.stringify({
      res_n_dierlijk: toPosInt(A),
      res_n_totaal:   toPosInt(B),
      res_p_totaal:   toPosInt(C),
      ts: Date.now()
    }));
  } catch {}
}

function loadABCFromLocalStorage() {
  try {
    const raw = localStorage.getItem('mestplan_last_results');
    if (!raw) return null;
    const j = JSON.parse(raw);
    return {
      A: toPosInt(j?.res_n_dierlijk),
      B: toPosInt(j?.res_n_totaal),
      C: toPosInt(j?.res_p_totaal),
    };
  } catch { return null; }
}

function getABCFromQuery() {
  const p = new URLSearchParams(location.search);
  const A = Number(p.get('totaalA'));
  const B = Number(p.get('totaalB'));
  const C = Number(p.get('totaalC'));
  const out = {
    A: Number.isFinite(A) ? roundInt(A) : null,
    B: Number.isFinite(B) ? roundInt(B) : null,
    C: Number.isFinite(C) ? roundInt(C) : null
  };
  // Alleen geldig als tenminste één aanwezig is
  if (out.A === null && out.B === null && out.C === null) return null;
  return { A: out.A ?? 0, B: out.B ?? 0, C: out.C ?? 0 };
}

async function getSessionUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.warn('getSession error:', error);
  return session?.user || null;
}

async function loadABCFromDB() {
  const user = await getSessionUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_mestplan')
    .select('res_n_dierlijk, res_n_totaal, res_p_totaal')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('loadABCFromDB error:', error);
    return null;
  }
  if (!data) return null;

  return {
    A: toPosInt(data.res_n_dierlijk),
    B: toPosInt(data.res_n_totaal),
    C: toPosInt(data.res_p_totaal),
  };
}

let saveTimeout;
async function debouncedSaveABC() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const user = await getSessionUser();
    const { A, B, C } = getABCFromInputs();
    saveABCToLocalStorage({ A, B, C });
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
    if (error) console.error('Save error:', error);
  }, 300);
}

/* ===========================
   GLPK: check vlak vóór optimaliseren
=========================== */
async function ensureGLPK() {
  if (typeof window.glp_create_prob !== 'undefined') return true;
  let attempts = 0;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (typeof window.glp_create_prob !== 'undefined') resolve(true);
      else if (attempts++ >= 50) reject(new Error('GLPK niet beschikbaar'));
      else setTimeout(tick, 80);
    };
    tick();
  });
}

/* ===========================
   mestsoorten.json (met fallback pad)
=========================== */
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

/* ===========================
   UI: binds
=========================== */
function bindABCInputsAndState({ A, B, C }) {
  // Zet inputs & state
  setABCInputs({ A, B, C });
  StateManager.setGebruiksruimte(toPosInt(A), toPosInt(B), toPosInt(C));

  // Zorg dat inputs integer-only blijven
  const aEl = document.getElementById('prev_res_n_dierlijk');
  const bEl = document.getElementById('prev_res_n_totaal');
  const cEl = document.getElementById('prev_res_p_totaal');

  const onChange = () => {
    // Forceer hele getallen in het veld zelf
    aEl.value = toPosInt(aEl.value);
    bEl.value = toPosInt(bEl.value);
    cEl.value = toPosInt(cEl.value);

    const a = toPosInt(aEl.value);
    const b = toPosInt(bEl.value);
    const c = toPosInt(cEl.value);

    // Reset actieve mestselecties zodat constraints niet blijven hangen
    document.querySelectorAll('.mest-btn.active').forEach(btn => {
      btn.classList.remove('active');
      const key = `${btn.dataset.type}-${btn.dataset.animal}`;
      StateManager.removeMestType(key);
    });
    UIController.hideSlidersContainer();

    StateManager.setGebruiksruimte(a, b, c);
    saveABCToLocalStorage({ A: a, B: b, C: c });
    UIController.updateSliders();

    debouncedSaveABC();
  };

  [aEl, bEl, cEl].forEach(el => {
    el.setAttribute('inputmode', 'numeric');
    el.step = '1';
    el.min = '0';
    el.addEventListener('input', onChange);
    el.addEventListener('blur', onChange);
  });
}

function bindMestButtons(mestsoortenData) {
  const mapTypeKey = (type) => ({ drijfmest: 'drijfmest', vastemest: 'vaste_mest', overig: 'overig' }[type]);

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
          alert(`Geen specificaties gevonden voor: ${type} – ${animal}. Controleer core/domain/data/mestsoorten.json of /data/mestsoorten.json`);
          return;
        }
        StateManager.addMestType(key, mestData);
        UIController.renderMestsoortSlider(key, `${type} ${animal}`, ValidationEngine.getMaxTonnage(key));
        UIController.showSlidersContainer();
      } else {
        StateManager.removeMestType(key);
        document.getElementById(`group-${key}`)?.remove();
        if (Object.keys(StateManager.getActieveMest()).length === 0) {
          UIController.hideSlidersContainer();
        }
      }
      UIController.updateSliders();
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
      // In jouw huidige logicengine zit de optimalisatie verspreid; roep hier de publieke API aan
      if (typeof LogicEngine.optimize === 'function') {
        await LogicEngine.optimize();
      } else {
        // fallback: sliders gewoon updaten (geen hard error)
        console.warn('LogicEngine.optimize() ontbreekt; alleen sliders herberekend.');
      }
      UIController.updateSliders();
    } catch (e) {
      console.error('Optimalisatie mislukt:', e);
      alert('Optimalisatie lukt niet (GLPK niet beschikbaar?).');
    }
  });
  btn.dataset.bound = '1';
}

/* ===========================
   Init (bronkeuze + UI setup)
=========================== */
async function initializeApp() {
  try {
    // 0) Standaard sliders (UIController is al integer-ready aan jouw kant)
    UIController.initStandardSliders();
    UIController.updateSliders();

    // 1) ABC-bron kiezen in volgorde: URL → LocalStorage → DB → 0
    let source = 'default';
    let ABC = { A: 0, B: 0, C: 0 };

    const fromURL = getABCFromQuery();
    const fromLS  = loadABCFromLocalStorage();

    if (fromURL) {
      ABC = fromURL; source = 'url';
      // Schrijf meteen weg (LS + DB) zodat mestplan.html direct de bron vastlegt
      saveABCToLocalStorage(ABC);
      const user = await getSessionUser();
      if (user) {
        await supabase.from('user_mestplan').upsert({
          user_id:        user.id,
          res_n_dierlijk: toPosInt(ABC.A),
          res_n_totaal:   toPosInt(ABC.B),
          res_p_totaal:   toPosInt(ABC.C),
          updated_at:     new Date().toISOString()
        }, { onConflict: 'user_id' });
      }
    } else if (fromLS && (fromLS.A || fromLS.B || fromLS.C)) {
      ABC = fromLS; source = 'localstorage';
    } else {
      const fromDB = await loadABCFromDB(); // keert null terug als geen sessie/rij
      if (fromDB) { ABC = fromDB; source = 'database'; }
    }

    bindABCInputsAndState(ABC);
    UIController.updateSliders();
    console.log(`✅ Mestplan init voltooid (bron: ${source})`);

    // 2) mestsoorten.json (met fallback pad) + knoppen
    let mestsoortenData = {};
    try {
      mestsoortenData = await loadMestsoorten();
      StateManager.setMestTypes(mestsoortenData);
    } catch (e) {
      console.warn('mestsoorten.json niet gevonden; knoppen geven melding bij gebruik.', e);
    }
    bindMestButtons(mestsoortenData);
    bindOptimizeButton();

    // 3) Realtime sync van A/B/C (als ingelogd)
    const user = await getSessionUser();
    if (user) {
      const channel = supabase
        .channel('mestplan-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_mestplan', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const nA = toPosInt(payload.new?.res_n_dierlijk);
            const nB = toPosInt(payload.new?.res_n_totaal);
            const nC = toPosInt(payload.new?.res_p_totaal);

            const cur = getABCFromInputs();
            if (cur.A !== nA || cur.B !== nB || cur.C !== nC) {
              setABCInputs({ A: nA, B: nB, C: nC });
              StateManager.setGebruiksruimte(nA, nB, nC);
              saveABCToLocalStorage({ A: nA, B: nB, C: nC });
              UIController.updateSliders();
              console.log('🔄 ABC realtime sync (DB → UI).');
            }
          }
        )
        .subscribe();

      window.addEventListener('beforeunload', () => supabase.removeChannel(channel));
    }

    // 4) Auth state change → alsnog DB lezen (lichtgewicht, geen blocking)
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) return;
      try {
        const dbVal = await loadABCFromDB();
        if (!dbVal) return;
        const cur = getABCFromInputs();
        // Alleen bijwerken als het echt wat toevoegt
        if (cur.A !== dbVal.A || cur.B !== dbVal.B || cur.C !== dbVal.C) {
          setABCInputs(dbVal);
          StateManager.setGebruiksruimte(dbVal.A, dbVal.B, dbVal.C);
          saveABCToLocalStorage(dbVal);
          UIController.updateSliders();
          console.log('🔄 ABC bijgewerkt na late auth (DB → UI).');
        }
      } catch (e) {
        console.warn('auth state change → loadABCFromDB fout:', e);
      }
    });

    // 5) Late retry (2s) alleen als alles nog 0 is (vangt trage sessie op; UI blijft direct bruikbaar)
    setTimeout(async () => {
      const cur = getABCFromInputs();
      if (cur.A === 0 && cur.B === 0 && cur.C === 0) {
        const dbVal = await loadABCFromDB();
        if (dbVal && (dbVal.A || dbVal.B || dbVal.C)) {
          setABCInputs(dbVal);
          StateManager.setGebruiksruimte(dbVal.A, dbVal.B, dbVal.C);
          saveABCToLocalStorage(dbVal);
          UIController.updateSliders();
          console.log('⏱️ Late DB-retry gevuld.');
        }
      }
    }, 2000);

  } catch (err) {
    console.error('❌ Fout bij initialisatie:', err);
    alert('⚠️ Er ging iets mis bij initialisatie. Open de console (imports/paden).');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}
