// main.js
import { StateManager } from './statemanager.js';
import { UIController } from './uicontroller.js';
import { LogicEngine } from './logicengine.js';
import { ValidationEngine } from './validationengine.js';

// Wacht tot GLPK is geladen door te controleren op window.glp_create_prob
async function waitForGLPK() {
  return new Promise((resolve, reject) => {
    const maxAttempts = 100; // Max 10 seconden (100 * 100ms)
    let attempts = 0;
    const checkGLPK = () => {
      if (typeof window.glp_create_prob !== 'undefined') {
        console.log('✅ GLPK succesvol geladen');
        resolve(window);
      } else if (attempts >= maxAttempts) {
        reject(new Error('GLPK functies niet beschikbaar in window-scope'));
      } else {
        attempts++;
        setTimeout(checkGLPK, 100);
      }
    };
    checkGLPK();
  });
}

// Hoofdinitialisatiefunctie
async function initializeApp() {
  try {
    // 1) Wacht op GLPK
    await waitForGLPK();

    // Helper om actieve mest-knoppen te resetten
default function resetMestPlanUI() {
      document.querySelectorAll('.mest-btn.active').forEach(btn => {
        btn.classList.remove('active');
        const key = `${btn.dataset.type}-${btn.dataset.animal}`;
        StateManager.removeMestType(key);
      });
      UIController.hideSlidersContainer();
    }

    // 2) Zorg dat de drie gebruiksruimte-keys bestaan
    ['res_n_dierlijk', 'res_n_totaal', 'res_p_totaal'].forEach(key => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, '0');
      }
    });

    // 3) Lees gegarandeerd numerieke waarden
    const totaalA = Number(localStorage.getItem('res_n_dierlijk'));
    const totaalB = Number(localStorage.getItem('res_n_totaal'));
    const totaalC = Number(localStorage.getItem('res_p_totaal'));

    // 4) Zet initiële gebruiksruimte
    StateManager.setGebruiksruimte(totaalA, totaalB, totaalC);

    // 5) Vul Stap 2-inputs en hang live-listener
    [
      ['res_n_dierlijk', 'prev_res_n_dierlijk'],
      ['res_n_totaal',   'prev_res_n_totaal'],
      ['res_p_totaal',   'prev_res_p_totaal']
    ].forEach(([key, prevId]) => {
      const input = document.getElementById(prevId);
      if (!input) return;
      input.value = localStorage.getItem(key);
      input.addEventListener('input', () => {
        const num = Number(input.value) || 0;
        localStorage.setItem(key, num.toString());
        resetMestPlanUI();
        const a = Number(document.getElementById('prev_res_n_dierlijk').value) || 0;
        const b = Number(document.getElementById('prev_res_n_totaal').value)  || 0;
        const c = Number(document.getElementById('prev_res_p_totaal').value)  || 0;
        StateManager.setGebruiksruimte(a, b, c);
        UIController.updateSliders();
      });
    });

    // 6) Init en teken sliders\    UIController.initStandardSliders();
    UIController.updateSliders();

    // 7) Laad mestsoorten.json
    let mestsoortenData = {};
    try {
      const response = await fetch('/data/mestsoorten.json');
      mestsoortenData = await response.json();
      StateManager.setMestTypes(mestsoortenData);
      console.log('✅ mestsoorten.json geladen');
    } catch (err) {
      console.error('❌ Fout bij laden mestsoorten.json:', err);
      alert('⚠️ Kan mestsoorten.json niet laden.');
      return;
    }

    // 8) Mest-knop handlers
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
            console.warn(`⚠️ Geen mestdata gevonden voor ${key}`);
            return;
          }
          StateManager.addMestType(key, mestData);
          const maxTon = ValidationEngine.getMaxTonnage(key);
          UIController.renderMestsoortSlider(key, `${type} ${animal}`, maxTon);
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
    console.error('❌ Fout bij initialisatie van GLPK:', err);
    alert('⚠️ GLPK kon niet worden geladen. Controleer of het script correct is ingeladen.');
  }
}

// Start initialisatie bij window.onload
window.onload = initializeApp;
