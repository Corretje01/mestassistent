/**
 * calculationengine.js
 * Rekenlogica voor nutrienten en financieel
 */

import { StateManager } from './statemanager.js';

export const CalculationEngine = (() => {

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

  return {
    berekenNutriënten
  };

})();
