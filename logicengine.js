/**
 * logicengine.js
 * Kernlogica bij sliderinteracties met ondersteuning voor locked nutriënten
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
    } else if (isNutrientSlider(id)) {
      handleNutrientChange(id, newValue);
    } else {
      handleMestSliderChange(id, newValue);
    }

    UIController.updateSliders();
    checkGlobalValidation();
  }

  function handleNutrientChange(nutId, newValue) {
    const oudeNut = CalculationEngine.berekenNutriënten(false)[nutId] || 0;
    const delta = newValue - oudeNut;

    const actieveMest = StateManager.getActieveMest();
    const mestKeys = Object.keys(actieveMest).filter(id => !StateManager.isLocked(id));
    if (mestKeys.length === 0) {
      UIController.shake(nutId);
      return;
    }

    const bijdragen = mestKeys.map(id => {
      const mest = actieveMest[id];
      const gehalte = getGehaltePerNutriënt(nutId, mest);
      return { id, gehalte, huidig: mest.ton };
    }).filter(b => b.gehalte > 0);

    const totaal = bijdragen.reduce((sum, b) => sum + b.gehalte, 0);
    if (totaal === 0) {
      UIController.shake(nutId);
      return;
    }

    for (const b of bijdragen) {
      const aandeel = b.gehalte / totaal;
      const tonDelta = delta * aandeel / b.gehalte;
      const nieuw = b.huidig + tonDelta;
      if (nieuw < 0 || nieuw > 650) {
        UIController.shake(nutId);
        return;
      }
    }

    for (const b of bijdragen) {
      const aandeel = b.gehalte / totaal;
      const tonDelta = delta * aandeel / b.gehalte;
      StateManager.setMestTonnage(b.id, b.huidig + tonDelta);
    }
  }

  function handleMestSliderChange(mestId, newValue) {
    const oudeState = StateManager.getState();
    const mest = oudeState.actieveMest[mestId];
    const oudeTon = mest.ton;
    const deltaTon = newValue - oudeTon;

    if (deltaTon === 0) return;

    const deltaNut = berekenDeltaNutriënten(mest, deltaTon);
    const gelockteNutr = Object.keys(deltaNut).filter(n => StateManager.isLocked(n) && deltaNut[n] !== 0);
    if (gelockteNutr.length === 0) {
      StateManager.setMestTonnage(mestId, newValue);
      return;
    }

    const actieveMest = oudeState.actieveMest;
    const compenseerbareMest = Object.entries(actieveMest)
      .filter(([id]) => id !== mestId && !StateManager.isLocked(id))
      .map(([id, mest]) => ({ id, mest }));

    if (compenseerbareMest.length === 0) {
      UIController.shake(mestId);
      return;
    }

    const aanpassingen = {};

    for (const nut of gelockteNutr) {
      const delta = deltaNut[nut];
      const metGehalte = compenseerbareMest
        .map(m => ({
          id: m.id,
          gehalte: getGehaltePerNutriënt(nut, m.mest),
          huidig: m.mest.ton
        }))
        .filter(m => m.gehalte !== 0);

      const totaal = metGehalte.reduce((s, m) => s + m.gehalte, 0);
      if (totaal === 0) {
        UIController.shake(mestId);
        return;
      }

      for (const m of metGehalte) {
        const aandeel = m.gehalte / totaal;
        const tonDelta = -delta * aandeel / m.gehalte;
        aanpassingen[m.id] = (aanpassingen[m.id] || 0) + tonDelta;
      }
    }

    // Validatie vóór toepassen
    for (const [id, tonDelta] of Object.entries(aanpassingen)) {
      const huidig = actieveMest[id].ton;
      const nieuw = huidig + tonDelta;
      if (nieuw < 0 || nieuw > 650) {
        UIController.shake(mestId);
        return;
      }
    }

    // ✅ Toepassen
    StateManager.setMestTonnage(mestId, newValue);
    for (const [id, tonDelta] of Object.entries(aanpassingen)) {
      const huidig = actieveMest[id].ton;
      StateManager.setMestTonnage(id, huidig + tonDelta);
    }
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

  function isWithinSliderLimits(id, waarde) {
    const slider = document.getElementById(`slider-${id}`);
    if (!slider) return true;
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 650);
    return waarde >= min && waarde <= max;
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
    const foutmelding = ValidationEngine.overschrijdtMaxToegestaneWaarden();
    if (foutmelding) {
      console.warn("❌ Overschrijding:", foutmelding);
    }
  }

  return {
    onSliderChange
  };

})();
