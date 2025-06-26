/**
 * logicengine.js
 * Centrale rekenlogica voor slidersynchronisatie
 */

import { StateManager } from './statemanager.js';
import { ValidationEngine } from './validationengine.js';
import { CalculationEngine } from './calculationengine.js';
import { UIController } from './uicontroller.js';

export const LogicEngine = (() => {
  /**
   * Handler voor elke sliderwijziging
   */
  function onSliderChange(sliderId, value, source = 'user') {
    if (!ValidationEngine.enforceLocks(sliderId, value)) return;
    if (!ValidationEngine.enforceBoundaries(sliderId, value)) return;

    if (CalculationEngine.isNutrient(sliderId)) {
      handleNutrientChange(sliderId, value);
    } else {
      handleMestChange(sliderId, value);
    }

    UIController.updateSliders();
  }

  /**
   * Handler voor nutriënt-slider
   */
  function handleNutrientChange(id, waarde) {
    const locked = StateManager.isLocked(id);
    if (id === 'kunststikstof') {
      const toegestaan = ValidationEngine.checkKunstmestConflict(waarde);
      if (!toegestaan) return;
      StateManager.setKunstmest(waarde);
    } else {
      const doelwaarden = CalculationEngine.getNutrientTargets();
      doelwaarden[id] = waarde;

      const actieveMest = StateManager.getActieveMest();
      const lockedNutrients = CalculationEngine.getLockedNutrients();
      const mestResultaat = CalculationEngine.berekenOptimaleMestverdeling(doelwaarden, actieveMest, lockedNutrients, id);

      if (!mestResultaat) {
        UIController.shake(id);
        return;
      }

      for (const mestId in mestResultaat) {
        StateManager.setMestTonnage(mestId, mestResultaat[mestId]);
      }
    }
  }

  /**
   * Handler voor mest-slider
   */
  function handleMestChange(id, waarde) {
    StateManager.setMestTonnage(id, waarde);

    const locked = CalculationEngine.getLockedNutrients();
    const actuele = CalculationEngine.calculateTotalNutrients(false);
    const doelwaarden = CalculationEngine.getNutrientTargets();

    // Probeer vergrendelingen te behouden
    const mestResultaat = CalculationEngine.berekenOptimaleMestverdeling(doelwaarden, StateManager.getActieveMest(), locked, null);

    if (!mestResultaat) {
      UIController.shake(id);
      return;
    }

    for (const mestId in mestResultaat) {
      StateManager.setMestTonnage(mestId, mestResultaat[mestId]);
    }
  }

  return { onSliderChange };
})();
