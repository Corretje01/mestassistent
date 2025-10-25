/**
 * calculationengine.js
 * Rekenlogica voor nutriënten, financieel én hypothetische scenario's
 */

import { StateManager } from './statemanager.js';

export const CalculationEngine = (() => {
  /**
   * Berekent alle nutriëntsommen en totaal financieel voor huidige app-state.
   * @param {boolean} inclusiefKunstmest - of kunstmest ook moet meetellen (voor N).
   * @returns {Object} totaal per nutriënt en financieel
   */
  function berekenNutriënten(inclusiefKunstmest = false) {
    const actieveMest = StateManager.getActieveMest();
    let totaal = { stikstof: 0, fosfaat: 0, kalium: 0, organisch: 0, financieel: 0 };

    for (const mest of Object.values(actieveMest)) {
      totaal.stikstof  += mest.ton * (mest.N_kg_per_ton || 0);
      totaal.fosfaat   += mest.ton * (mest.P_kg_per_ton || 0);
      totaal.kalium    += mest.ton * (mest.K_kg_per_ton || 0);
      totaal.organisch += mest.ton * ((mest.OS_percent || 0) / 100);
      totaal.financieel += mest.ton * ((mest.Inkoopprijs_per_ton || 0) + 10); // inclusief transportkosten
    }

    if (inclusiefKunstmest) {
      totaal.stikstof += StateManager.getKunstmest();
    }

    return totaal;
  }

  /**
   * Berekent nutriëntsommen voor een *arbitraire* (hypothetische) state.
   * Hiermee kun je scenario's (zoals slider-wijzigingen) valideren zonder de app-state te wijzigen.
   * @param {Object} state - deep copy van StateManager.getState() of custom scenario-object
   * @param {boolean} inclusiefKunstmest - optioneel: neem kunstmestveld mee (indien aanwezig in state)
   * @returns {Object} totaal per nutriënt en financieel
   */
  function berekenNutriëntenVoorState(state, inclusiefKunstmest = false) {
    const actieveMest = state.actieveMest;
    let totaal = { stikstof: 0, fosfaat: 0, kalium: 0, organisch: 0, financieel: 0 };

    for (const mest of Object.values(actieveMest)) {
      totaal.stikstof  += mest.ton * (mest.N_kg_per_ton || 0);
      totaal.fosfaat   += mest.ton * (mest.P_kg_per_ton || 0);
      totaal.kalium    += mest.ton * (mest.K_kg_per_ton || 0);
      totaal.organisch += mest.ton * ((mest.OS_percent || 0) / 100);
      totaal.financieel += mest.ton * ((mest.Inkoopprijs_per_ton || 0) + 10);
    }

    // Werkt ook bij hypothetisch kunstmest-veld in state
    if (inclusiefKunstmest && (state.kunstmest !== undefined)) {
      totaal.stikstof += state.kunstmest;
    }

    return totaal;
  }

  return {
    berekenNutriënten,
    berekenNutriëntenVoorState
  };

})();
