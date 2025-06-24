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

    // Voorbeeld: twee standaard mestsoorten activeren
    StateManager.addMestType('drijfmest-koe', {
      ...mestData.drijfmest.koe,
      label: 'Drijfmest Koe'
    });
    StateManager.addMestType('drijfmest-varken', {
      ...mestData.drijfmest.varken,
      label: 'Drijfmest Varken'
    });

    // UI initialiseren
    UIController.initStandardSliders();
    UIController.initMestsoortenSliders();
    UIController.updateSliders();

  } catch (err) {
    console.error('❌ Kan mestdata niet laden:', err);
    alert('Fout bij laden mestdata');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initApp();
});
