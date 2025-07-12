// logicengine.js
import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
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

  function handleNutrientChangeViaLP(nutId, targetValue) {
    const state = StateManager.getState();
    const actieveMest = state.actieveMest;
    const ruimte = StateManager.getGebruiksruimte();
    const huidigeNut = CalculationEngine.berekenNutriënten(false);
  
    const richting = targetValue > huidigeNut[nutId] ? 'verhogen' : 'verlagen';
    console.log(`🔄 Doel: ${richting} van ${nutId} van ${huidigeNut[nutId]} naar ${targetValue}`);
  
    const model = {
      optimize: 'financieel', // 💰 Minimaliseer kosten
      opType: 'min',
      constraints: {},
      variables: {},
      ints: {}
    };
  
    for (const [id, mest] of Object.entries(actieveMest)) {
      if (StateManager.isLocked(id)) {
        console.log(`🚫 ${id} is vergrendeld — uitgesloten van LP`);
        continue;
      }
  
      const gehalte = getGehaltePerNutriënt(nutId, mest);
      const prijs = mest.Inkoopprijs_per_ton ?? 0;
      const prijsPerKgNut = gehalte > 0 ? prijs / gehalte : Infinity;
  
      const sliderEl = document.getElementById(`slider-${id}`);
      if (!sliderEl) {
        console.warn(`⚠️ Geen slider gevonden voor ${id}, mestsoort wordt overgeslagen`);
        continue;
      }
  
      const sliderMax = Number(sliderEl.max);
      const huidigeTon = mest.ton ?? 0;
  
      if (richting === 'verhogen' && huidigeTon >= sliderMax) {
        console.log(`🚫 ${id} op maximum — uitgesloten voor verhoging`);
        continue;
      }
  
      if (richting === 'verlagen' && huidigeTon <= 0) {
        console.log(`🚫 ${id} op nul — uitgesloten voor verlaging`);
        continue;
      }
  
      let maxN = Infinity, maxP = Infinity;
      if (mest.N_kg_per_ton > 0) maxN = ruimte.A / mest.N_kg_per_ton;
      if (mest.P_kg_per_ton > 0) maxP = ruimte.C / mest.P_kg_per_ton;
      const maxTonnage = Math.min(maxN, maxP, sliderMax);
  
      model.variables[id] = {
        stikstof: getGehaltePerNutriënt('stikstof', mest),
        fosfaat: getGehaltePerNutriënt('fosfaat', mest),
        kalium: getGehaltePerNutriënt('kalium', mest),
        organisch: getGehaltePerNutriënt('organisch', mest),
        financieel: prijsPerKgNut // ⚠️ hier zit de optimalisatielogica
      };
  
      model.ints[id] = 0;
      model.constraints[id] = { min: 0, max: maxTonnage };
  
      console.log(`📊 ${id} — €${prijs}/ton, ${gehalte} kg ${nutId}/ton → €${prijsPerKgNut.toFixed(2)} per kg ${nutId} | huidig: ${huidigeTon} ton | max: ${maxTonnage.toFixed(1)} ton`);
    }
  
    // Locked nutriënten behouden
    for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']) {
      if (StateManager.isLocked(nut)) {
        const lockedVal = huidigeNut[nut];
        model.constraints[nut] = { equal: lockedVal };
        console.log(`🔒 Locked constraint ${nut}: ${lockedVal}`);
      }
    }
  
    model.constraints[nutId] = { equal: targetValue };
    console.log(`🧮 Target constraint ${nutId}: ${targetValue}`);
    console.log('📦 LP-model opgebouwd:', model);
  
    try {
      const resultaat = window.solver.Solve(model);
      console.log('📈 LP-resultaat:', resultaat);
  
      if (!resultaat.feasible) {
        console.warn(`⚠️ LP niet oplosbaar. Constraints:`, model.constraints);
        for (const [id, mest] of Object.entries(actieveMest)) {
          const huidige = mest.ton;
          const max = model.constraints[id]?.max ?? 'onbekend';
          console.warn(`❌ ${id}: huidig ${huidige} ton > max ${max}`);
        }
        UIController.shake(nutId);
        return;
      }
  
      console.log('📦 Resultaat tonnages na LP-optimalisatie:');
      Object.entries(resultaat).forEach(([id, val]) => {
        if (typeof val === 'number') {
          console.log(`➡️ ${id}: ${val.toFixed(2)} ton`);
        }
      });
  
      for (const id of Object.keys(actieveMest)) {
        if (StateManager.isLocked(id)) continue;
        const nieuweWaarde = resultaat[id];
        if (typeof nieuweWaarde === 'number') {
          if (nieuweWaarde < 0 || nieuweWaarde > 650) {
            console.warn(`⚠️ Ongeldige oplossing voor ${id}: ${nieuweWaarde} ton`);
            UIController.shake(nutId);
            return;
          }
          StateManager.setMestTonnage(id, nieuweWaarde);
          console.log(`✅ ${id} ingesteld op ${Math.round(nieuweWaarde * 10) / 10} ton`);
        }
      }
    } catch (err) {
      console.log(`❌ LP-optimalisatie gefaald (${nutId}): ${err.message}`);
      UIController.shake(nutId);
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
    const fout = ValidationEngine.overschrijdtMaxToegestaneWaarden?.();
    if (fout) {
      console.warn("❌ Overschrijding:", fout);
    }
  }

  return {
    onSliderChange
  };
})();
