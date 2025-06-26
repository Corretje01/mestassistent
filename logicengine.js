/**
 * logicengine.js
 * Centrale logica voor sliderverwerking en validatie
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { UIController } from './uicontroller.js';

export const LogicEngine = (() => {
  function onSliderChange(id, value) {
    if (StateManager.isLocked(id)) {
      UIController.shake(id);
      return;
    }

    const isMestsoort = StateManager.getActieveMest()[id] !== undefined;
    const isKunstmest = id === 'kunststikstof';
    const isNutriënt = ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel'].includes(id);

    if (isMestsoort) {
      StateManager.setMestTonnage(id, value);
      UIController.updateSliders();
      return;
    }

    if (isKunstmest) {
      StateManager.setKunstmest(value);

      const gebruiksruimte = StateManager.getGebruiksruimte();
      const totaalDierlijk = CalculationEngine.calculateTotalNutrients(false);
      const maxKunstmest = Math.max(0, gebruiksruimte.B - Math.min(totaalDierlijk.N, gebruiksruimte.A));

      if (StateManager.isLocked('stikstof') && value > maxKunstmest) {
        UIController.shake('kunststikstof');
        StateManager.setKunstmest(maxKunstmest);
      }
      UIController.updateSliders();
      return;
    }

    if (isNutriënt) {
      const resultaat = ValidationEngine.checkUsageLimits(id, value);
      if (!resultaat) {
        UIController.shake(id);
        return;
      }

      UIController.updateSliders();
    }
  }

  return { onSliderChange };
})();
