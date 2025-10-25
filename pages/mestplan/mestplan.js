// pages/mestplan/mestplan.js
// Integers voor sliders + robuuste ABC-load (Supabase + localStorage fallback)

import { supabase } from '../../supabaseClient.js';

// Lowercase module imports + shims
import * as SM from '../../core/domain/statemanager.js';
import * as UI from '../../core/ui/uicontroller.js';
import * as LE from '../../core/domain/logicengine.js';
import * as VE from '../../core/domain/validationengine.js';

const StateManager     = SM.StateManager     || SM.default || SM;
const UIController     = UI.UIController     || UI.default || UI;
const LogicEngine      = LE.LogicEngine      || LE.default || LE;
const ValidationEngine = VE.ValidationEngine || VE.default || VE;

/* ===========================
   Auth helpers
=========================== */
async function waitForAuth({ tries = 8, delayMs = 200 } = {}) {
  for (let i = 0; i < tries; i++) {
    // getUser() pakt vaak sneller de actuele user
    const { data: u1 } = await supabase.auth.getUser();
    const user1 = u1?.user || null;
    if (user1) return user1;

    // fallback naar getSession()
    const { data: s2 } = await supabase.auth.getSession();
    const user2 = s2?.session?.user || null;
    if (user2) return user2;

    await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}

/* ===========================
   URL & Storage helpers
=========================== */
function getABCFromQuery() {
  const p = new URLSearchParams(location.search);
  const A = Number(p.get('totaalA'));
  const B = Number(p.get('totaalB'));
  const C = Number(p.get('totaalC'));
  return {
    A: Number.isFinite(A) ? A : null,
    B: Number.isFinite(B) ? B : null,
    C: Number.isFinite(C) ? C : null
  };
}

function loadABCFromLocalStorage() {
  try {
    const raw = localStorage.getItem('mestplan_last_results');
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const A = Math.round(Number(obj?.res_n_dierlijk || 0));
    const B = Math.round(Number(obj?.res_n_totaal   || 0));
    const C = Math.round(Number(obj?.res_p_totaal   || 0));
    if (A || B || C) return { A, B, C };
  } catch {}
  return null;
}

/* ===========================
   DB opslaan/laden (debounced)
=========================== */
let saveTimeout;
async function debouncedSaveABC() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const user = await waitForAuth();
    if (!user) return;

    const a = Math.round(Number(document.getElementById('prev_res_n_dierlijk')?.value) || 0);
    const b = Math.round(Number(document.getElementById('prev_res_n_totaal')?.value)  || 0);
    const c = Math.round(Number(document.getElementById('prev_res_p_totaal')?.value)  || 0);

    const { error } = await supabase
      .from('user_mestplan')
      .upsert({
        user_id:        user.id,
        res_n_dierlijk: a,
        res_n_totaal:   b,
        res_p_totaal:   c,
        updated_at:     new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) console.error('Save error:', error);
  }, 300);
}

async function loadABCFromDB() {
  const user = await waitForAuth();
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

  const A = Math.round(Number(data.res_n_dierlijk ?? 0));
  const B = Math.round(Number(data.res_n_totaal   ?? 0));
  const C = Math.round(Number(data.res_p_totaal   ?? 0));
  return { A, B, C };
}

/* ===========================
   GLPK check (alleen bij optimaliseren)
=========================== */
async function ensureGLPK() {
  const maxAttempts = 100;
  let attempts = 0;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (typeof window.glp_create_prob !== 'undefined') {
        resolve(window);
      } else if (attempts++ >= maxAttempts) {
        reject(new Error('GLPK niet beschikbaar'));
      } else {
        setTimeout(tick, 100);
      }
    };
    tick();
  });
}

/* ===========================
   mestsoorten.json met failover
=========================== */
async function loadMestsoorten() {
  const tryPaths = [
    './core/domain/data/mestsoorten.json', // nieuwe structuur (relatief vanaf mestplan.html)
    '/data/mestsoorten.json'               // oud pad (absolute fallback)
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
   UI binding
=========================== */
function bindABCInputsAndState({ A, B, C }) {
  const aEl = document.getElementById('prev_res_n_dierlijk');
  const bEl = document.getElementById('prev_res_n_totaal');
  const cEl = document.getElementById('prev_res_p_totaal');
  if (!aEl || !bEl || !cEl) {
    console.warn('Stap-2 inputs ontbreken in de DOM.');
    return;
  }

  // maak inputs zelf ook integer-only (UX)
  aEl.step = bEl.step = cEl.step = '1';

  aEl.value = Math.round(A || 0);
  bEl.value = Math.round(B || 0);
  cEl.value = Math.round(C || 0);

  StateManager.setGebruiksruimte(Math.round(A||0), Math.round(B||0), Math.round(C||0));

  const onChange = () => {
    const a = Math.round(Number(aEl.value) || 0);
    const b = Math.round(Number(bEl.value) || 0);
    const c = Math.round(Number(cEl.value) || 0);

    // Reset actieve mestselecties zodat constraints niet blijven hangen
    document.querySelectorAll('.mest-btn.active').forEach(btn => {
      btn.classList.remove('active');
      const key = `${btn.dataset.type}-${btn.dataset.animal}`;
      StateManager.removeMestType(key);
    });
    UIController.hideSlidersContainer();

    StateManager.setGebruiksruimte(a, b, c);
    UIController.updateSliders();

    debouncedSaveABC();
  };

  [aEl, bEl, cEl].forEach(el => el.addEventListener('input', onChange));
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
      await LogicEngine.optimize();
      UIController.updateSliders();
    } catch (e) {
      console.error('Optimalisatie mislukt:', e);
      alert('Optimalisatie lukt niet (GLPK niet beschikbaar?).');
    }
  });
  btn.dataset.bound = '1';
}

/* ===========================
   Init
=========================== */
async function initializeApp() {
  try {
    // Zorg dat we (even) op een user wachten; direct naar deze pagina moet ook werken
    const user = await waitForAuth();

    // 1) A/B/C: URL → DB → localStorage → 0
    const q = getABCFromQuery();
    let A = null, B = null, C = null;

    if (q.A !== null || q.B !== null || q.C !== null) {
      A = q.A ?? 0; B = q.B ?? 0; C = q.C ?? 0;
      if (user) {
        await supabase.from('user_mestplan').upsert({
          user_id: user.id,
          res_n_dierlijk: Math.round(A),
          res_n_totaal:   Math.round(B),
          res_p_totaal:   Math.round(C),
          updated_at:     new Date().toISOString()
        }, { onConflict: 'user_id' });
      }
    } else {
      const dbVals = await loadABCFromDB();
      if (dbVals && (dbVals.A || dbVals.B || dbVals.C)) {
        ({ A, B, C } = dbVals);
      } else {
        const lsVals = loadABCFromLocalStorage();
        if (lsVals) ({ A, B, C } = lsVals);
        else { A = 0; B = 0; C = 0; }
      }
    }

    // 2) Inputs/state
    bindABCInputsAndState({ A, B, C });

    // 3) Standaard sliders
    UIController.initStandardSliders();
    UIController.updateSliders();

    // 4) mestsoorten.json (met fallback pad)
    let mestsoortenData = {};
    try {
      mestsoortenData = await loadMestsoorten();
      StateManager.setMestTypes(mestsoortenData);
    } catch (e) {
      console.warn('mestsoorten.json niet gevonden; knoppen geven melding bij gebruik.', e);
    }

    // 5) Knoppen + Optimize
    bindMestButtons(mestsoortenData);
    bindOptimizeButton();

    // 6) Realtime sync van A/B/C
    if (user) {
      const channel = supabase
        .channel('mestplan-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_mestplan', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const aEl = document.getElementById('prev_res_n_dierlijk');
            const bEl = document.getElementById('prev_res_n_totaal');
            const cEl = document.getElementById('prev_res_p_totaal');
            const nA = Math.round(Number(payload.new?.res_n_dierlijk ?? 0));
            const nB = Math.round(Number(payload.new?.res_n_totaal   ?? 0));
            const nC = Math.round(Number(payload.new?.res_p_totaal   ?? 0));

            if (aEl && bEl && cEl &&
               ((Number(aEl.value)||0) !== nA ||
                (Number(bEl.value)||0) !== nB ||
                (Number(cEl.value)||0) !== nC)) {
              aEl.value = nA; bEl.value = nB; cEl.value = nC;
              StateManager.setGebruiksruimte(nA, nB, nC);
              UIController.updateSliders();
            }
          }
        )
        .subscribe();

      window.addEventListener('beforeunload', () => supabase.removeChannel(channel));
    }

    console.log('✅ Mestplan init voltooid');
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
