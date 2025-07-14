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

    // Haal gebruiksruimte uit URL-queryparameters
    const queryParams = new URLSearchParams(window.location.search);
    const totaalA = Number(queryParams.get('totaalA') || 0);
    const totaalB = Number(queryParams.get('totaalB') || 0);
    const totaalC = Number(queryParams.get('totaalC') || 0);

    if (!totaalA || !totaalB || !totaalC) {
      alert("⚠️ Waarschuwing: gebruiksruimte ontbreekt. Controleer de invoer.");
      return;
    }

    // Stel gebruiksruimte in
    StateManager.setGebruiksruimte(totaalA, totaalB, totaalC);

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
