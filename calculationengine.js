/**
 * calculationengine.js
 * Pure rekenlogica voor mestplan applicatie
 */

import { StateManager } from './statemanager.js';

export const CalculationEngine = (() => {

  function calculateTotalNutrients(inclusiefKunstmest = false) {
    const actieveMest = StateManager.getActieveMest();

    const totals = { N: 0, P: 0, K: 0, OS: 0, DS: 0, BG: 0, FIN: 0 };

    for (const key in actieveMest) {
      const mest = actieveMest[key];
      const ton = mest.ton || 0;
      totals.N  += ton * (mest.N_kg_per_ton || 0);
      totals.P  += ton * (mest.P_kg_per_ton || 0);
      totals.K  += ton * (mest.K_kg_per_ton || 0);
      totals.OS += ton * ((mest.OS_percent || 0) / 100);
      totals.DS += ton * ((mest.DS_percent || 0) / 100);
      totals.BG += ton * (mest.biogaspotentieel_m3_per_ton || 0);
      totals.FIN+= ton * ((mest.Inkoopprijs_per_ton || 0) + 10);
    }

    if (inclusiefKunstmest) {
      totals.N += StateManager.getKunstmest();
    }

    return totals;
  }

  return {
    calculateTotalNutrients
  }

})();
