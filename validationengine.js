/**
 * validationengine.js
 * Validatieregels en grenscontrole
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';

export const ValidationEngine = (() => {

  function checkUsageLimits() {
    const total = CalculationEngine.calculateTotalNutrients(true);
    const ruimte = StateManager.getGebruiksruimte();

    if (ruimte.A && total.N > ruimte.A) {
      return `Stikstof uit dierlijke mest overschrijdt maximum (${total.N.toFixed(1)} > ${ruimte.A})`;
    }
    if (ruimte.C && total.P > ruimte.C) {
      return `Fosfaat overschrijdt maximum (${total.P.toFixed(1)} > ${ruimte.C})`;
    }
    if (ruimte.B && total.N > ruimte.B) {
      return `Totale stikstof overschrijdt maximum (${total.N.toFixed(1)} > ${ruimte.B})`;
    }
    return null;
  }

  function isWithinBoundaries(value, min, max) {
    return (value >= min && value <= max);
  }

  function getMaxTonnage(id) {
    const ruimte = StateManager.getGebruiksruimte();
    const mest = StateManager.getActieveMest()[id];
    if (!mest) return 650;

    const N = mest.N_kg_per_ton || 0;
    const P = mest.P_kg_per_ton || 0;

    let maxN = Infinity;
    let maxP = Infinity;

    if (N > 0 && ruimte.A) {
      maxN = ruimte.A / N;
    }
    if (P > 0 && ruimte.C) {
      maxP = ruimte.C / P;
    }

    return Math.floor(Math.min(maxN, maxP, 650));
  }

  function isLocked(id) {
    return StateManager.isLocked(id);
  }

  return {
    checkUsageLimits,
    isWithinBoundaries,
    getMaxTonnage,
    isLocked
  }

})();
