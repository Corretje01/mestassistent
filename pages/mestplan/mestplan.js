// pages/mestplan/mestplan.js
// ABC integer-only + bronkeuze (URL → LS → DB) + stricte auth + directe & late DB-retry

import { supabase } from '../../supabaseClient.js';

// === Modules ===
import * as SM from '../../core/domain/statemanager.js';
import * as UI from '../../core/ui/uicontroller.js';
import * as LE from '../../core/domain/logicengine.js';
import * as VE from '../../core/domain/validationengine.js';

const StateManager     = SM.StateManager     || SM.default || SM;
const UIController     = UI.UIController     || UI.default || UI;
const LogicEngine      = LE.LogicEngine      || LE.default || LE;
const ValidationEngine = VE.ValidationEngine || VE.default || VE;

/* ---------- helpers ---------- */
const roundInt = (v) => Number.isFinite(v) ? Math.round(v) : 0;
const toPosInt = (v) => Math.max(0, roundInt(Number(v)));

function setABCInputs({ A, B, C }) {
  const aEl = document.getElementById('prev_res_n_dierlijk');
  const bEl = document.getElementById('prev_res_n_totaal');
  const cEl = document.getElementById('prev_res_p_totaal');
  if (!aEl || !bEl || !cEl) return false;
  aEl.value = toPosInt(A); bEl.value = toPosInt(B); cEl.value = toPosInt(C);
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
    return { A: toPosInt(j?.res_n_dierlijk), B: toPosInt(j?.res_n_totaal), C: toPosInt(j?.res_p_totaal) };
  } catch { return null; }
}
function getABCFromQuery() {
  const p = new URLSearchParams(location.search);
  const A = Number(p.get('totaalA')), B = Number(p.get('totaalB')), C = Number(p.get('totaalC'));
  const out = {
    A: Number.isFinite(A) ? roundInt(A) : null,
    B: Number.isFinite(B) ? roundInt(B) : null,
    C: Number.isFinite(C) ? roundInt(C) : null
  };
  if (out.A === null && out.B === null && out.C === null) return null;
  return { A: out.A ?? 0, B: out.B ?? 0, C: out.C ?? 0 };
}

/* ---------- auth helpers (strikt) ---------- */
async function getAuthedUser() {
  // 1) snel pad (geen netwerk)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;

  // 2) forceer netwerk-check (betrouwbaar bij trage sessie)
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.warn('auth.getUser() error:', error);
    return null;
  }
  return data?.user ?? null;
}

/* ---------- DB ---------- */
async function loadABCFromDB() {
  const user = await getAuthedUser();
  if (!user) { console.log('DB-read overgeslagen: geen gebruiker.'); return null; }

  const { data, error, status } = await supabase
    .from('user_mestplan')
    .select('res_n_dierlijk, res_n_totaal, res_p_totaal')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('DB-read fout:', { status, message: error.message, code: error.code });
    return null;
  }
  if (!data) { console.log('DB-read: geen rij gevonden voor user.'); return null; }

  const out = {
    A: toPosInt(data.res_n_dierlijk),
    B: toPosInt(data.res_n_totaal),
    C: toPosInt(data.res_p_totaal),
  };
  console.log('DB-read OK:', out);
  return out;
}

let saveTimeout;
async function debouncedSaveABC() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const { A, B, C } = getABCFromInputs();
    saveABCToLocalStorage({ A, B, C });

    const user = await getAuthedUser();
    if (!user) { console.log('DB-save overgeslagen: geen gebruiker.'); return; }

    const { error } = await supabase
      .from('user_mestplan')
      .upsert({
        user_id:        user.id,
        res_n_dierlijk: A,
        res_n_totaal:   B,
        res_p_totaal:   C,
        updated_at:     new Date().toISOString()
      }, { onConflict: 'user_id' });
    if (error) console.error('DB-save error:', error);
    else       console.log('DB-save OK:', { A, B, C });
  }, 300);
}

/* ---------- GLPK ---------- */
async function ensureGLPK() {
  if (typeof window.glp_create_prob !== 'undefined') return true;
  let tries = 0;
  return new Promise((res, rej) => {
    const tick = () => {
      if (typeof window.glp_create_prob !== 'undefined') res(true);
      else if (tries++ >= 50) rej(new Error('GLPK niet beschikbaar'));
      else setTimeout(tick, 80);
    };
    tick();
  });
}

/* ---------- mestsoorten.json ---------- */
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

/* ---------- UI binds ---------- */
function bindABCInputsAndState({ A, B, C }) {
  setABCInputs({ A, B, C });
  StateManager.setGebruiksruimte(toPosInt(A), toPosInt(B), toPosInt(C));

  const aEl = document.getElementById('prev_res_n_dierlijk');
  const bEl = document.getElementById('prev_res_n_totaal');
  const cEl = document.getElementById('prev_res_p_totaal');

  const onChange = () => {
    aEl.value = toPosInt(aEl.value);
    bEl.value = toPosInt(bEl.value);
    cEl.value = toPosInt(cEl.value);

    const a = toPosInt(aEl.value), b = toPosInt(bEl.value), c = toPosInt(cEl.value);

    document.querySelectorAll('.mest-btn.active').forEach(btn => {
      btn.classList.remove('active');
      StateManager.removeMestType(`${btn.dataset.type}-${btn.dataset.animal}`);
    });
    UIController.hideSlidersContainer();

    StateManager.setGebruiksruimte(a, b, c);
    saveABCToLocalStorage({ A: a, B: b, C: c });
    UIController.updateSliders();

    debouncedSaveABC();
  };

  [aEl, bEl, cEl].forEach(el => {
    el.setAttribute('inputmode', 'numeric'); el.step = '1'; el.min = '0';
    el.addEventListener('input', onChange);
    el.addEventListener('blur', onChange);
  });
}

function bindMestButtons(mestsoortenData) {
  const mapTypeKey = (t) => ({ drijfmest: 'drijfmest', vastemest: 'vaste_mest', overig: 'overig' }[t]);

  document.querySelectorAll('.mest-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const type = btn.dataset.type, animal = btn.dataset.animal, key = `${type}-${animal}`;

      if (btn.classList.contains('active')) {
        const mestData = mestsoortenData?.[mapTypeKey(type)]?.[animal];
        if (!mestData) { btn.classList.remove('active'); alert(`Geen specificaties voor: ${type} – ${animal}`); return; }
        StateManager.addMestType(key, mestData);
        UIController.renderMestsoortSlider(key, `${type} ${animal}`, ValidationEngine.getMaxTonnage(key));
        UIController.showSlidersContainer();
      } else {
        StateManager.removeMestType(key);
        document.getElementById(`group-${key}`)?.remove();
        if (Object.keys(StateManager.getActieveMest()).length === 0) UIController.hideSlidersContainer();
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
      if (typeof LogicEngine.optimize === 'function') await LogicEngine.optimize();
      else console.warn('LogicEngine.optimize() ontbreekt; alleen sliders geüpdatet.');
      UIController.updateSliders();
    } catch (e) {
      console.error('Optimalisatie mislukt:', e);
      alert('Optimalisatie lukt niet (GLPK niet beschikbaar?).');
    }
  });
  btn.dataset.bound = '1';
}

/* ---------- Init ---------- */
async function initializeApp() {
  try {
    // Standaard sliders eerst
    UIController.initStandardSliders();
    UIController.updateSliders();

    // 1) ABC: URL → LS → (voorlopig 0, wordt zo DB-retried)
    let source = 'default', ABC = { A: 0, B: 0, C: 0 };
    const fromURL = getABCFromQuery(), fromLS = loadABCFromLocalStorage();

    if (fromURL) {
      ABC = fromURL; source = 'url';
      saveABCToLocalStorage(ABC);
      const u = await getAuthedUser();
      if (u) {
        await supabase.from('user_mestplan').upsert({
          user_id: u.id,
          res_n_dierlijk: toPosInt(ABC.A),
          res_n_totaal:   toPosInt(ABC.B),
          res_p_totaal:   toPosInt(ABC.C),
          updated_at:     new Date().toISOString()
        }, { onConflict: 'user_id' });
      }
    } else if (fromLS && (fromLS.A || fromLS.B || fromLS.C)) {
      ABC = fromLS; source = 'localstorage';
    }
    bindABCInputsAndState(ABC);
    UIController.updateSliders();
    console.log(`✅ Mestplan init (bron=${source})`, ABC);

    // 2) mestsoorten + knoppen
    let mestsoortenData = {};
    try {
      mestsoortenData = await loadMestsoorten();
      StateManager.setMestTypes(mestsoortenData);
    } catch (e) { console.warn('mestsoorten.json niet gevonden; knoppen geven melding bij gebruik.', e); }
    bindMestButtons(mestsoortenData);
    bindOptimizeButton();

    // 3) DIRECTE DB-retry zodra gebruiker bekend is (betrouwbaarder dan alleen getSession)
    (async () => {
      const db = await loadABCFromDB(); // gebruikt getAuthedUser()
      if (db && (db.A || db.B || db.C)) {
        const cur = getABCFromInputs();
        if (cur.A !== db.A || cur.B !== db.B || cur.C !== db.C) {
          setABCInputs(db);
          StateManager.setGebruiksruimte(db.A, db.B, db.C);
          saveABCToLocalStorage(db);
          UIController.updateSliders();
          console.log('🔄 ABC toegepast via directe DB-retry.', db);
        }
      }
    })();

    // 4) Realtime sync (optioneel, werkt alleen als Realtime-policy aanstaat)
    const u = await getAuthedUser();
    if (u) {
      const channel = supabase
        .channel('mestplan-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_mestplan', filter: `user_id=eq.${u.id}` },
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

    // 5) Late fallback (2s) — alleen als nog 0/0/0
    setTimeout(async () => {
      const cur = getABCFromInputs();
      if (cur.A === 0 && cur.B === 0 && cur.C === 0) {
        const dbVal = await loadABCFromDB();
        if (dbVal && (dbVal.A || dbVal.B || dbVal.C)) {
          setABCInputs(dbVal);
          StateManager.setGebruiksruimte(dbVal.A, dbVal.B, dbVal.C);
          saveABCToLocalStorage(dbVal);
          UIController.updateSliders();
          console.log('⏱️ Late DB-retry gevuld.', dbVal);
        } else {
          console.log('⏱️ Late DB-retry: geen waarde gevonden.');
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
