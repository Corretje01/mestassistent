// main.js

import { StateManager } from './statemanager.js';
import { UIController } from './uicontroller.js';
import { LogicEngine } from './logicengine.js';
import { ValidationEngine } from './validationengine.js';
import { supabase } from './supabaseClient.js';

// Debounced helper: upsert gebruiker’s mestplan in Supabase
let saveTimeout;
function saveMestplan(key, value) {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const user = supabase.auth.user();
    if (!user) return;
    const updates = {
      user_id: user.id,
      [key]:      value,
      updated_at: new Date()
    };
    const { error } = await supabase
      .from('user_mestplan')
      .upsert(updates, { onConflict: 'user_id' });
    if (error) console.error('Save error:', error);
  }, 300);
}

// Haal per-account opgeslagen waarden op (of maak lege entry aan)
async function loadMestplan() {
  const user = supabase.auth.user();
  if (!user) return { A: 0, B: 0, C: 0 };

  const { data, error } = await supabase
    .from('user_mestplan')
    .select('res_n_dierlijk, res_n_totaal, res_p_totaal')
    .eq('user_id', user.id)
    .single();

  if (error && error.code === 'PGRST116') {
    // Nog geen record: insert lege defaults
    await supabase.from('user_mestplan').insert({ user_id: user.id });
    return { A: 0, B: 0, C: 0 };
  }
  if (error) {
    console.error('Error loadMestplan():', error);
    return { A: 0, B: 0, C: 0 };
  }

  return {
    A: Number(data.res_n_dierlijk),
    B: Number(data.res_n_totaal),
    C: Number(data.res_p_totaal),
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

    // 2) Vul Stap-2-inputs met deze waarden
    document.getElementById('prev_res_n_dierlijk').value = A;
    document.getElementById('prev_res_n_totaal').value    = B;
    document.getElementById('prev_res_p_totaal').value    = C;

    // 3) Hang live-listeners op de drie inputs
    [
      ['res_n_dierlijk', 'prev_res_n_dierlijk'],
      ['res_n_totaal',   'prev_res_n_totaal'],
      ['res_p_totaal',   'prev_res_p_totaal']
    ].forEach(([key, prevId]) => {
      const input = document.getElementById(prevId);
      if (!input) return;

      input.addEventListener('input', () => {
        const num = Number(input.value) || 0;

        // Optioneel: bewaar ook in localStorage voor fallback
        localStorage.setItem(key, num.toString());

        // Reset mest-UI en recalc state
        resetMestPlanUI();
        const a = Number(document.getElementById('prev_res_n_dierlijk').value) || 0;
        const b = Number(document.getElementById('prev_res_n_totaal').value)  || 0;
        const c = Number(document.getElementById('prev_res_p_totaal').value)  || 0;
        StateManager.setGebruiksruimte(a, b, c);

        // Herteken sliders
        UIController.updateSliders();

        // Opslaan naar Supabase
        saveMestplan(key, num);
      });
    });

    // 4) Init en render standaard sliders
    UIController.initStandardSliders();
    UIController.updateSliders();

    // 5) Laad mestsoorten.json en configureer knoppen
    let mestsoortenData = {};
    try {
      const resp = await fetch('/data/mestsoorten.json');
      mestsoortenData = await resp.json();
      StateManager.setMestTypes(mestsoortenData);
      console.log('✅ mestsoorten.json geladen');
    } catch (err) {
      console.error('Fout bij laden mestsoorten.json:', err);
      alert('⚠️ Kan mestsoorten.json niet laden.');
      return;
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

  } catch (err) {
    console.error('❌ Fout bij initialisatie:', err);
    alert('⚠️ Er ging iets mis bij initialisatie.');
  }
}

// Start de app wanneer de pagina geladen is
window.onload = initializeApp;
