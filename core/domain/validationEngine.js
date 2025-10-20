/**
 * validationengine.js
 * Validatieregels voor maximale gebruiksruimte
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';

export const ValidationEngine = (() => {

  function overschrijdtMaxToegestaneWaarden() {
    const ruimte = StateManager.getGebruiksruimte();
    const nutriëntenDierlijk = CalculationEngine.berekenNutriënten(false);
    const nutriëntenInclKunstmest = CalculationEngine.berekenNutriënten(true);

    if (ruimte.A && nutriëntenDierlijk.stikstof > ruimte.A) {
      return 'Stikstof uit dierlijke mest overschrijdt maximum';
    }
    if (ruimte.C && nutriëntenDierlijk.fosfaat > ruimte.C) {
      return 'Fosfaat overschrijdt maximum';
    }
    if (ruimte.B && nutriëntenInclKunstmest.stikstof > ruimte.B) {
      return 'Totale stikstof (incl. kunstmest) overschrijdt maximum';
    }
    return null;
  }

  function getMaxKunstmest() {
    const ruimte = StateManager.getGebruiksruimte();
    const nutriëntenDierlijk = CalculationEngine.berekenNutriënten(false);
    return Math.max(0, ruimte.B - Math.min(nutriëntenDierlijk.stikstof, ruimte.A));
  }

  function getMaxTonnage(id) {
    const ruimte = StateManager.getGebruiksruimte();
    const mest = StateManager.getActieveMest()[id];
    if (!mest) return 650;

    let maxN = Infinity;
    let maxP = Infinity;

    if (mest.N_kg_per_ton > 0) {
      maxN = ruimte.A / mest.N_kg_per_ton;
    }
    if (mest.P_kg_per_ton > 0) {
      maxP = ruimte.C / mest.P_kg_per_ton;
    }

    return Math.floor(Math.min(maxN, maxP, 650));
  }

  return {
    overschrijdtMaxToegestaneWaarden,
    getMaxKunstmest,
    getMaxTonnage
  };

})();
