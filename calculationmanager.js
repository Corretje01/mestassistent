/**
 * calculationEngine.js
 * Pure rekenlogica voor mestplan applicatie
 */

import { StateManager } from './statemanager.js';

export const CalculationEngine = (() => {

  /**
   * Bereken totale nutriënten over alle actieve mestsoorten
   * @param {boolean} inclusiefKunstmest - of kunstmest moet worden meegeteld
   * @returns {Object} totaalwaarden voor N, P, K, OS, DS, BG, FIN
   */
  function calculateTotalNutrients(inclusiefKunstmest = false) {
    const actieveMest = StateManager.getActieveMest();

    const totals = {
      N: 0,
      P: 0,
      K: 0,
      OS: 0,
      DS: 0,
      BG: 0,
      FIN: 0
    };

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

  /**
   * Bereken nutriënten voor 1 specifieke mestsoort bij gegeven tonnage
   * @param {Object} mestData - data object van mestsoort
   * @param {number} ton - tonnage
   * @returns {Object} berekende waarden
   */
  function calculatePerTon(mestData, ton) {
    return {
      N: ton * (mestData.N_kg_per_ton || 0),
      P: ton * (mestData.P_kg_per_ton || 0),
      K: ton * (mestData.K_kg_per_ton || 0),
      OS: ton * ((mestData.OS_percent || 0) / 100),
      DS: ton * ((mestData.DS_percent || 0) / 100),
      BG: ton * (mestData.biogaspotentieel_m3_per_ton || 0),
      FIN: ton * ((mestData.Inkoopprijs_per_ton || 0) + 10)
    };
  }

  return {
    calculateTotalNutrients,
    calculatePerTon
  }

})();
