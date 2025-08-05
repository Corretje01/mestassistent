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
      if (typeof window.glp_create_prob !== "undefined") {
        console.log("✅ GLPK succesvol geladen");
        resolve(window);
      } else if (attempts >= maxAttempts) {
        reject(new Error("GLPK functies niet beschikbaar in window-scope"));
      } else {
        attempts++;
        setTimeout(checkGLPK, 100); // Controleer elke 100ms
      }
    };
    checkGLPK();
  });
}

// Hoofdinitialisatiefunctie
async function initializeApp() {
  try {
    // Wacht op GLPK-initialisatie
    await waitForGLPK();

    function resetMestPlanUI() {
      document.querySelectorAll('.mest-btn.active').forEach(btn => {
        btn.classList.remove('active');
        const key = `${btn.dataset.type}-${btn.dataset.animal}`;
        StateManager.removeMestType(key);
      });
      // Container verbergen, mocht dat nodig zijn
      UIController.hideSlidersContainer();
    }
            
    // Lees de drie waarden uit localStorage (of 0 als leeg)
    const totaalA = Number(localStorage.getItem('res_n_dierlijk') || 0);
    const totaalB = Number(localStorage.getItem('res_n_totaal')  || 0);
    const totaalC = Number(localStorage.getItem('res_p_totaal')  || 0);

    // Stel gebruiksruimte in
    StateManager.setGebruiksruimte(totaalA, totaalB, totaalC);

    // 1. Vul de inputs van stap 2 met localStorage-waarden
    [
      ['res_n_dierlijk', 'prev_res_n_dierlijk'],
      ['res_n_totaal',  'prev_res_n_totaal'],
      ['res_p_totaal',  'prev_res_p_totaal']
    ].forEach(([key, prevId]) => {
      const val = localStorage.getItem(key);
      const input = document.getElementById(prevId);
      if (input) {
        if (val !== null) input.value = val;
        // 2. Schrijf wijzigingen direct terug
        input.addEventListener('input', () => {
          // a) Update localStorage
          const num = Number(input.value) || 0;
          localStorage.setItem(key, input.value);

          // b) Reset alle mest-UI naar beginstaat
          resetMestPlanUI();

          // c) Lees álle drie actuele waarden uit de DOM
          const a = Number(localStorage.getItem('res_n_dierlijk') || 0);
          const b = Number(localStorage.getItem('res_n_totaal')  || 0);
          const c = Number(localStorage.getItem('res_p_totaal')  || 0);
        
          // d) Geef ze als trio door aan je state manager
          StateManager.setGebruiksruimte(a, b, c);

          // e) Herteken sliders
          UIController.updateSliders();
        });
      }
    });
    
    // Initialiseer standaard sliders
    UIController.initStandardSliders();
    UIController.updateSliders();

    // Laad mestsoorten.json
    let mestsoortenData = {};
    try {
      const response = await fetch('/data/mestsoorten.json');
      mestsoortenData = await response.json();
      StateManager.setMestTypes(mestsoortenData);
      console.log("✅ mestsoorten.json geladen");
    } catch (err) {
      console.error("❌ Fout bij laden mestsoorten.json:", err);
      alert("⚠️ Kan mestsoorten.json niet laden.");
      return;
    }

    // Voeg event handlers toe voor mest-knoppen
    document.querySelectorAll('.mest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const type = btn.dataset.type;
        const animal = btn.dataset.animal;
        const key = `${type}-${animal}`;

        if (btn.classList.contains('active')) {
          const jsonType = { 'drijfmest': 'drijfmest', 'vastemest': 'vaste_mest', 'overig': 'overig' }[type];
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
    console.error("❌ Fout bij initialisatie van GLPK:", err);
    alert("⚠️ GLPK kon niet worden geladen. Controleer of het script correct is ingeladen.");
  }
}

// Start initialisatie bij window.onload
window.onload = initializeApp;
