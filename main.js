/**
 * main.js
 * Centrale applicatie-controller
 */

import { StateManager } from './statemanager.js';
import { UIController } from './uicontroller.js';
import { LogicEngine } from './logicengine.js';

// Eerst: haal gebruiksruimte parameters op uit URL
const queryParams = new URLSearchParams(window.location.search);
const totaalA = Number(queryParams.get('totaalA') || 0);
const totaalB = Number(queryParams.get('totaalB') || 0);
const totaalC = Number(queryParams.get('totaalC') || 0);

if (!totaalA || !totaalB || !totaalC) {
  alert("⚠️ Waarschuwing: de gebruiksruimte kon niet worden geladen uit stap 1.");
}

// Initialiseer centrale state
StateManager.init({
  ruimte: { A: totaalA, B: totaalB, C: totaalC },
  actieveMest: {},
  kunstmest: 0,
  locks: {}
});

// Init standaard sliders
UIController.initStandardSliders();
UIController.updateSliders();  // eerste rendering

// Laad mestsoorten.json dynamisch
let mestsoortenData = {};

fetch('/data/mestsoorten.json')
  .then(response => response.json())
  .then(data => {
    mestsoortenData = data;
    console.log("✅ mestsoorten.json geladen");
  })
  .catch(err => {
    console.error("❌ Fout bij laden mestsoorten.json:", err);
    alert("⚠️ Fout bij laden mestsoorten.json");
  });

// Event listeners voor de mest-knoppen
document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');

    const type = btn.dataset.type;
    const animal = btn.dataset.animal;
    const key = `${type}-${animal}`;

    if (btn.classList.contains('active')) {
      // Toevoegen
      const jsonType = {
        'drijfmest': 'drijfmest',
        'vastemest': 'vaste_mest',
        'overig': 'overig'
      }[type];

      const mestData = mestsoortenData?.[jsonType]?.[animal];
      if (!mestData) {
        console.warn(`⚠️ Geen mestdata voor ${key}`);
        return;
      }

      StateManager.addMestsoort(key, {
        ...mestData,
        ton: 0,
        totaal: {
          N: 0, P: 0, K: 0, OS: 0, DS: 0, BG: 0, FIN: 0
        }
      });

      // Bereken initieel maximaal toelaatbare tonnage
      const maxTon = ValidationEngine.getMaxTonnage(key);
      UIController.renderMestsoortSlider(key, `${type} ${animal}`, maxTon);

    } else {
      // Verwijderen
      StateManager.removeMestsoort(key);
      const group = document.getElementById(`group-${key}`);
      if (group) group.remove();
    }

    UIController.updateSliders();
  });
});

// Globale event handlers voor slider changes
// (Event listeners staan al direct op de sliders in UIController)
// Alleen main.js coördineert geen logica meer zelf
