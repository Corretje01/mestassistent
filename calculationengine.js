/**
 * calculationengine.js
 * Berekeningen voor nutriënten en mestsoorten
 */

import { StateManager } from './statemanager.js';

export const CalculationEngine = (() => {
  function calculateTotalNutrients(inclKunstmest = false) {
    const actieve = StateManager.getActieveMest();
    const totaal = { N: 0, P: 0, K: 0, OS: 0, FIN: 0 };

    for (const [id, mest] of Object.entries(actieve)) {
      totaal.N += (mest.N_kg_per_ton || 0) * mest.ton;
      totaal.P += (mest.P_kg_per_ton || 0) * mest.ton;
      totaal.K += (mest.K_kg_per_ton || 0) * mest.ton;
      totaal.OS += (mest.OS_kg_per_ton || 0) * mest.ton;
      totaal.FIN += (mest.euro_per_ton || 0) * mest.ton;
    }

    if (inclKunstmest) {
      const kunstmest = StateManager.getKunstmest();
      const stikstofLocked = StateManager.isLocked('stikstof');
      const gebruiksruimte = StateManager.getGebruiksruimte();
      const maxKunstmest = Math.max(0, gebruiksruimte.B - Math.min(totaal.N, gebruiksruimte.A));

      if (stikstofLocked && kunstmest > maxKunstmest) {
        // Vergrendelde stikstofwaarde mag niet overschreden worden
        totaal.N += maxKunstmest; // gebruik maximaal toelaatbare
      } else {
        totaal.N += kunstmest;
      }
    }

    return totaal;
  }

  function calculateMaxAllowedTonnage(mestId) {
    const mest = StateManager.getActieveMest()[mestId];
    const ruimte = StateManager.getGebruiksruimte();
    if (!mest) return 650;

    const maxN = mest.N_kg_per_ton > 0 ? ruimte.A / mest.N_kg_per_ton : Infinity;
    const maxP = mest.P_kg_per_ton > 0 ? ruimte.C / mest.P_kg_per_ton : Infinity;

    return Math.floor(Math.min(maxN, maxP, 650));
  }

  function calculateTotalCost() {
    const actieve = StateManager.getActieveMest();
    let totaal = 0;
    for (const mest of Object.values(actieve)) {
      totaal += (mest.euro_per_ton || 0) * mest.ton;
    }
    return totaal;
  }

  function calculateDelta(original, updated) {
    const delta = {};
    for (const key of Object.keys(original)) {
      delta[key] = (updated[key] || 0) - (original[key] || 0);
    }
    return delta;
  }

  function calculateContributionsByNutrient(nutrientKey) {
    const actieve = StateManager.getActieveMest();
    const unlocked = Object.entries(actieve).filter(([id]) => !StateManager.isLocked(id));

    return unlocked.map(([id, mest]) => {
      let gehalte = 0;
      if (nutrientKey === 'N') gehalte = mest.N_kg_per_ton || 0;
      if (nutrientKey === 'P') gehalte = mest.P_kg_per_ton || 0;
      if (nutrientKey === 'K') gehalte = mest.K_kg_per_ton || 0;
      if (nutrientKey === 'OS') gehalte = mest.OS_kg_per_ton || 0;
      if (nutrientKey === 'FIN') gehalte = mest.euro_per_ton || 0;
      return { id, gehalte };
    }).filter(b => b.gehalte > 0);
  }

  return {
    calculateTotalNutrients,
    calculateMaxAllowedTonnage,
    calculateTotalCost,
    calculateDelta,
    calculateContributionsByNutrient
  };
})();
