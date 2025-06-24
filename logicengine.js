/**
 * logicengine.js
 * Centrale wijzigingslogica: bidirectionele synchronisatie
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { UIController } from './uicontroller.js';

export const LogicEngine = (() => {

  function onSliderChange(sliderId, newValue) {
    if (ValidationEngine.isLocked(sliderId)) {
      UIController.shake(sliderId);
      return;
    }

    if (isStandardNutrient(sliderId)) {
      handleNutrientChange(sliderId, newValue);
    } else if (sliderId === 'kunststikstof') {
      StateManager.setKunstmest(newValue);
    }

    UIController.updateSliders();

    const fout = ValidationEngine.checkUsageLimits();
    if (fout) {
      console.warn(fout);
      UIController.shake(sliderId);
    }
  }

  function handleNutrientChange(nutrientId, targetValue) {
    const actieveMest = StateManager.getActieveMest();
    const huidigeWaarde = CalculationEngine.calculateTotalNutrients(true)[mapToTotalKey(nutrientId)];
    const delta = targetValue - huidigeWaarde;

    const aanpasbare = Object.keys(actieveMest).filter(id => !ValidationEngine.isLocked(id));
    if (aanpasbare.length === 0) {
      console.warn("⚠️ Geen mestsoorten beschikbaar voor correctie");
      UIController.shake(nutrientId);
      return;
    }

    const totaalBasis = aanpasbare.reduce((sum, id) => {
      const mest = actieveMest[id];
      const gehalte = getNutrientContent(mest, nutrientId);
      return sum + (gehalte * mest.ton);
    }, 0);

    if (totaalBasis === 0) {
      console.warn("⚠️ Geen bijdragebasis voor verdeling.");
      UIController.shake(nutrientId);
      return;
    }

    for (const id of aanpasbare) {
      const mest = actieveMest[id];
      const gehalte = getNutrientContent(mest, nutrientId);
      const aandeel = (gehalte * mest.ton) / totaalBasis;
      const correctieNut = delta * aandeel;
      const tonCorrectie = gehalte > 0 ? (correctieNut / gehalte) : 0;
      const nieuweTon = mest.ton + tonCorrectie;

      const maxTon = ValidationEngine.getMaxTonnage(id);
      if (!ValidationEngine.isWithinBoundaries(nieuweTon, 0, maxTon)) {
        console.warn(`⛔ Correctie bij ${id} overschrijdt grenzen`);
        UIController.shake(id);
        return;
      }

      StateManager.setMestTonnage(id, nieuweTon);
    }
  }

  function isStandardNutrient(id) {
    return ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel'].includes(id);
  }

  function mapToTotalKey(id) {
    if (id === 'financieel') return 'FIN';
    if (id === 'organisch') return 'OS';
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  function getNutrientContent(mest, nutrientId) {
    switch (nutrientId) {
      case 'stikstof': return mest.N_kg_per_ton || 0;
      case 'fosfaat': return mest.P_kg_per_ton || 0;
      case 'kalium': return mest.K_kg_per_ton || 0;
      case 'organisch': return (mest.OS_percent || 0) / 100;
      case 'financieel': return (mest.Inkoopprijs_per_ton || 0) + 10;
      default: return 0;
    }
  }

  return { onSliderChange };

})();
