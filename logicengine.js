/**
 * logicengine.js
 * Volledige capaciteit-bewuste logica inclusief multi-nutriënt locking + kunstmest-lock conflictbewaking
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { UIController } from './uicontroller.js';

export const LogicEngine = (() => {

  function onSliderChange(sliderId, newValue) {
    if (StateManager.isLocked(sliderId)) {
      UIController.shake(sliderId);
      return;
    }

    if (isStandardNutrient(sliderId)) {
      handleNutrientChange(sliderId, newValue);
    } else if (sliderId === 'kunststikstof') {
      handleKunstmestChange(newValue);
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
    const huidigeTotaal = CalculationEngine.calculateTotalNutrients(true);
    const lockedNutrients = getLockedNutrients().filter(n => n !== nutrientId);

    const deltaMap = {};
    deltaMap[nutrientId] = targetValue - huidigeTotaal[mapToTotalKey(nutrientId)];

    for (const lockedNut of lockedNutrients) {
      deltaMap[lockedNut] = 0; // locked nutrienten mogen niet wijzigen
    }

    const aanpasbare = Object.keys(actieveMest).filter(id => !StateManager.isLocked(id));

    if (aanpasbare.length === 0) {
      console.warn("⚠️ Geen mestsoorten beschikbaar voor correctie");
      UIController.shake(nutrientId);
      return;
    }

    const capaciteit = calculateCapacity(aanpasbare, deltaMap);
    if (!capaciteit.isFeasible) {
      console.warn("❌ Onvoldoende capaciteit om correctie toe te passen");
      shakeAllLocked();
      UIController.shake(nutrientId);
      return;
    }

    for (const mestId of aanpasbare) {
      const correctie = capaciteit.tonnageCorrections[mestId] || 0;
      const huidigeTon = actieveMest[mestId].ton;
      StateManager.setMestTonnage(mestId, huidigeTon + correctie);
    }
  }

  function calculateCapacity(aanpasbare, deltaMap) {
    const actieveMest = StateManager.getActieveMest();
    const nutriënten = Object.keys(deltaMap);
    const correcties = {};
    let isFeasible = true;

    for (const nut of nutriënten) {
      const delta = deltaMap[nut];
      if (Math.abs(delta) < 0.0001) continue;

      const mestCapaciteit = [];

      for (const mestId of aanpasbare) {
        const mest = actieveMest[mestId];
        const gehalte = getNutrientContent(mest, nut);
        if (gehalte === 0) continue;

        const huidig = mest.ton;
        const maxTon = ValidationEngine.getMaxTonnage(mestId);
        const corrMin = (0 - huidig) * gehalte;
        const corrMax = (maxTon - huidig) * gehalte;
        const maxCorrectieNut = delta > 0 ? Math.min(0, corrMin) : Math.max(0, corrMax);
        mestCapaciteit.push({
          mestId,
          gehalte,
          maxNutriëntCorrectie: Math.abs(maxCorrectieNut)
        });
      }

      const totaalMax = mestCapaciteit.reduce((sum, m) => sum + m.maxNutriëntCorrectie, 0);

      if (totaalMax + 0.00001 < Math.abs(delta)) {
        isFeasible = false;
        break;
      }

      for (const mest of mestCapaciteit) {
        const aandeel = mest.maxNutriëntCorrectie / totaalMax;
        const toegewezenNut = delta * aandeel;
        const tonCorrectie = -toegewezenNut / mest.gehalte;
        correcties[mest.mestId] = (correcties[mest.mestId] || 0) + tonCorrectie;
      }
    }

    if (isFeasible) {
      for (const mestId of aanpasbare) {
        const mest = actieveMest[mestId];
        const nieuweTon = mest.ton + (correcties[mestId] || 0);
        const maxTon = ValidationEngine.getMaxTonnage(mestId);
        if (!ValidationEngine.isWithinBoundaries(nieuweTon, 0, maxTon)) {
          isFeasible = false;
          break;
        }
      }
    }

    return { isFeasible, tonnageCorrections: correcties };
  }

  function handleKunstmestChange(newValue) {
    StateManager.setKunstmest(newValue);
  
    // Check conflict met gelockte stikstof
    if (StateManager.isLocked('stikstof')) {
      const nutDierlijk = CalculationEngine.calculateTotalNutrients(false).N; // alleen dierlijke mest
      const ruimte = StateManager.getGebruiksruimte();
  
      const benutDierlijk = Math.min(nutDierlijk, ruimte.A);
      const maxKunstmest = Math.max(0, ruimte.B - benutDierlijk);
  
      if (newValue > maxKunstmest + 0.0001) {
        console.warn(`⚠️ Kunstmest overschrijdt resterende ruimte bij locked stikstof → corrigeren`);
        StateManager.setKunstmest(maxKunstmest);
        UIController.shake('kunststikstof');
        UIController.shake('stikstof');
      }
    }
  }

  function getLockedNutrients() {
    return ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']
      .filter(nut => StateManager.isLocked(nut));
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

  function shakeAllLocked() {
    ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel'].forEach(id => {
      if (StateManager.isLocked(id)) {
        UIController.shake(id);
      }
    });
  }

  return { onSliderChange };

})();
