/**
 * logicengine.js
 * Kernlogica met volledige compensatie bij gelockte nutriënten
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

  function handleMestSliderChange(mestId, newTon) {
    const oudeTon = StateManager.getActieveMest()[mestId]?.ton || 0;
    const deltaTon = newTon - oudeTon;

    if (deltaTon === 0) return;

    // Eerst lokaal toepassen
    StateManager.setMestTonnage(mestId, newTon);

    // Check of er gelockte nutriënten zijn
    const lockedNutriënten = ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']
      .filter(nut => StateManager.isLocked(nut));

    if (lockedNutriënten.length === 0) {
      return;  // geen compensatie nodig
    }

    const success = probeerCompensatieBijLockedNutrienten(mestId, deltaTon, lockedNutriënten);

    if (!success) {
      // rollback
      StateManager.setMestTonnage(mestId, oudeTon);
      UIController.shake(mestId);
    }
  }

  function probeerCompensatieBijLockedNutrienten(changedMestId, deltaTon, lockedNutriënten) {
    const actieveMest = StateManager.getActieveMest();
    const gehalteKeys = {
      stikstof: 'N_kg_per_ton',
      fosfaat: 'P_kg_per_ton',
      kalium: 'K_kg_per_ton',
      organisch: 'OS_percent',
      financieel: 'FIN_per_ton'  // niet in dataset, we berekenen hieronder
    };

    // Bepaal delta's per nutriënt
    const deltaMap = {};

    const mest = actieveMest[changedMestId];
    lockedNutriënten.forEach(nut => {
      let gehalte = 0;
      if (nut === 'organisch') {
        gehalte = (mest.OS_percent || 0) / 100;
      } else if (nut === 'financieel') {
        gehalte = (mest.Inkoopprijs_per_ton || 0) + 10;
      } else {
        gehalte = mest[gehalteKeys[nut]] || 0;
      }
      const verschil = deltaTon * gehalte;
      deltaMap[nut] = verschil;
    });

    // Filter beschikbare compenseerders
    const compenseerbareMest = Object.entries(actieveMest)
      .filter(([id, _]) => id !== changedMestId && !StateManager.isLocked(id));

    if (compenseerbareMest.length === 0) return false; // niets beschikbaar

    // Check per nutriënt of capaciteit toereikend is
    for (const nut of lockedNutriënten) {
      const delta = deltaMap[nut];
      if (Math.abs(delta) < 0.0001) continue; // niets te compenseren

      const beschikbare = compenseerbareMest
        .map(([id, mest]) => {
          let gehalte = 0;
          if (nut === 'organisch') {
            gehalte = (mest.OS_percent || 0) / 100;
          } else if (nut === 'financieel') {
            gehalte = (mest.Inkoopprijs_per_ton || 0) + 10;
          } else {
            gehalte = mest[gehalteKeys[nut]] || 0;
          }
          return { id, gehalte, ton: mest.ton };
        })
        .filter(m => m.gehalte > 0);

      if (beschikbare.length === 0) return false;

      // Bepaal per mestsoort max correctieruimte
      const capaciteit = beschikbare.map(m => {
        const min = 0;
        const max = 650;
        const corrTotMin = (min - m.ton) * m.gehalte;
        const corrTotMax = (max - m.ton) * m.gehalte;
        const maxCorrectie = delta > 0 ? Math.min(0, corrTotMin) : Math.max(0, corrTotMax);
        return Math.abs(maxCorrectie);
      });

      const totaalCapaciteit = capaciteit.reduce((sum, val) => sum + val, 0);
      if (totaalCapaciteit + 0.0001 < Math.abs(delta)) {
        return false;  // onvoldoende capaciteit
      }
    }

    // Als we hier zijn → capaciteit is toereikend, nu verdelen
    lockedNutriënten.forEach(nut => {
      const delta = deltaMap[nut];
      if (Math.abs(delta) < 0.0001) return;

      const beschikbare = compenseerbareMest
        .map(([id, mest]) => {
          let gehalte = 0;
          if (nut === 'organisch') {
            gehalte = (mest.OS_percent || 0) / 100;
          } else if (nut === 'financieel') {
            gehalte = (mest.Inkoopprijs_per_ton || 0) + 10;
          } else {
            gehalte = mest[gehalteKeys[nut]] || 0;
          }
          return { id, gehalte, ton: mest.ton };
        })
        .filter(m => m.gehalte > 0);

      const capaciteit = beschikbare.map(m => {
        const min = 0;
        const max = 650;
        const corrTotMin = (min - m.ton) * m.gehalte;
        const corrTotMax = (max - m.ton) * m.gehalte;
        const maxCorrectie = delta > 0 ? Math.min(0, corrTotMin) : Math.max(0, corrTotMax);
        return { id: m.id, maxNutriëntCorrectie: Math.abs(maxCorrectie), gehalte: m.gehalte };
      });

      const totaalCapaciteit = capaciteit.reduce((sum, m) => sum + m.maxNutriëntCorrectie, 0);

      capaciteit.forEach(m => {
        const aandeel = m.maxNutriëntCorrectie / totaalCapaciteit;
        const toegewezenNut = delta * aandeel;
        const tonCorrectie = -toegewezenNut / m.gehalte;
        const huidigeTon = StateManager.getActieveMest()[m.id].ton;
        StateManager.setMestTonnage(m.id, Math.max(0, huidigeTon + tonCorrectie));
      });
    });

    return true;
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
