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

  function handleNutrientChangeViaLP(nutId, doelWaarde) {
    if (!window.GLPK) {
      console.error('❌ glpk.js niet geladen');
      UIController.shake(nutId);
      return;
    }
    
    // Stap 1: Haal huidige staat en bereken delta
    const state = StateManager.getState();
    const actieveMest = state.actieveMest;
    const gebruiksruimte = StateManager.getGebruiksruimte();
    const huidigeNut = CalculationEngine.berekenNutriënten(false);

    const huidigeWaarde = huidigeNut[nutId] || 0;
    const delta = doelWaarde - huidigeWaarde;
    const richting = delta > 0 ? 'verhogen' : 'verlagen';
    const opType = delta > 0 ? 'min' : 'max'; // Minimaliseer kosten bij verhogen, maximaliseer opbrengst bij verlagen

    console.log(`🔄 Doel: ${richting} van ${nutId} van ${huidigeWaarde.toFixed(2)} naar ${doelWaarde.toFixed(2)}`);

    // Stap 2: Stel LP-model op voor glpk.js
    const model = {
      name: 'mestoptimalisatie',
      objective: {
        direction: opType === 'min' ? GLPK.GLP_MIN : GLPK.GLP_MAX,
        name: 'financieel',
        vars: []
      },
      subjectTo: [],
      bounds: []
    };

    // Stap 3: Verzamel data per mestsoort
    const mestData = Object.entries(actieveMest)
      .filter(([id]) => !StateManager.isLocked(id))
      .map(([id, mest]) => {
        const gehalte = getGehaltePerNutriënt(nutId, mest);
        const prijsPerTon = mest.Inkoopprijs_per_ton ?? 0;
        const kostenPerKgNut = gehalte > 0 ? prijsPerTon / gehalte : Infinity;
        const huidig = mest.ton;

        const slider = document.getElementById(`slider-${id}`);
        const maxSlider = slider ? Number(slider.max) : 650;

        let maxN = Infinity, maxP = Infinity, maxK = Infinity;
        if (mest.N_kg_per_ton > 0) maxN = gebruiksruimte.A / mest.N_kg_per_ton;
        if (mest.P_kg_per_ton > 0) maxP = gebruiksruimte.C / mest.P_kg_per_ton;
        if (mest.K_kg_per_ton > 0) maxK = (gebruiksruimte.B * 1.25) / mest.K_kg_per_ton;
        const maxTonnage = Math.min(maxN, maxP, maxK, maxSlider);

        return {
          id,
          mest,
          gehalte,
          prijsPerTon,
          kostenPerKgNut,
          huidig,
          max: maxTonnage,
          min: 0
        };
      })
      .filter(m => m.gehalte > 0); // Alleen mestsoorten met relevant gehalte

    // Stap 4: Controleer of er bruikbare mestsoorten zijn
    if (mestData.length === 0) {
      console.log(`🚫 Geen mestsoorten beschikbaar voor ${nutId} aanpassing`);
      UIController.shake(nutId);
      return;
    }

    // Stap 5: Bouw variabelen en doelstelling
    for (const m of mestData) {
      model.objective.vars.push({
        name: m.id,
        coef: getGehaltePerNutriënt('financieel', m.mest) // Kosten per ton
      });

      // Voeg bounds toe (0 <= tonnage <= max)
      model.bounds.push({
        name: m.id,
        type: GLPK.GLP_DB, // Dubbele bound (min en max)
        lb: m.min,
        ub: m.max
      });

      console.log(`📊 ${m.id} — €${m.prijsPerTon}/ton, ${m.gehalte} ${nutId}/ton → €${m.kostenPerKgNut.toFixed(2)} per ${nutId} | huidig: ${m.huidig.toFixed(2)}t | bereik: ${m.min}–${m.max}t`);
    }

    // Stap 6: Voeg gebruiksruimte-beperkingen toe
    const nutriëntLimieten = {
      stikstof: gebruiksruimte.A,
      fosfaat: gebruiksruimte.C,
      kalium: gebruiksruimte.B * 1.25
    };

    for (const nut of ['stikstof', 'fosfaat', 'kalium']) {
      if (nutriëntLimieten[nut] !== undefined && (!StateManager.isLocked(nut) || nut !== nutId)) {
        const constraint = {
          name: nut,
          vars: [],
          bnds: { type: GLPK.GLP_UP, ub: nutriëntLimieten[nut], lb: -Infinity }
        };
        for (const m of mestData) {
          const gehalte = getGehaltePerNutriënt(nut, m.mest);
          if (gehalte > 0) {
            constraint.vars.push({ name: m.id, coef: gehalte });
          }
        }
        if (constraint.vars.length > 0) {
          model.subjectTo.push(constraint);
          console.log(`🔒 Nutriëntbeperking ${nut}: max ${nutriëntLimieten[nut]}`);
        }
      }
    }

    // Stap 7: Voeg vergrendelde nutriënten toe
    for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']) {
      if (StateManager.isLocked(nut) && nut !== nutId) {
        const vergrendeldeWaarde = huidigeNut[nut];
        const constraint = {
          name: nut,
          vars: [],
          bnds: { type: GLPK.GLP_FX, ub: vergrendeldeWaarde, lb: vergrendeldeWaarde } // Exacte gelijkheid
        };
        for (const m of mestData) {
          const gehalte = getGehaltePerNutriënt(nut, m.mest);
          if (gehalte !== 0) {
            constraint.vars.push({ name: m.id, coef: gehalte });
          }
        }
        if (constraint.vars.length > 0) {
          model.subjectTo.push(constraint);
          console.log(`🔒 Vergrendelde beperking ${nut}: ${vergrendeldeWaarde}`);
        }
      }
    }

    // Stap 8: Voeg doelbeperking toe
    const doelConstraint = {
      name: nutId,
      vars: [],
      bnds: { type: GLPK.GLP_FX, ub: doelWaarde, lb: doelWaarde } // Exacte gelijkheid
    };
    for (const m of mestData) {
      const gehalte = getGehaltePerNutriënt(nutId, m.mest);
      if (gehalte > 0) {
        doelConstraint.vars.push({ name: m.id, coef: gehalte });
      }
    }
    if (doelConstraint.vars.length > 0) {
      model.subjectTo.push(doelConstraint);
      console.log(`🧮 Doelbeperking ${nutId}: ${doelWaarde}`);
    } else {
      console.log(`🚫 Geen variabelen voor ${nutId} beperking`);
      UIController.shake(nutId);
      return;
    }

    console.log(`📦 LP-model opgebouwd:`, model);

    // Stap 9: Los LP-model op met glpk.js
    try {
      const resultaat = GLPK.solve(model, {
        tm_lim: 1000, // 1 seconde limiet
        tol_bnd: 0.001, // Tolerantie voor beperkingen
        tol_obj: 0.001 // Tolerantie voor doelstelling
      });

      console.log('📈 LP-resultaat:', resultaat);

      if (resultaat.result.status !== GLPK.GLP_OPT && resultaat.result.status !== GLPK.GLP_FEAS) {
        console.warn(`⚠️ Geen oplossing mogelijk voor ${nutId}. Status: ${resultaat.result.status}`);
        UIController.shake(nutId);
        return;
      }

      // Stap 10: Verzamel tonnages
      console.log('📦 Resultaat tonnages na LP-optimalisatie:');
      const tonnages = {};
      for (const id of Object.keys(actieveMest)) {
        if (StateManager.isLocked(id)) {
          tonnages[id] = actieveMest[id].ton; // Behoud vergrendelde tonnages
          continue;
        }
        const nieuweWaarde = resultaat.result.vars[id] || 0;
        tonnages[id] = nieuweWaarde;
        console.log(`➡️ ${id}: ${nieuweWaarde.toFixed(2)} ton`);
      }

      // Stap 11: Valideer en pas tonnages toe
      const nieuweNutriënten = CalculationEngine.berekenNutriënten(false, tonnages);
      let geldig = true;
      for (const nut of ['stikstof', 'fosfaat', 'kalium']) {
        if (nutriëntLimieten[nut] !== undefined && nieuweNutriënten[nut] > nutriëntLimieten[nut]) {
          console.warn(`⚠️ Overschrijding: ${nut} = ${nieuweNutriënten[nut].toFixed(2)} > ${nutriëntLimieten[nut]}`);
          geldig = false;
        }
      }
      for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']) {
        if (StateManager.isLocked(nut) && nut !== nutId && Math.abs(nieuweNutriënten[nut] - huidigeNut[nut]) > 0.5) {
          console.warn(`⚠️ Vergrendelde ${nut} gewijzigd: ${nieuweNutriënten[nut].toFixed(2)} ≠ ${huidigeNut[nut].toFixed(2)}`);
          geldig = false;
        }
      }
      if (Math.abs(nieuweNutriënten[nutId] - doelWaarde) > 0.1) {
        console.warn(`⚠️ Doelnutriënt ${nutId} afwijking: ${nieuweNutriënten[nutId].toFixed(2)} ≠ ${doelWaarde}`);
        geldig = false;
      }

      if (!geldig) {
        console.warn(`⚠️ LP-oplossing ongeldig, slider wordt niet aangepast`);
        UIController.shake(nutId);
        return;
      }

      pasTonnagesToe(tonnages);

      // Stap 12: Update slider
      updateSlider(nutId, doelWaarde, huidigeNut);

      const kosten = resultaat.result.z;
      console.log(`💰 Totale kostenresultaat: €${kosten.toFixed(2)}`);
    } catch (err) {
      console.error(`❌ LP-optimalisatie gefaald (${nutId}): ${err.message}`);
      UIController.shake(nutId);
    }
  }

  function pasTonnagesToe(tonnages) {
    // Stap 1: Valideer tonnages
    for (const [id, tonnage] of Object.entries(tonnages)) {
      if (typeof tonnage !== 'number' || isNaN(tonnage)) {
        console.warn(`⚠️ Ongeldige tonnage voor ${id}: ${tonnage}`);
        return;
      }
    }

    // Stap 2: Pas tonnages toe binnen limieten
    for (const [id, tonnage] of Object.entries(tonnages)) {
      StateManager.setMestTonnage(id, Math.max(0, Math.min(tonnage, 650)));
    }

    // Stap 3: Update UI
    UIController.updateSliders();
  }

  function updateSlider(nutId, doelWaarde, huidigeNut) {
    // Stap 1: Bereken nieuwe nutriëntwaarden
    const herberekend = CalculationEngine.berekenNutriënten(false);
    const afwijking = Math.abs(herberekend[nutId] - doelWaarde);

    // Stap 2: Update slider als afwijking klein is
    const slider = document.getElementById(`slider-${nutId}`);
    if (slider && afwijking < 0.5) {
      slider.value = doelWaarde;
      console.log(`🎯 Nutriëntenslider ${nutId} gesynchroniseerd op ${doelWaarde}`);
    } else {
      console.warn(`⚠️ Nutriëntenslider ${nutId} niet gesynchroniseerd — afwijking ${afwijking.toFixed(2)} ${nutId}`);
      if (slider) {
        UIController.shake(nutId);
      }
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
