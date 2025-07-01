/**
 * logicengine.js
 * Bevat de centrale rekenlogica voor sliderinteractie
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { UIController } from './uicontroller.js';

export const LogicEngine = (() => {

  function onSliderChange(id, newValue) {
    console.log(`🟡 Slider wijziging: ${id} → ${newValue}`);

    const sliderEl = document.getElementById(`slider-${id}`);
    if (!sliderEl) return;

    if (sliderEl.disabled || StateManager.isLocked(id)) {
      UIController.shake(id);
      return;
    }

    if (!isWithinSliderLimits(sliderEl, newValue)) {
      UIController.shake(id);
      return;
    }

    if (id === 'kunststikstof') {
      StateManager.setKunstmest(newValue);
      updateStikstofMaxDoorKunstmest();
    } else if (isNutrientSlider(id)) {
      console.log(`⚙️ Nutriëntenslider ${id} wordt gewijzigd → LP wordt aangeroepen`);
      handleNutrientChangeViaLP(id, newValue);
    } else {
      console.log(`⚙️ Mestslider ${id} wordt gewijzigd → directe berekening`);
      handleMestSliderChange(id, newValue);
    }

    UIController.updateSliders();
    checkGlobalValidation();
  }

  function handleMestSliderChange(id, newValue) {
    StateManager.setMestTonnage(id, newValue);
  }

  function handleNutrientChangeViaLP(nutId, targetValue) {
    const state = StateManager.getState();
    const actieveMest = state.actieveMest;

    const model = {
      optimize: 'totaleTonnage',
      opType: 'min',
      constraints: {},
      variables: {},
      ints: {}
    };

    for (const [id, mest] of Object.entries(actieveMest)) {
      if (StateManager.isLocked(id)) continue;

      model.variables[id] = { totaleTonnage: 1 };

      for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']) {
        model.variables[id][nut] = getGehaltePerNutriënt(nut, mest);
      }

      model.ints[id] = 0;
      model.constraints[id] = { min: 0 }; // mesthoeveelheid moet positief zijn
    }

    for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']) {
      if (StateManager.isLocked(nut)) {
        const huidig = CalculationEngine.berekenNutriënten(false)[nut];
        model.constraints[nut] = { equal: huidig };
      }
    }

    model.constraints[nutId] = { equal: targetValue };

    console.log('📦 LP-model opgebouwd: ', model);

    try {
      const resultaat = window.solver.Solve(model);
      console.log('📈 LP-resultaat: ', resultaat);

      if (!resultaat.feasible) {
        console.warn("⚠️ LP niet oplosbaar met constraints", model.constraints);
        console.warn("🔍 Resultaat ondanks 'infeasible':", resultaat);
        throw new Error("Onoplosbaar LP-model");
      }

      for (const id of Object.keys(actieveMest)) {
        if (StateManager.isLocked(id)) continue;
        if (resultaat[id] !== undefined) {
          StateManager.setMestTonnage(id, resultaat[id]);
        }
      }
    } catch (err) {
      console.log(`❌ LP-optimalisatie gefaald (${nutId}):`, err.message);
      UIController.shake(nutId);
    }
  }

  function getGehaltePerNutriënt(nut, mest) {
    return mest[nut] ?? 0;
  }

  function isWithinSliderLimits(sliderEl, waarde) {
    const min = parseFloat(sliderEl.min);
    const max = parseFloat(sliderEl.max);
    return waarde >= min && waarde <= max;
  }

  function isNutrientSlider(id) {
    return ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel'].includes(id);
  }

  function updateStikstofMaxDoorKunstmest() {
    // Eventueel herberekening van maximum N uit mest afhankelijk van kunstmestinput
    // Placeholder voor toekomstige logica
  }

  function checkGlobalValidation() {
    // Validatie: bijvoorbeeld check op max gebruiksruimte
    // Placeholder voor toekomstige logica
  }

  return { onSliderChange };

})();
