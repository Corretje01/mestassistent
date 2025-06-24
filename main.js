/**
 * main.js
 * Entrypoint voor de mestplan applicatie
 */

import { StateManager } from './statemanager.js';
import { UIController } from './uicontroller.js';

// Kleine utility
function getQueryParams() {
  const params = {};
  window.location.search.substring(1).split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return params;
}

async function initApp() {
  // Gebruiksruimte ophalen uit query params
  const query = getQueryParams();
  const totaalA = Number(query['totaalA'] || 0);
  const totaalB = Number(query['totaalB'] || 0);
  const totaalC = Number(query['totaalC'] || 0);
  StateManager.setGebruiksruimte(totaalA, totaalB, totaalC);

  // Mestsoorten ophalen
  try {
    const response = await fetch('/data/mestsoorten.json');
    const mestData = await response.json();
    StateManager.setMestTypes(mestData);

    // Init standaard nutrientensliders
    UIController.initStandardSliders();
    UIController.updateSliders();

    // Knoppen activeren
    initMestSelectieButtons();

  } catch (err) {
    console.error('❌ Kan mestdata niet laden:', err);
    alert('Fout bij laden mestdata');
  }
}

function initMestSelectieButtons() {
  document.querySelectorAll('.mest-btn').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.type;
      const animal = button.dataset.animal;
      const mestData = StateManager.getState().mestTypes;

      if (!mestData[type] || !mestData[type][animal]) {
        alert(`Mestsoort ${type} - ${animal} niet gevonden in data`);
        return;
      }

      const id = `${type}-${animal}`;
      if (StateManager.getActieveMest()[id]) {
        alert(`Mestsoort ${id} is al toegevoegd`);
        return;
      }

      StateManager.addMestType(id, {
        ...mestData[type][animal],
        label: `${capitalize(type)} ${capitalize(animal)}`
      });

      UIController.initMestsoortenSliders();
      UIController.updateSliders();
    });
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

window.addEventListener('DOMContentLoaded', () => {
  initApp();
});
