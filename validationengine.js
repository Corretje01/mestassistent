/**
 * validationEngine.js
 * Validatieregels en grenscontrole
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';

export const ValidationEngine = (() => {

  /**
   * Controleer overschrijding van gebruiksruimte
   * @returns {string|null} foutmelding of null bij OK
   */
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

  /**
   * Controle of waarde binnen min/max slider valt
   * @param {number} value - voorgestelde waarde
   * @param {number} min - ondergrens
   * @param {number} max - bovengrens
   * @returns {boolean}
   */
  function isWithinBoundaries(value, min, max) {
    return (value >= min && value <= max);
  }

  /**
   * Bepaal max tonnage per mestsoort o.b.v. gebruiksruimte
   * @param {string} id - mestsoort id
   * @returns {number} maximale tonnage
   */
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

  /**
   * Controleer of een slider vergrendeld is
   * @param {string} id 
   * @returns {boolean}
   */
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
