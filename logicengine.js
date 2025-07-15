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
          bnds: { type: window.GLP_DB, ub: vergrendeldeWaarde + 0.1, lb: vergrendeldeWaarde - 0.1 }
        };
        for (const m of mestData) {
          const gehalte = getGehaltePerNutriënt(nut, m.mest);
          if (gehalte !== 0) {
            constraint.vars.push({ name: m.id, coef: gehalte });
          }
        }
        if (constraint.vars.length > 0) {
          model.subjectTo.push(constraint);
          console.log(`🔒 Vergrendelde beperking ${nut}: ${vergrendeldeWaarde} (±0.1)`);
        }
      }
    }

    // Stap 7: Voeg doelbeperking toe
    const doelConstraint = {
      name: nutId,
      vars: [],
      bnds: { type: window.GLP_DB, ub: doelWaarde + 0.1, lb: doelWaarde - 0.1 }
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
      mestData.forEach((m, index) => {
        const col = window.glp_add_cols(lp, 1);
        window.glp_set_col_name(lp, col, m.id);
        window.glp_set_col_bnds(lp, col, window.GLP_DB, m.min, m.max);
        window.glp_set_obj_coef(lp, col, opType === 'min' ? -m.kostenPerKgNut : m.kostenPerKgNut);
        colIndices[m.id] = col;
      });
    
      // Voeg rijen toe (beperkingen)
      const rowIndices = {};
      for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch']) {
        if (nut !== nutId && nutriëntLimieten[nut] !== undefined && (!StateManager.isLocked(nut) || nut !== nutId)) {
          const row = window.glp_add_rows(lp, 1);
          window.glp_set_row_name(lp, row, nut);
          window.glp_set_row_bnds(lp, row, window.GLP_UP, 0, nutriëntLimieten[nut]);
          rowIndices[nut] = row;
          console.log(`🔒 GLPK Nutriëntbeperking ${nut}: max ${nutriëntLimieten[nut]}`);
        }
      }
      for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']) {
        if (StateManager.isLocked(nut) && nut !== nutId) {
          const row = window.glp_add_rows(lp, 1);
          window.glp_set_row_name(lp, row, nut);
          window.glp_set_row_bnds(lp, row, window.GLP_DB, huidigeNut[nut] - 0.1, huidigeNut[nut] + 0.1);
          rowIndices[nut] = row;
          console.log(`🔒 GLPK Vergrendelde beperking ${nut}: ${huidigeNut[nut]} (±0.1)`);
        }
      }
      const doelRow = window.glp_add_rows(lp, 1);
      window.glp_set_row_name(lp, doelRow, nutId);
      window.glp_set_row_bnds(lp, doelRow, window.GLP_DB, doelWaarde - 0.1, doelWaarde + 0.1);
      rowIndices[nutId] = doelRow;
    
      // Bouw coëfficiëntenmatrix
      const ia = [0]; // Row indices
      const ja = [0]; // Column indices
      const ar = [0]; // Coefficients
      let nz = 1; // Non-zero element counter
      const usedEntries = new Set();
      for (const nut of Object.keys(rowIndices)) {
        for (const m of mestData) {
          const gehalte = getGehaltePerNutriënt(nut, m.mest);
          if (gehalte !== 0) {
            const entryKey = `${rowIndices[nut]}-${m.id}`;
            if (usedEntries.has(entryKey)) {
              console.warn(`⚠️ Dubbele matrixinvoer voor ${nut}, mest: ${m.id}, rij: ${rowIndices[nut]}`);
            } else {
              usedEntries.add(entryKey);
              ia[nz] = rowIndices[nut];
              ja[nz] = colIndices[m.id];
              ar[nz] = gehalte;
              nz++;
            }
          }
        }
      }
          
      // Valideer matrix
      console.log("📋 Matrix validatie: nz =", nz - 1);
      for (let i = 1; i < nz; i++) {
        if (ia[i] < 1 || ia[i] > window.glp_get_num_rows(lp) || ja[i] < 1 || ja[i] > window.glp_get_num_cols(lp)) {
          console.error(`❌ Ongeldige matrixindex: ia[${i}] = ${ia[i]}, ja[${i}] = ${ja[i]}`);
        }
      }

      console.log(
        'Matrix:', 
        window.glp_get_num_rows(lp), '×', window.glp_get_num_cols(lp),
        'Coefficients:',
        mestData.map(m => ({ id: m.id, coef: m.kostenPerKgNut }))
      );
      
      window.glp_load_matrix(lp, nz - 1, ia, ja, ar);
      
      // Debug: Log matrix en probleemdetails
      console.log("📋 Matrix ia:", ia.slice(1, nz));
      console.log("📋 Matrix ja:", ja.slice(1, nz));
      console.log("📋 Matrix ar:", ar.slice(1, nz));
      console.log("📋 Aantal rijen:", window.glp_get_num_rows(lp));
      console.log("📋 Aantal kolommen:", window.glp_get_num_cols(lp));
      console.log("📋 Doelstelling coëfficiënten (model):", mestData.map(m => ({ id: m.id, coef: opType === 'min' ? -getGehaltePerNutriënt('financieel', m.mest) : getGehaltePerNutriënt('financieel', m.mest) })));
      console.log("📋 Doelstelling coëfficiënten (GLPK):", mestData.map(m => ({ id: m.id, coef: window.glp_get_obj_coef(lp, colIndices[m.id]) })));
      console.log("📋 Modelbeperkingen:", model.subjectTo.map(c => ({
        name: c.name,
        bnds: c.bnds,
        vars: c.vars
      })));
      console.log("📋 GLPK rijen:", Array.from({ length: window.glp_get_num_rows(lp) }, (_, i) => {
        const row = i + 1;
        return {
          name: window.glp_get_row_name(lp, row),
          bnds: {
            type: window.glp_get_row_type(lp, row),
            lb: window.glp_get_row_lb(lp, row),
            ub: window.glp_get_row_ub(lp, row)
          }
        };
      }));
      
      // Los op
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
    
      console.log('📦 Resultaat tonnages na LP-optimalisatie:');
      const tonnages = {};
      for (const id of Object.keys(actieveMest)) {
        if (StateManager.isLocked(id)) {
          tonnages[id] = actieveMest[id].ton;
          continue;
        }
        const col = colIndices[id];
        const nieuweWaarde = col ? window.glp_get_col_prim(lp, col) : 0;
        tonnages[id] = nieuweWaarde;
        console.log(`➡️ ${id}: ${nieuweWaarde.toFixed(2)} ton`);
      }
          
      // Valideer en pas tonnages toe
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

      // Update slider
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
    }

    for (const [id, tonnage] of Object.entries(tonnages)) {
      StateManager.setMestTonnage(id, Math.max(0, Math.min(tonnage, 650)));
    }

    UIController.updateSliders();
  }

  function updateSlider(nutId, doelWaarde, huidigeNut) {
    const herberekend = CalculationEngine.berekenNutriënten(false);
    const afwijking = Math.abs(herberekend[nutId] - doelWaarde);

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
  
  // a) Helper voor prijs per ton incl. transport
  function getPrijsPerTonInclTransport(mest) {
    // Inkoopprijs per ton + vaste transportkosten
    return (mest.Inkoopprijs_per_ton || 0) + 10;
  }

  // b) Puur voor nutriënt‑gehalte
  function getGehaltePerNutriënt(nut, mest) {
    switch (nut) {
      case 'stikstof': return mest.N_kg_per_ton || 0;
      case 'fosfaat': return mest.P_kg_per_ton || 0;
      case 'kalium': return mest.K_kg_per_ton || 0;
      case 'organisch': return (mest.OS_percent || 0) / 100;
      
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
