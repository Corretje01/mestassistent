// pages/mestplan/mestplan.js
// Snelle "instant fill" (localStorage) + DB overwrite bij auth,
// integer ABC, lazy GLPK, stabiele mestsoorten & UI-binding.

import { supabase } from '../../supabaseClient.js';

// ===== Module imports (lowercase paden) + shims voor default/named exports =====
import * as SM from '../../core/domain/statemanager.js';
import * as UI from '../../core/ui/uicontroller.js';
import * as LE from '../../core/domain/logicengine.js';
import * as VE from '../../core/domain/validationengine.js';

const StateManager     = SM.StateManager     || SM.default || SM;
const UIController     = UI.UIController     || UI.default || UI;
const LogicEngine      = LE.LogicEngine      || LE.default || LE;
const ValidationEngine = VE.ValidationEngine || VE.default || VE;

/* ===========================
   Helpers: auth + URL + storage
=========================== */
async function getSessionUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.warn('getSession error:', error);
  return session?.user || null;
}

// Wacht even op auth; geef snel terug als het langer duurt (we tonen dan LS-waarden)
async function waitForAuth({ timeoutMs = 1200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const u = await getSessionUser();
    if (u) return u;
    await new Promise(r => setTimeout(r, 120));
  }
  return null; // geen user (nog) => werk met LS; DB volgt als user later binnenkomt
}

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
    if (!Number.isFinite(A) && !Number.isFinite(B) && !Number.isFinite(C)) return null;
    return { A: A || 0, B: B || 0, C: C || 0 };
  } catch { return null; }
}

function saveABCToLocalStorage({ A, B, C }) {
  try {
    localStorage.setItem('mestplan_last_results', JSON.stringify({
      res_n_dierlijk: Math.round(A || 0),
      res_n_totaal:   Math.round(B || 0),
      res_p_totaal:   Math.round(C || 0),
      ts: Date.now()
    }));
  } catch {}
}

/* ===========================
   DB I/O
=========================== */
let saveTimeout;
async function debouncedSaveABC() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const user = await getSessionUser();
    const a = Math.round(Number(document.getElementById('prev_res_n_dierlijk')?.value) || 0);
    const b = Math.round(Number(document.getElementById('prev_res_n_totaal')?.value)  || 0);
    const c = Math.round(Number(document.getElementById('prev_res_p_totaal')?.value)  || 0);

    // altijd ook lokaal, voor instant fills
    saveABCToLocalStorage({ A: a, B: b, C: c });

    if (!user) return; // geen user -> alleen lokaal
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
  }, 250);
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
    A: Math.round(Number(data.res_n_dierlijk ?? 0)),
    B: Math.round(Number(data.res_n_totaal   ?? 0)),
    C: Math.round(Number(data.res_p_totaal   ?? 0)),
  };
}

/* ===========================
   GLPK pas bij optimaliseren
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
    './core/domain/data/mestsoorten.json', // nieuw pad (relatief vanaf mestplan.html)
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
   UI
=========================== */
function bindABCInputsAndState({ A, B, C }) {
  const aEl = document.getElementById('prev_res_n_dierlijk');
  const bEl = document.getElementById('prev_res_n_totaal');
  const cEl = document.getElementById('prev_res_p_totaal');
  if (!aEl || !bEl || !cEl) {
    console.warn('Stap-2 inputs ontbreken in de DOM.');
    return;
  }

  // altijd hele getallen tonen
  aEl.value = Math.round(A || 0);
  bEl.value = Math.round(B || 0);
  cEl.value = Math.round(C || 0);

  StateManager.setGebruiksruimte(
    Math.round(A || 0),
    Math.round(B || 0),
    Math.round(C || 0)
  );

  const onChange = () => {
    // forceer integers in de velden zelf
    const a = Math.round(Number(aEl.value) || 0);
    const b = Math.round(Number(bEl.value) || 0);
    const c = Math.round(Number(cEl.value) || 0);
    aEl.value = a; bEl.value = b; cEl.value = c;

    // Reset actieve mestselecties zodat constraints niet blijven hangen
    document.querySelectorAll('.mest-btn.active').forEach(btn => {
      btn.classList.remove('active');
      const key = `${btn.dataset.type}-${btn.dataset.animal}`;
      StateManager.removeMestType(key);
    });
    UIController.hideSlidersContainer();

    StateManager.setGebruiksruimte(a, b, c);
    UIController.updateSliders();

    debouncedSaveABC(); // sla lokaal + (indien user) DB op
  };

  // input + blur (blur garandeert afronden bij copy/paste)
  [aEl, bEl, cEl].forEach(el => {
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
    // 0) Instant UI: vul meteen vanuit localStorage om "0-flits" te vermijden
    const lsEarly = loadABCFromLocalStorage();
    if (lsEarly) {
      bindABCInputsAndState(lsEarly);
      try {
        UIController.initStandardSliders();
        UIController.updateSliders();
      } catch {}
    }

    // 1) URL → (bij user) DB-upsert → bron voor UI
    const q = getABCFromQuery();
    let ABCFrom = null;

    if (q.A !== null || q.B !== null || q.C !== null) {
      // URL-waarden winnen de eerste keer; schrijf (indien user) direct weg naar DB
      const A = Math.round(q.A ?? 0), B = Math.round(q.B ?? 0), C = Math.round(q.C ?? 0);
      const userNow = await waitForAuth({ timeoutMs: 1200 });
      saveABCToLocalStorage({ A, B, C });
      if (userNow) {
        await supabase.from('user_mestplan').upsert({
          user_id: userNow.id,
          res_n_dierlijk: A,
          res_n_totaal:   B,
          res_p_totaal:   C,
          updated_at:     new Date().toISOString()
        }, { onConflict: 'user_id' });
      }
      ABCFrom = { A, B, C };
    } else {
      // Geen URL; probeer eerst of de user bekend is en lees dan DB
      const user = await waitForAuth({ timeoutMs: 1200 });
      if (user) {
        const dbVal = await loadABCFromDB();
        if (dbVal) {
          saveABCToLocalStorage(dbVal); // sync LS met DB
          ABCFrom = dbVal;
        }
      }
      // fallback: als we nog niets hebben (en LSEarly was leeg), zet 0,0,0
      if (!ABCFrom && !lsEarly) ABCFrom = { A: 0, B: 0, C: 0 };
    }

    // 2) Inputs/state definitief binden wanneer nodig (overschrijft early LS)
    if (ABCFrom) {
      bindABCInputsAndState(ABCFrom);
      if (!lsEarly) {
        UIController.initStandardSliders();
        UIController.updateSliders();
      }
    }

    // 3) mestsoorten.json (met fallback pad)
    let mestsoortenData = {};
    try {
      mestsoortenData = await loadMestsoorten();
      StateManager.setMestTypes(mestsoortenData);
    } catch (e) {
      console.warn('mestsoorten.json niet gevonden; knoppen geven melding bij gebruik.', e);
    }

    // 4) Knoppen + Optimize
    bindMestButtons(mestsoortenData);
    bindOptimizeButton();

    // 5) Realtime sync van A/B/C (DB → UI)
    const user = await getSessionUser();
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
            if (!aEl || !bEl || !cEl) return;

            const nA = Math.round(Number(payload.new?.res_n_dierlijk ?? 0));
            const nB = Math.round(Number(payload.new?.res_n_totaal   ?? 0));
            const nC = Math.round(Number(payload.new?.res_p_totaal   ?? 0));

            if ((+aEl.value||0)!==nA || (+bEl.value||0)!==nB || (+cEl.value||0)!==nC) {
              aEl.value = nA; bEl.value = nB; cEl.value = nC;
              StateManager.setGebruiksruimte(nA, nB, nC);
              saveABCToLocalStorage({ A: nA, B: nB, C: nC });
              UIController.updateSliders();
            }
          }
        )
        .subscribe();

      window.addEventListener('beforeunload', () => supabase.removeChannel(channel));
    }

    // 6) Multi-tab sync via storage events
    window.addEventListener('storage', (e) => {
      if (e.key !== 'mestplan_last_results' || !e.newValue) return;
      try {
        const obj = JSON.parse(e.newValue);
        const A = Math.round(Number(obj?.res_n_dierlijk || 0));
        const B = Math.round(Number(obj?.res_n_totaal   || 0));
        const C = Math.round(Number(obj?.res_p_totaal   || 0));
        const aEl = document.getElementById('prev_res_n_dierlijk');
        const bEl = document.getElementById('prev_res_n_totaal');
        const cEl = document.getElementById('prev_res_p_totaal');
        if (!aEl || !bEl || !cEl) return;
        if ((+aEl.value||0)===A && (+bEl.value||0)===B && (+cEl.value||0)===C) return;

        aEl.value = A; bEl.value = B; cEl.value = C;
        StateManager.setGebruiksruimte(A, B, C);
        UIController.updateSliders();
      } catch {}
    });

    console.log('✅ Mestplan init voltooid (instant-fill + DB overwrite + integers)');
  } catch (err) {
    console.error('❌ Fout bij initialisatie:', err);
    alert('⚠️ Er ging iets mis bij initialisatie. Check console voor details.');
  }
}

/* ===========================
   Start init
=========================== */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}
