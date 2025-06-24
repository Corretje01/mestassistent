/**
 * main.js
 * Entrypoint voor de mestplan applicatie
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { UIController } from './uicontroller.js';

// Utility: lees query parameters
function getQueryParams() {
  const params = {};
  window.location.search.substring(1).split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return params;
}

async function initApp() {
  // 1️⃣ Lees query params voor gebruiksruimte
  const query = getQueryParams();
  const totaalA = Number(query['totaalA'] || 0);
  const totaalB = Number(query['totaalB'] || 0);
  const totaalC = Number(query['totaalC'] || 0);

  StateManager.setGebruiksruimte(totaalA, totaalB, totaalC);

  // 2️⃣ Laad mestsoorten data
  try {
    const response = await fetch('/data/mestsoorten.json');
    const mestData = await response.json();
    StateManager.setMestTypes(mestData);
    console.log('✅ mestsoorten.json geladen');
  } catch (err) {
    console.error('❌ Fout bij laden mestsoorten.json:', err);
    alert('Fout bij laden mestdata.');
    return;
  }

  // 3️⃣ Initialiseer UI
  UIController.initStandardSliders();
  UIController.updateSliders();
}

// Start app na DOM geladen
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});
