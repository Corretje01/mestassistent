import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { UIController } from './uicontroller.js';

export const LogicEngine = (() => {
  
  function forceWithinBounds(id, value) {
    const sliderEl = document.getElementById(`slider-${id}`);
    if (!sliderEl) return value; // fallback, maar liever nooit!
    const min = Number(sliderEl.min);
    const max = Number(sliderEl.max);
    if (value < min || value > max) {
      UIController.shake(id);
      console.warn(`❌ Slider ${id} overschrijdt grenzen: ${value} (min=${min}, max=${max})`);
      return Math.min(max, Math.max(min, value));
    }
    return value;
  }
  
  function onSliderChange(id, newValue) {
    console.log(`🟡 Slider wijziging: ${id} → ${newValue}`);
  
    const sliderEl = document.getElementById(`slider-${id}`);
    if (!sliderEl) return;
  
    if (sliderEl.disabled || StateManager.isLocked(id)) {
      UIController.shake(id);
      return;
    }
  
    // Clamp + feedback via centrale utiliteit
    const clamped = forceWithinBounds(id, newValue);
    sliderEl.value = String(clamped);
  
    // c) Doe je logica met de geclampte waarde!
    if (id === 'kunststikstof') {
      StateManager.setKunstmest(clamped);
      updateStikstofMaxDoorKunstmest();
    } else if (isNutrientSlider(id)) {
      console.log(`⚙️ Nutriëntenslider ${id} wordt gewijzigd → LP wordt aangeroepen`);
      handleNutrientChangeViaLP(id, clamped);
    } else {
      console.log(`⚙️ Mestslider ${id} wordt gewijzigd → directe berekening`);
      handleMestSliderChange(id, clamped);
    }
  
    UIController.updateSliders();
    checkGlobalValidation();
  }

  function handleMestSliderChange(id, newValue) {
    const oudeState = StateManager.getState();
    const mest = oudeState.actieveMest[id];
    const deltaTon = newValue - mest.ton;
    if (deltaTon === 0) return;
  
    const clampedValue = forceWithinBounds(id, newValue);
  
    // Eventuele indirecte correctie als de slider op max/min staat
    if (clampedValue !== newValue) return; // Stop als hij buiten bereik probeerde te gaan
  
    const deltaNut = berekenDeltaNutriënten(mest, deltaTon);
    const vergrendeldeNut = Object.keys(deltaNut).filter(n => StateManager.isLocked(n) && deltaNut[n] !== 0);
    if (vergrendeldeNut.length === 0) {
      StateManager.setMestTonnage(id, clampedValue);
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
  
    // Grenscontrole vóór daadwerkelijk toepassen
    for (const [key, tonDelta] of Object.entries(aanpassingen)) {
      const huidig = oudeState.actieveMest[key].ton;
      const nieuw = huidig + tonDelta;
      const geclampteNieuw = forceWithinBounds(key, nieuw);
      if (geclampteNieuw !== nieuw) {
        UIController.shake(key);
        return; // Annuleer alles bij één overtreding
      }
    }
  
    StateManager.setMestTonnage(id, clampedValue);
    for (const [key, tonDelta] of Object.entries(aanpassingen)) {
      const huidig = oudeState.actieveMest[key].ton;
      StateManager.setMestTonnage(key, huidig + tonDelta);
    }
  }

  function handleNutrientChangeViaLP(nutId, doelWaarde) {
    if (!window.glp_create_prob) {
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
    const opType = delta > 0 ? 'min' : 'max';

    console.log(`🔄 Doel: ${richting} van ${nutId} van ${huidigeWaarde.toFixed(2)} naar ${doelWaarde.toFixed(2)}`);
    console.log(`🔍 GLPK-versie: ${window.glp_version ? window.glp_version() : 'onbekend'}`);
    
    // Stap 2: Stel LP-model op voor glpk.js
    const model = {
      name: 'mestoptimalisatie',
      objective: {
        direction: opType === 'min' ? window.GLP_MAX : window.GLP_MIN,
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
        const prijsPerTon = getPrijsPerTonInclTransport(mest);
        const kostenPerKgNut = gehalte > 0 ? prijsPerTon / gehalte : Infinity;
        console.log('🔍 kostenPerKgNut check:', {
          id,
          prijsPerTon,
          gehalte,
          kostenPerKgNut
        });

        const sliderEl = document.getElementById(`slider-${id}`);
        const minT = Number(sliderEl.min);
        const maxT = Number(sliderEl.max);
        
        const huidig = mest.ton;
        return {
          id,
          mest,
          gehalte,
          prijsPerTon,
          kostenPerKgNut,
          huidig,
          min: minT,
          max: maxT
        };
      })
      .filter(m => m.gehalte > 0);

    if (mestData.length === 0) {
      console.log(`🚫 Geen mestsoorten beschikbaar voor ${nutId} aanpassing`);
      UIController.shake(nutId);
      return;
    }

    // Stap 4: Bouw variabelen en doelstelling
    for (const m of mestData) {
      model.objective.vars.push({
        name: m.id,
        coef: opType === 'min' ? -m.kostenPerKgNut : m.kostenPerKgNut
      });

      model.bounds.push({
        name: m.id,
        type: window.GLP_DB,
        lb: m.min,
        ub: m.max
      });

      console.log(`📊 ${m.id} — €${m.prijsPerTon}/ton, ${m.gehalte} ${nutId}/ton → €${m.kostenPerKgNut.toFixed(2)} per ${nutId} | huidig: ${m.huidig.toFixed(2)}t | bereik: ${m.min}–${m.max}t`);
    }

    // Stap 5: Voeg gebruiksruimte-beperkingen toe
    const nutriëntLimieten = {
      stikstof: gebruiksruimte.A,
      fosfaat: gebruiksruimte.C,
      kalium: gebruiksruimte.B * 1.25,
      organisch: gebruiksruimte.organisch || Infinity
    };

    for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch']) {
      if (nut !== nutId && nutriëntLimieten[nut] !== undefined && !StateManager.isLocked(nut)) {
        const constraint = {
          name: nut,
          vars: [],
          bnds: { type: window.GLP_UP, ub: nutriëntLimieten[nut], lb: -Infinity }
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

    // Stap 6: Voeg vergrendelde nutriënten toe
    for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']) {
      if (StateManager.isLocked(nut) && nut !== nutId) {
        const vergrendeldeWaarde = huidigeNut[nut];
        const constraint = {
          name: nut,
          vars: [],
          bnds: { type: window.GLP_DB, ub: vergrendeldeWaarde + 0.5, lb: vergrendeldeWaarde - 0.5 }
        };
        for (const m of mestData) {
          const gehalte = getGehaltePerNutriënt(nut, m.mest);
          if (gehalte !== 0) {
            constraint.vars.push({ name: m.id, coef: gehalte });
          }
        }
        if (constraint.vars.length > 0) {
          model.subjectTo.push(constraint);
          console.log(`🔒 Vergrendelde beperking ${nut}: ${vergrendeldeWaarde} (±0.5)`);
        }
      }
    }

    // Stap 7: Voeg doelbeperking toe
    const doelConstraint = {
      name: nutId,
      vars: [],
      bnds: { type: window.GLP_DB, ub: doelWaarde + 0.5, lb: doelWaarde - 0.5 }
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

  // Stap 8: Los LP-model op met glpk.js
  try {
    const lp = window.glp_create_prob();
    window.glp_set_prob_name(lp, 'mestoptimalisatie');
    window.glp_set_obj_dir(lp, opType === 'min' ? window.GLP_MAX : window.GLP_MIN);
  
    // Voeg kolommen toe (mestsoorten)
    const colIndices = {};
    mestData.forEach(m => {
      const col = window.glp_add_cols(lp, 1);
      window.glp_set_col_name(lp, col, m.id);
      window.glp_set_col_bnds(lp, col, window.GLP_DB, m.min, m.max);
      window.glp_set_obj_coef(
        lp, col,
        opType === 'min' ? -m.kostenPerKgNut : m.kostenPerKgNut
      );
      colIndices[m.id] = col;
    });
  
    // Voeg rijen toe (nutriënten‑beperkingen, zonder 'financieel')
    const rowIndices = {};
    for (const nut of ['stikstof','fosfaat','kalium','organisch']) {
      if (nut !== nutId && nutriëntLimieten[nut] !== undefined && !StateManager.isLocked(nut)) {
        const row = window.glp_add_rows(lp, 1);
        window.glp_set_row_name(lp, row, nut);
        window.glp_set_row_bnds(lp, row, window.GLP_UP, 0, nutriëntLimieten[nut]);
        rowIndices[nut] = row;
        console.log(`🔒 GLPK Nutriëntbeperking ${nut}: max ${nutriëntLimieten[nut]}`);
      }
    }
    
    // Voeg GLP_DB-rijen toe voor elke locked nutriënt (excl. doelnutriënt)
    for (const nut of ['stikstof','fosfaat','kalium','organisch']) {
      if (StateManager.isLocked(nut) && nut !== nutId) {
        const lockedVal = huidigeNut[nut] || 0;
        const row = window.glp_add_rows(lp, 1);
        window.glp_set_row_name(lp, row, nut);
        window.glp_set_row_bnds(
          lp, row,
          window.GLP_DB,
          lockedVal - 0.5,
          lockedVal + 0.5
        );
        rowIndices[nut] = row;
        console.log(`🔒 GLPK Vergrendelde beperking ${nut}: ${lockedVal} (±0.5)`);
      }
    }
    
    // Doel‑nutriënt
    const doelRow = window.glp_add_rows(lp, 1);
    window.glp_set_row_name(lp, doelRow, nutId);
    window.glp_set_row_bnds(lp, doelRow, window.GLP_DB, doelWaarde - 0.5, doelWaarde + 0.5);
    rowIndices[nutId] = doelRow;
  
    // Bouw coëfficiëntenmatrix
    const ia = [0], ja = [0], ar = [0];
    let nz = 1;
    for (const nut of Object.keys(rowIndices)) {
      for (const m of mestData) {
        const gehalte = getGehaltePerNutriënt(nut, m.mest);
        if (gehalte !== 0) {
          ia[nz] = rowIndices[nut];
          ja[nz] = colIndices[m.id];
          ar[nz] = gehalte;
          nz++;
        }
      }
    }
  
    // Debug logging
    console.log("📋 Matrix:", window.glp_get_num_rows(lp), "×", window.glp_get_num_cols(lp));
    console.log("📋 Coëfficiënten (model):", mestData.map(m => ({
      id: m.id,
      coef: opType==='min' ? -m.kostenPerKgNut : m.kostenPerKgNut
    })));
    console.log("📋 Coëfficiënten (GLPK):", mestData.map(m => ({
      id: m.id,
      coef: window.glp_get_obj_coef(lp, colIndices[m.id])
    })));
  
    window.glp_load_matrix(lp, nz - 1, ia, ja, ar);
  
    // Oplossen
    const ret = window.glp_simplex(lp, {
      msg_lev:  window.GLP_MSG_ALL,
      meth:     window.GLP_PRIMAL,
      pricing:  window.GLP_PT_STD,
      r_test:   window.GLP_RT_STD,
      tol_bnd:  0.001,
      tol_dj:   0.001,
      tol_piv:  0.001,
      it_lim:   1000,
      tm_lim:   1000,
      presolve: window.GLP_ON
    });
    const status = window.glp_get_status(lp);
    console.log(`GLPK simplex ret=${ret}, status=${status}`);
    if (ret !== 0 || (status !== window.GLP_OPT && status !== window.GLP_FEAS)) {
      console.warn(`⚠️ Geen oplossing voor ${nutId}: ret=${ret}, status=${status}`);
      UIController.shake(nutId);
      return;
    }
  
    // Lees tonnages uit
    console.log('📦 Resultaat tonnages na LP-optimalisatie:');
    const tonnages = {};
    mestData.forEach(m => {
      const col = colIndices[m.id];
      const val = window.glp_get_col_prim(lp, col);
      tonnages[m.id] = val;
      console.log(`➡️ ${m.id}: ${val.toFixed(2)} ton`);
    });
  
    // Valideer m.b.v. directe berekening
    const bereikteNutriënten = { stikstof:0, fosfaat:0, kalium:0, organisch:0 };
    mestData.forEach(m => {
      const ton = tonnages[m.id];
      bereikteNutriënten.stikstof  += getGehaltePerNutriënt('stikstof',  m.mest) * ton;
      bereikteNutriënten.fosfaat   += getGehaltePerNutriënt('fosfaat',   m.mest) * ton;
      bereikteNutriënten.kalium    += getGehaltePerNutriënt('kalium',    m.mest) * ton;
      bereikteNutriënten.organis   += getGehaltePerNutriënt('organisch', m.mest) * ton;
    });
  
    let geldig = true;
    ['stikstof','fosfaat','kalium','organisch'].forEach(nut => {
      const bereikt = bereikteNutriënten[nut];
      const limiet  = nutriëntLimieten[nut];
      if (limiet !== undefined && bereikt > limiet + 1e-6) {
        console.warn(`⚠️ Overschrijding ${nut}: ${bereikt.toFixed(2)} > ${limiet}`);
        geldig = false;
      }
      if (StateManager.isLocked(nut) && nut !== nutId) {
        const origineel = huidigeNut[nut];
        if (Math.abs(bereikt - origineel) > 0.5) {
          console.warn(`⚠️ Vergrendelde ${nut} gewijzigd: ${bereikt.toFixed(2)} ≠ ${origineel.toFixed(2)}`);
          geldig = false;
        }
      }
    });
  
    if (Math.abs(bereikteNutriënten[nutId] - doelWaarde) > 0.55) {
      console.warn(`⚠️ Doelnutriënt ${nutId} afwijking: ${bereikteNutriënten[nutId].toFixed(2)} ≠ ${doelWaarde}`);
      geldig = false;
    }
  
    if (!geldig) {
      console.warn(`⚠️ LP-oplossing ongeldig, slider wordt niet aangepast`);
      UIController.shake(nutId);
      return;
    }
  
    pasTonnagesToe(tonnages);
    updateSlider(nutId, doelWaarde, huidigeNut);
  
    const kosten = window.glp_get_obj_val(lp);
    console.log(`💰 Totale kostenresultaat: €${kosten.toFixed(2)}`);
    
  } catch (err) {
    console.error(`❌ LP-optimalisatie gefaald (${nutId}): ${err.message}`);
    UIController.shake(nutId);
    }
  }

  function pasTonnagesToe(tonnages) {
    for (const [id, tonnage] of Object.entries(tonnages)) {
      if (typeof tonnage !== 'number' || isNaN(tonnage)) {
        console.warn(`⚠️ Ongeldige tonnage voor ${id}: ${tonnage}`);
        return;
      }
      const geclampteTonnage = forceWithinBounds(id, tonnage);
      if (geclampteTonnage !== tonnage) {
        // Log & shake al bij forceWithinBounds, hier extra safety:
        return;
      }
    }
    for (const [id, tonnage] of Object.entries(tonnages)) {
      const geclampteTonnage = forceWithinBounds(id, tonnage);
      StateManager.setMestTonnage(id, geclampteTonnage);
    }
    UIController.updateSliders();
  }
  
  function updateSlider(nutId, doelWaarde, huidigeNut) {
    const herberekend = CalculationEngine.berekenNutriënten(false);
    const afwijking = Math.abs(herberekend[nutId] - doelWaarde);
    const slider = document.getElementById(`slider-${nutId}`);
    if (slider && afwijking <= 0.55) {
      slider.value = doelWaarde;
      console.log(`🎯 Nutriëntenslider ${nutId} gesynchroniseerd op ${doelWaarde}`);
    } else {
      console.warn(`⚠️ Nutriëntenslider ${nutId} niet gesynchroniseerd — afwijking ${afwijking.toFixed(2)}`);
      if (slider) UIController.shake(nutId);
    }
  }
  
  function berekenDeltaNutriënten(mest, tonDelta) {
    return {
      stikstof:  tonDelta * (mest.N_kg_per_ton || 0),
      fosfaat:   tonDelta * (mest.P_kg_per_ton || 0),
      kalium:    tonDelta * (mest.K_kg_per_ton || 0),
      organisch: tonDelta * ((mest.OS_percent || 0) / 100),
      financieel: tonDelta * ((mest.Inkoopprijs_per_ton || 0) + 10)
    };
  }
  
  function getPrijsPerTonInclTransport(mest) {
    return (mest.Inkoopprijs_per_ton || 0) + 10;
  }
  
  function getGehaltePerNutriënt(nut, mest) {
    switch (nut) {
      case 'stikstof':  return mest.N_kg_per_ton   || 0;
      case 'fosfaat':   return mest.P_kg_per_ton   || 0;
      case 'kalium':    return mest.K_kg_per_ton   || 0;
      case 'organisch': return (mest.OS_percent||0)/100;
      default:          return 0;
    }
  }
    
  function isNutrientSlider(id) {
    return ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel'].includes(id);
  }

  function isWithinSliderLimits(slider, value) {
    return value >= Number(slider.min) && value <= Number(slider.max);
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
