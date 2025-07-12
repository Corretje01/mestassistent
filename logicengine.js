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
  
    const huidigeWaarde = huidigeNut[nutId] || 0;
    const delta = targetValue - huidigeWaarde;
    const richting = delta > 0 ? 'verhogen' : 'verlagen';
    const opType = delta > 0 ? 'min' : 'max';
  
    console.log(`🔄 Doel: ${richting} van ${nutId} van ${huidigeWaarde} naar ${targetValue}`);
  
    const model = {
      optimize: 'financieel',
      opType: opType,
      constraints: {},
      variables: {},
      ints: {}
    };
  
    const mestData = Object.entries(actieveMest)
      .filter(([id]) => !StateManager.isLocked(id))
      .map(([id, mest]) => {
        const gehalte = getGehaltePerNutriënt(nutId, mest);
        const prijsPerTon = mest.Inkoopprijs_per_ton ?? 0;
        const kostenPerKgNut = gehalte > 0 ? prijsPerTon / gehalte : Infinity;
        const huidig = mest.ton;
  
        // slider limieten ophalen
        const slider = document.getElementById(`slider-${id}`);
        const maxSlider = slider ? Number(slider.max) : 650;
  
        // bereken max toegestaan door N/P ruimte
        let maxN = Infinity, maxP = Infinity;
        if (mest.N_kg_per_ton > 0) maxN = ruimte.A / mest.N_kg_per_ton;
        if (mest.P_kg_per_ton > 0) maxP = ruimte.C / mest.P_kg_per_ton;
        const maxTonnage = Math.min(maxN, maxP, maxSlider);
  
        return { id, mest, gehalte, prijsPerTon, kostenPerKgNut, huidig, max: maxTonnage };
      });
  
    // Sorteer: bij verlaging → hoogste €/kg eerst (dus minst gunstig), bij verhoging → laagste €/kg eerst
    const gesorteerd = [...mestData].sort((a, b) =>
      delta > 0 ? a.kostenPerKgNut - b.kostenPerKgNut : b.kostenPerKgNut - a.kostenPerKgNut
    );
  
    for (const m of gesorteerd) {
      if (delta < 0 && m.huidig <= 0) {
        console.log(`🚫 ${m.id} op nul — uitgesloten voor verlaging`);
        continue;
      }
  
      const varObj = {
        stikstof: getGehaltePerNutriënt('stikstof', m.mest),
        fosfaat: getGehaltePerNutriënt('fosfaat', m.mest),
        kalium: getGehaltePerNutriënt('kalium', m.mest),
        organisch: getGehaltePerNutriënt('organisch', m.mest),
        financieel: getGehaltePerNutriënt('financieel', m.mest)
      };
  
      model.variables[m.id] = varObj;
      model.ints[m.id] = 0;
      model.constraints[m.id] = { min: 0, max: m.max };
  
      console.log(`📊 ${m.id} — €${m.prijsPerTon}/ton, ${m.gehalte} kg ${nutId}/ton → €${(m.kostenPerKgNut).toFixed(2)} per kg ${nutId} | huidig: ${m.huidig.toFixed(2)} ton | max: ${m.max.toFixed(1)} ton`);
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
    console.log(`📦 LP-model opgebouwd:`, model);
  
    try {
      const resultaat = window.solver.Solve(model);
      console.log('📈 LP-resultaat:', resultaat);
  
      if (!resultaat.feasible) {
        console.warn(`⚠️ LP niet oplosbaar. Constraints:`, model.constraints);
        UIController.shake(nutId);
        return;
      }
  
      console.log('📦 Resultaat tonnages na LP-optimalisatie:');
      for (const id of Object.keys(actieveMest)) {
        if (StateManager.isLocked(id)) continue;
        const nieuweWaarde = resultaat[id];
        if (typeof nieuweWaarde === 'number') {
          StateManager.setMestTonnage(id, nieuweWaarde);
          console.log(`➡️ ${id}: ${nieuweWaarde.toFixed(2)} ton`);
        }
      }
  
      // Valideer en synchroniseer slider visueel
      const herberekend = CalculationEngine.berekenNutriënten(false);
      const afwijking = Math.abs(herberekend[nutId] - targetValue);
  
      const slider = document.getElementById(`slider-${nutId}`);
      if (slider && afwijking < 0.5) {
        slider.value = targetValue;
        console.log(`🎯 Nutriëntenslider ${nutId} visueel gesynchroniseerd op ${targetValue}`);
      } else {
        console.warn(`⚠️ Nutriëntenslider ${nutId} niet gesynchroniseerd — afwijking ${afwijking.toFixed(2)} kg`);
      }
  
      const kosten = resultaat.result ?? 0;
      console.log(`💰 Totale kostenresultaat (doelfunctie): €${kosten.toFixed(2)}`);
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
