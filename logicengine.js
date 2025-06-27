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
    const oudeState = StateManager.getState();
    const oudeTonnage = oudeState.actieveMest[id].ton;
    const deltaTon = newValue - oudeTonnage;
    if (deltaTon === 0) return;
  
    const mest = oudeState.actieveMest[id];
    const deltaNutriënten = {
      stikstof: deltaTon * (mest.N_kg_per_ton || 0),
      fosfaat: deltaTon * (mest.P_kg_per_ton || 0),
      kalium: deltaTon * (mest.K_kg_per_ton || 0),
      organisch: deltaTon * ((mest.OS_percent || 0) / 100),
      financieel: deltaTon * ((mest.Inkoopprijs_per_ton || 0) + 10)
    };
  
    // Check welke nutriënten gelocked zijn
    const vergrendeldeNutriënten = Object.keys(deltaNutriënten).filter(n => StateManager.isLocked(n));
    if (vergrendeldeNutriënten.length === 0) {
      StateManager.setMestTonnage(id, newValue);
      return;
    }
  
    // Zoek alle andere niet-vergrendelde mestsoorten
    const actieveMest = oudeState.actieveMest;
    const beschikbareMest = Object.entries(actieveMest)
      .filter(([key]) => key !== id && !StateManager.isLocked(key))
      .map(([key, mest]) => ({ id: key, mest }));
  
    if (beschikbareMest.length === 0) {
      UIController.shake(id);
      return;
    }
  
    // Probeer elk vergrendeld nutriënt te compenseren
    let compensatieGelukt = true;
    const aanpassingen = {};
  
    for (const nut of vergrendeldeNutriënten) {
      const delta = deltaNutriënten[nut];
      if (delta === 0) continue;
  
      // Bepaal bijdrage van iedere mestsoort aan deze nutriënt
      const mestMetGehalte = beschikbareMest
        .map(({ id, mest }) => {
          const gehalte = {
            stikstof: mest.N_kg_per_ton,
            fosfaat: mest.P_kg_per_ton,
            kalium: mest.K_kg_per_ton,
            organisch: (mest.OS_percent || 0) / 100,
            financieel: (mest.Inkoopprijs_per_ton || 0) + 10
          }[nut] || 0;
          return { id, gehalte, huidigTon: mest.ton };
        })
        .filter(m => m.gehalte > 0);
  
      const totaalGehalte = mestMetGehalte.reduce((s, m) => s + m.gehalte, 0);
  
      if (totaalGehalte === 0) {
        compensatieGelukt = false;
        break;
      }
  
      // Bereken ton-aanpassingen per mestsoort
      mestMetGehalte.forEach(m => {
        const aandeel = m.gehalte / totaalGehalte;
        const tonDelta = -delta * aandeel / m.gehalte; // tegenovergestelde richting
        aanpassingen[m.id] = (aanpassingen[m.id] || 0) + tonDelta;
      });
    }
  
    // Check of alle aanpassingen binnen limieten vallen
    if (!compensatieGelukt) {
      UIController.shake(id);
      return;
    }
  
    for (const [key, tonDelta] of Object.entries(aanpassingen)) {
      const huidig = oudeState.actieveMest[key].ton;
      const nieuw = huidig + tonDelta;
      if (nieuw < 0 || nieuw > 650) {
        UIController.shake(id);
        return;
      }
    }
  
    // ✅ Alle aanpassingen zijn geldig → toepassen
    StateManager.setMestTonnage(id, newValue);
    for (const [key, tonDelta] of Object.entries(aanpassingen)) {
      const huidig = oudeState.actieveMest[key].ton;
      StateManager.setMestTonnage(key, huidig + tonDelta);
    }
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
