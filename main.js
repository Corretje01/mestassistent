/**
 * main.js - Definitieve versie volgens modulaire architectuur
 */

import { StateManager } from './statemanager.js';
import { UIController } from './uicontroller.js';
import { LogicEngine } from './logicengine.js';

// Haal gebruiksruimte uit URL-queryparameters
const queryParams = new URLSearchParams(window.location.search);
const totaalA = Number(queryParams.get('totaalA') || 0);
const totaalB = Number(queryParams.get('totaalB') || 0);
const totaalC = Number(queryParams.get('totaalC') || 0);

if (!totaalA || !totaalB || !totaalC) {
  alert("⚠️ Waarschuwing: gebruiksruimte ontbreekt. Controleer de invoer.");
}

// Init centrale state
StateManager.setGebruiksruimte(totaalA, totaalB, totaalC);

// Init standaard sliders
UIController.initStandardSliders();
UIController.updateSliders();

// Laad mestsoorten.json dynamisch
let mestsoortenData = {};

fetch('/data/mestsoorten.json')
  .then(response => response.json())
  .then(data => {
    mestsoortenData = data;
    StateManager.setMestTypes(data);
    console.log("✅ mestsoorten.json geladen");
  })
  .catch(err => {
    console.error("❌ Fout bij laden mestsoorten.json:", err);
    alert("⚠️ Kan mestsoorten.json niet laden.");
  });

// Event handlers voor mest-knoppen
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
        console.warn(`⚠️ Geen mestdata gevonden voor ${key}`);
        return;
      }

      StateManager.addMestType(key, mestData);
      const maxTon = ValidationEngine.getMaxTonnage(key);
      UIController.renderMestsoortSlider(key, `${type} ${animal}`, maxTon);

    } else {
      // Verwijderen
      StateManager.removeMestType(key);
      const group = document.getElementById(`group-${key}`);
      if (group) group.remove();
    }

    UIController.updateSliders();
  });
});

// LogicEngine zorgt voor verdere synchronisatie via de sliders zelf

