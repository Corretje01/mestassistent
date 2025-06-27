/**
 * logicengine.js
 * Alle kernlogica bij slider interacties inclusief financieel
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { UIController } from './uicontroller.js';

export const LogicEngine = (() => {

  function onSliderChange(id, newValue) {
    if (StateManager.isLocked(id)) {
      UIController.shake(id);
      return;
    }

    if (!isWithinSliderLimits(id, newValue)) {
      UIController.shake(id);
      return;
    }

    if (id === 'kunststikstof') {
      StateManager.setKunstmest(newValue);
      updateStikstofMaxDoorKunstmest();
    } 
    else if (isNutrientSlider(id)) {
      handleNutrientChange(id, newValue);
    } 
    else {
      handleMestSliderChange(id, newValue);
    }

    UIController.updateSliders();
    checkGlobalValidation();
  }

  function handleNutrientChange(id, newValue) {
    const actieveMest = StateManager.getActieveMest();
    const nutDierlijk = CalculationEngine.berekenNutriënten(false);
    const delta = newValue - (nutDierlijk[id] || 0);

    const mestKeys = Object.keys(actieveMest).filter(m => !StateManager.isLocked(m));
    if (mestKeys.length === 0) {
      UIController.shake(id);
      return;
    }

    const bijdragen = mestKeys.map(key => {
      const mest = actieveMest[key];
      let gehalte = 0;
      if (id === 'organisch') {
        gehalte = (mest.OS_percent || 0) / 100;
      } else if (id === 'stikstof') {
        gehalte = mest.N_kg_per_ton || 0;
      } else if (id === 'fosfaat') {
        gehalte = mest.P_kg_per_ton || 0;
      } else if (id === 'kalium') {
        gehalte = mest.K_kg_per_ton || 0;
      } else if (id === 'financieel') {
        gehalte = (mest.Inkoopprijs_per_ton || 0) + 10;
      }
      return { key, gehalte };
    }).filter(b => b.gehalte > 0);

    const totaalGehalte = bijdragen.reduce((sum, b) => sum + b.gehalte, 0);
    if (totaalGehalte === 0) {
      UIController.shake(id);
      return;
    }

    bijdragen.forEach(b => {
      const aandeel = b.gehalte / totaalGehalte;
      const mest = actieveMest[b.key];
      const tonDelta = delta * aandeel / b.gehalte;
      const nieuwTon = Math.max(0, mest.ton + tonDelta);
      StateManager.setMestTonnage(b.key, nieuwTon);
    });
  }

  function handleMestSliderChange(id, newValue) {
    StateManager.setMestTonnage(id, newValue);
  }

  function updateStikstofMaxDoorKunstmest() {
    const ruimte = StateManager.getGebruiksruimte();
    const nutDierlijk = CalculationEngine.berekenNutriënten(false);
    const maxDierlijk = Math.min(ruimte.A, ruimte.B - StateManager.getKunstmest());

    const stikstofSlider = document.getElementById('slider-stikstof');
    if (stikstofSlider) {
      stikstofSlider.max = maxDierlijk;
      if (StateManager.isLocked('stikstof') && nutDierlijk.stikstof > maxDierlijk) {
        StateManager.setKunstmest(Math.max(0, ruimte.B - nutDierlijk.stikstof));
        UIController.shake('kunststikstof');
      }
    }
  }

  function checkGlobalValidation() {
    const overschrijding = ValidationEngine.overschrijdtMaxToegestaneWaarden();
    if (overschrijding) {
      console.warn("❌ Overschrijding:", overschrijding);
    }
  }

  function isNutrientSlider(id) {
    return ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel'].includes(id);
  }

  function isWithinSliderLimits(id, waarde) {
    const slider = document.getElementById(`slider-${id}`);
    if (!slider) return true;

    const min = Number(slider.min || 0);
    const max = Number(slider.max || 650);
    return waarde >= min && waarde <= max;
  }

  return {
    onSliderChange
  };

})();
