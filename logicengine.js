/**
 * logicengine.js
 * Robuuste sliderverwerking met vergrendeling en compensatie
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { UIController } from './uicontroller.js';

export const LogicEngine = (() => {

  function onSliderChange(id, newValue) {
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
      handleNutrientChange(id, newValue);
    } else {
      handleMestSliderChange(id, newValue);
    }

    UIController.updateSliders();
    checkGlobalValidation();
  }

  function handleMestSliderChange(id, newValue) {
    const oudeState = StateManager.getState();
    const mest = oudeState.actieveMest[id];
    const deltaTon = newValue - mest.ton;
    if (deltaTon === 0) return;

    const deltaNut = berekenDeltaNutriënten(mest, deltaTon);
    const vergrendeldeNut = Object.keys(deltaNut).filter(n => StateManager.isLocked(n) && deltaNut[n] !== 0);
    if (vergrendeldeNut.length === 0) {
      StateManager.setMestTonnage(id, newValue);
      return;
    }

    const andereMest = Object.entries(oudeState.actieveMest)
      .filter(([key]) => key !== id && !StateManager.isLocked(key))
      .map(([key, mest]) => ({ id: key, mest }));

    const aanpassingen = {};

    for (const nut of vergrendeldeNut) {
      const delta = deltaNut[nut];
      const opties = andereMest
        .map(m => ({
          id: m.id,
          gehalte: getGehaltePerNutriënt(nut, m.mest),
          huidig: m.mest.ton
        }))
        .filter(m => m.gehalte !== 0);

      const totaalGehalte = opties.reduce((sum, o) => sum + o.gehalte, 0);
      if (totaalGehalte === 0) {
        UIController.shake(id);
        return;
      }

      for (const o of opties) {
        const aandeel = o.gehalte / totaalGehalte;
        const tonDelta = -delta * aandeel / o.gehalte;
        aanpassingen[o.id] = (aanpassingen[o.id] || 0) + tonDelta;
      }
    }

    // Validatie
    for (const [key, tonDelta] of Object.entries(aanpassingen)) {
      const huidig = oudeState.actieveMest[key].ton;
      const nieuw = huidig + tonDelta;
      if (nieuw < 0 || nieuw > 650) {
        UIController.shake(id);
        return;
      }
    }

    StateManager.setMestTonnage(id, newValue);
    for (const [key, tonDelta] of Object.entries(aanpassingen)) {
      const huidig = oudeState.actieveMest[key].ton;
      StateManager.setMestTonnage(key, huidig + tonDelta);
    }
  }

  function handleNutrientChange(nutId, newValue) {
    const huidigeNut = CalculationEngine.berekenNutriënten(false);
    const delta = newValue - (huidigeNut[nutId] || 0);
    if (delta === 0) return;

    const lockedNut = Object.keys(huidigeNut)
      .filter(n => StateManager.isLocked(n) && n !== nutId);

    const actieveMest = StateManager.getState().actieveMest;
    const vrijeMest = Object.entries(actieveMest)
      .filter(([id]) => !StateManager.isLocked(id))
      .map(([id, mest]) => ({ id, mest }));

    if (vrijeMest.length === 0) {
      UIController.shake(nutId);
      return;
    }

    const bijdragen = vrijeMest.map(({ id, mest }) => {
      const gehalte = getGehaltePerNutriënt(nutId, mest);
      return { id, gehalte, huidig: mest.ton };
    }).filter(b => b.gehalte !== 0);

    const totaalGehalte = bijdragen.reduce((sum, b) => sum + b.gehalte, 0);
    if (totaalGehalte === 0) {
      UIController.shake(nutId);
      return;
    }

    const nieuweVerdeling = {};
    for (const b of bijdragen) {
      const aandeel = b.gehalte / totaalGehalte;
      const tonDelta = delta * aandeel / b.gehalte;
      nieuweVerdeling[b.id] = b.huidig + tonDelta;
    }

    // Validatie inclusief behoud van locked nutriënten
    const hypothetisch = { ...actieveMest };
    for (const [id, nieuweTon] of Object.entries(nieuweVerdeling)) {
      if (nieuweTon < 0 || nieuweTon > 650) {
        UIController.shake(nutId);
        return;
      }
      hypothetisch[id] = { ...hypothetisch[id], ton: nieuweTon };
    }

    const herberekend = berekenNutriëntenVoorMest(hypothetisch);
    for (const locked of lockedNut) {
      if (Math.abs(herberekend[locked] - huidigeNut[locked]) > 0.01) {
        UIController.shake(nutId);
        return;
      }
    }

    // ✅ Toepassen
    for (const [id, nieuweTon] of Object.entries(nieuweVerdeling)) {
      StateManager.setMestTonnage(id, nieuweTon);
    }
  }

  function berekenNutriëntenVoorMest(mestset) {
    const totaal = { stikstof: 0, fosfaat: 0, kalium: 0, organisch: 0, financieel: 0 };
    for (const mest of Object.values(mestset)) {
      totaal.stikstof  += mest.ton * (mest.N_kg_per_ton || 0);
      totaal.fosfaat   += mest.ton * (mest.P_kg_per_ton || 0);
      totaal.kalium    += mest.ton * (mest.K_kg_per_ton || 0);
      totaal.organisch += mest.ton * ((mest.OS_percent || 0) / 100);
      totaal.financieel += mest.ton * ((mest.Inkoopprijs_per_ton || 0) + 10);
    }
    return totaal;
  }

  function berekenDeltaNutriënten(mest, tonDelta) {
    return {
      stikstof: tonDelta * (mest.N_kg_per_ton || 0),
      fosfaat: tonDelta * (mest.P_kg_per_ton || 0),
      kalium: tonDelta * (mest.K_kg_per_ton || 0),
      organisch: tonDelta * ((mest.OS_percent || 0) / 100),
      financieel: tonDelta * ((mest.Inkoopprijs_per_ton || 0) + 10)
    };
  }

  function getGehaltePerNutriënt(nut, mest) {
    switch (nut) {
      case 'stikstof': return mest.N_kg_per_ton || 0;
      case 'fosfaat': return mest.P_kg_per_ton || 0;
      case 'kalium': return mest.K_kg_per_ton || 0;
      case 'organisch': return (mest.OS_percent || 0) / 100;
      case 'financieel': return (mest.Inkoopprijs_per_ton || 0) + 10;
      default: return 0;
    }
  }

  function isNutrientSlider(id) {
    return ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel'].includes(id);
  }

  function isWithinSliderLimits(slider, value) {
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 650);
    return value >= min && value <= max;
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
    const fout = ValidationEngine.overschrijdtMaxToegestaneWaarden();
    if (fout) {
      console.warn("❌ Overschrijding:", fout);
    }
  }

  return {
    onSliderChange
  };

})();
