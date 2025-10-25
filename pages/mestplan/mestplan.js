// pages/mestplan/mestplan.js

import { StateManager } from '../../core/domain/stateManager.js';
import { UIController } from '../../core/ui/uiController.js';
import { LogicEngine } from '../../core/domain/logicEngine.js';
import { ValidationEngine } from '../../core/domain/validationEngine.js';
import { supabase } from '../../supabaseClient.js';

/* ===========================
   Helpers: Supabase + URL params
=========================== */
async function getSessionUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.warn('getSession error:', error);
  return session?.user || null;
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

let saveTimeout;
async function debouncedSaveABC() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const user = await getSessionUser();
    if (!user) return;

    const a = Number(document.getElementById('prev_res_n_dierlijk')?.value) || 0;
    const b = Number(document.getElementById('prev_res_n_totaal')?.value)  || 0;
    const c = Number(document.getElementById('prev_res_p_totaal')?.value)  || 0;

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
  const user = await getSessionUser();
  if (!user) return { A: 0, B: 0, C: 0 };

  const { data, error } = await supabase
    .from('user_mestplan')
    .select('res_n_dierlijk, res_n_totaal, res_p_totaal')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('loadABCFromDB error:', error);
    return { A: 0, B: 0, C: 0 };
  }
  if (!data) return { A: 0, B: 0, C: 0 };

  return {
    A: Number(data.res_n_dierlijk ?? 0),
    B: Number(data.res_n_totaal   ?? 0),
    C: Number(data.res_p_totaal   ?? 0),
  };
}

/* ===========================
   GLPK alleen checken vlak vóór optimaliseren
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

  aEl.value = A;
  bEl.value = B;
  cEl.value = C;

  StateManager.setGebruiksruimte(A, B, C);

  const onChange = () => {
    const a = Number(aEl.value) || 0;
    const b = Number(bEl.value) || 0;
    const c = Number(cEl.value) || 0;

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
    // 1) A/B/C: URL → DB → 0
    const q = getABCFromQuery();
    let A, B, C;
    if (q.A !== null || q.B !== null || q.C !== null) {
      A = q.A ?? 0; B = q.B ?? 0; C = q.C ?? 0;
      const user = await getSessionUser();
      if (user) {
        await supabase.from('user_mestplan').upsert({
          user_id: user.id,
          res_n_dierlijk: A,
          res_n_totaal:   B,
          res_p_totaal:   C,
          updated_at:     new Date().toISOString()
        }, { onConflict: 'user_id' });
      }
    } else {
      const fromDB = await loadABCFromDB();
      A = fromDB.A; B = fromDB.B; C = fromDB.C;
    }

    // 2) Inputs/state
    bindABCInputsAndState({ A, B, C });

    // 3) Standaard sliders
    UIController.initStandardSliders();
    UIController.updateSliders();

    // 4) mestsoorten.json met failover pad
    async function loadMestsoorten() {
      const tryPaths = [
        './core/domain/data/mestsoorten.json', // nieuwe structuur
        '/data/mestsoorten.json'               // oud pad (fallback)
      ];
      for (const p of tryPaths) {
        try {
          const r = await fetch(p, { cache: 'no-store' });
          if (r.ok) return await r.json();
        } catch {}
      }
      throw new Error('mestsoorten.json niet gevonden op bekende paden');
    }

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

    // 6) Realtime sync
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
            const nA = Number(payload.new?.res_n_dierlijk ?? 0);
            const nB = Number(payload.new?.res_n_totaal   ?? 0);
            const nC = Number(payload.new?.res_p_totaal   ?? 0);
            if (
              aEl && bEl && cEl &&
              ((Number(aEl.value) || 0) !== nA ||
               (Number(bEl.value) || 0) !== nB ||
               (Number(cEl.value) || 0) !== nC)
            ) {
              aEl.value = nA; bEl.value = nB; cEl.value = nC;
              StateManager.setGebruiksruimte(nA, nB, nC);
              UIController.updateSliders();
            }
          }
        )
        .subscribe();
      window.addEventListener('beforeunload', () => supabase.removeChannel(channel));
    }
  } catch (err) {
    console.error('❌ Fout bij initialisatie:', err);
    alert('⚠️ Er ging iets mis bij initialisatie.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}
