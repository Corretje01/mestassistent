// pages/mestplan/mestplan.js

import { StateManager } from '../../core/domain/stateManager.js';
import { UIController } from '../../core/ui/uiController.js';
import { LogicEngine } from '../../core/domain/logicEngine.js';
import { ValidationEngine } from '../../core/domain/validationEngine.js';
import { supabase } from '../../supabaseClient.js';

// Debounced helper: upsert het volledige trio A/B/C
let saveTimeout;
function saveMestplan() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const a = Number(document.getElementById('prev_res_n_dierlijk').value) || 0;
    const b = Number(document.getElementById('prev_res_n_totaal').value)  || 0;
    const c = Number(document.getElementById('prev_res_p_totaal').value)  || 0;

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

// Haal per-account opgeslagen waarden op (of maak lege entry aan)
async function loadMestplan() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { A: 0, B: 0, C: 0 };

  const { data, error } = await supabase
    .from('user_mestplan')
    .select('res_n_dierlijk, res_n_totaal, res_p_totaal')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('loadMestplan error:', error);
    return { A: 0, B: 0, C: 0 };
  }
  if (!data) return { A: 0, B: 0, C: 0 };

  return {
    A: Number(data.res_n_dierlijk ?? 0),
    B: Number(data.res_n_totaal ?? 0),
    C: Number(data.res_p_totaal ?? 0),
  };
}

// Wacht tot GLPK in window zit
async function waitForGLPK() {
  return new Promise((resolve, reject) => {
    const maxAttempts = 100;
    let attempts = 0;
    const check = () => {
      if (typeof window.glp_create_prob !== 'undefined') {
        console.log('✅ GLPK geladen');
        resolve(window);
      } else if (attempts >= maxAttempts) {
        reject(new Error('GLPK niet beschikbaar'));
      } else {
        attempts++;
        setTimeout(check, 100);
      }
    };
    check();
  });
}

// Hoofdinitialisatie
async function initializeApp() {
  try {
    await waitForGLPK();

    // Pak de drie inputvelden 1x vast
    const aEl = document.getElementById('prev_res_n_dierlijk');
    const bEl = document.getElementById('prev_res_n_totaal');
    const cEl = document.getElementById('prev_res_p_totaal');
    if (!aEl || !bEl || !cEl) {
      console.warn('Stap-2 inputs ontbreken in de DOM.');
      return;
    }

    // Helper om alle actieve mest-knoppen te resetten
    function resetMestPlanUI() {
      document.querySelectorAll('.mest-btn.active').forEach(btn => {
        btn.classList.remove('active');
        const key = `${btn.dataset.type}-${btn.dataset.animal}`;
        StateManager.removeMestType(key);
      });
      UIController.hideSlidersContainer();
    }

    // 1) Laad gebruiksruimte uit Supabase
    const { A, B, C } = await loadMestplan();
    StateManager.setGebruiksruimte(A, B, C);

    // 2) Vul inputs met deze waarden
    aEl.value = A;
    bEl.value = B;
    cEl.value = C;

    // 3) Live-listeners op de inputs
    [aEl, bEl, cEl].forEach(input => {
      input.addEventListener('input', () => {
        // Recalc state op basis van actuele velden
        const a = Number(aEl.value) || 0;
        const b = Number(bEl.value) || 0;
        const c = Number(cEl.value) || 0;

        resetMestPlanUI();
        StateManager.setGebruiksruimte(a, b, c);
        UIController.updateSliders();

        // Debounced upsert van het volledige trio
        saveMestplan();
      });
    });

    // 4) Init en render standaard sliders
    UIController.initStandardSliders();
    UIController.updateSliders();

    // 5) Laad mestsoorten.json en configureer knoppen
    let mestsoortenData = {};
    try {
      // Let op: fetch is relatief aan de pagina (mestplan.html staat in de root)
      const resp = await fetch('./core/domain/data/mestsoorten.json', { cache: 'no-store' });
      mestsoortenData = await resp.json();
      StateManager.setMestTypes(mestsoortenData);
      console.log('✅ mestsoorten.json geladen');
    } catch (err) {
      console.error('Fout bij laden mestsoorten.json:', err);
      alert('⚠️ Kan mestsoorten.json niet laden.');
      return; // stop init
    }

    // 6) Event handlers voor mest-knoppen
    document.querySelectorAll('.mest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const type = btn.dataset.type;
        const animal = btn.dataset.animal;
        const key = `${type}-${animal}`;

        if (btn.classList.contains('active')) {
          const jsonType = { drijfmest: 'drijfmest', vastemest: 'vaste_mest', overig: 'overig' }[type];
          const mestData = mestsoortenData?.[jsonType]?.[animal];
          if (!mestData) {
            console.warn(`⚠ Geen mestdata voor ${key}`);
            return;
          }
          StateManager.addMestType(key, mestData);
          UIController.renderMestsoortSlider(key, `${type} ${animal}`, ValidationEngine.getMaxTonnage(key));
          UIController.showSlidersContainer();
        } else {
          StateManager.removeMestType(key);
          const group = document.getElementById(`group-${key}`);
          if (group) group.remove();
          if (Object.keys(StateManager.getActieveMest()).length === 0) {
            UIController.hideSlidersContainer();
          }
        }

        UIController.updateSliders();
      });
    });

    // 7) Realtime sync (na UI-setup) – luister op INSERT + UPDATE
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const channel = supabase
        .channel('mestplan-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_mestplan', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const nA = Number(payload.new?.res_n_dierlijk ?? 0);
            const nB = Number(payload.new?.res_n_totaal   ?? 0);
            const nC = Number(payload.new?.res_p_totaal   ?? 0);

            StateManager.setGebruiksruimte(nA, nB, nC);
            aEl.value = nA;
            bEl.value = nB;
            cEl.value = nC;
            UIController.updateSliders();
          }
        )
        .subscribe();

      // Opruimen bij navigatie
      window.addEventListener('beforeunload', () => {
        supabase.removeChannel(channel);
      });
    }

  } catch (err) {
    console.error('❌ Fout bij initialisatie:', err);
    alert('⚠️ Er ging iets mis bij initialisatie.');
  }
}

// Start de app wanneer de pagina geladen is
window.onload = initializeApp;
