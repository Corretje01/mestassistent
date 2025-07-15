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

    // Stap 1: Haal huidige staat en valideer invoer
    const state = StateManager.getState();
    const actieveMest = state.actieveMest;
    const gebruiksruimte = StateManager.getGebruiksruimte();
    const huidigeNut = CalculationEngine.berekenNutriënten(false);

    // Valideer invoer
    if (!actieveMest || !gebruiksruimte || !huidigeNut || isNaN(doelWaarde)) {
        console.error(`❌ Ongeldige invoer: actieveMest=${!!actieveMest}, gebruiksruimte=${!!gebruiksruimte}, huidigeNut=${!!huidigeNut}, doelWaarde=${doelWaarde}`);
        UIController.shake(nutId);
        return;
    }

    const huidigeWaarde = huidigeNut[nutId] || 0;
    const delta = doelWaarde - huidigeWaarde;
    const opType = delta > 0 ? 'min' : 'max';

    console.log(`🔄 Doel: ${nutId} van ${huidigeWaarde.toFixed(2)} naar ${doelWaarde.toFixed(2)} (delta: ${delta.toFixed(2)})`);
    console.log(`🔍 GLPK-versie: ${window.glp_version ? window.glp_version() : 'onbekend'}`);
    console.log(`🔍 Gebruiksruimte:`, gebruiksruimte);

    // Stap 2: Verzamel mestdata
    const mestData = Object.entries(actieveMest)
        .filter(([id]) => !StateManager.isLocked(id))
        .map(([id, mest]) => {
            const gehalte = getGehaltePerNutriënt(nutId, mest);
            const prijsPerTon = mest.Inkoopprijs_per_ton ?? 0;
            const kostenPerKgNut = gehalte > 0 ? prijsPerTon / gehalte : Infinity;

            let maxN = Infinity, maxP = Infinity, maxK = Infinity, maxO = Infinity;
            if (mest.N_kg_per_ton > 0) maxN = gebruiksruimte.A / mest.N_kg_per_ton;
            if (mest.P_kg_per_ton > 0) maxP = gebruiksruimte.C / mest.P_kg_per_ton;
            if (mest.K_kg_per_ton > 0) maxK = (gebruiksruimte.B * 1.25) / mest.K_kg_per_ton;
            if (mest.OS_percent > 0) maxO = (gebruiksruimte.organisch || Infinity) / (mest.OS_percent / 100);
            const slider = document.getElementById(`slider-${id}`);
            const maxSlider = slider ? Number(slider.max) : 650;
            const maxTonnage = Math.min(maxN, maxP, maxK, maxO, maxSlider);

            return {
                id,
                mest,
                gehalte,
                prijsPerTon,
                kostenPerKgNut,
                huidig: mest.ton,
                max: maxTonnage,
                min: 0
            };
        })
        .filter(m => m.gehalte > 0 && !isNaN(m.max) && m.max >= 0);

    if (mestData.length === 0) {
        console.log(`🚫 Geen mestsoorten beschikbaar voor ${nutId} aanpassing`);
        UIController.shake(nutId);
        return;
    }

    console.log(`📊 Mestdata:`, mestData.map(m => ({
        id: m.id,
        gehalte: m.gehalte,
        prijsPerTon: m.prijsPerTon,
        maxTonnage: m.max
    })));

    // Stap 3: Stel LP-probleem op
    const lp = window.glp_create_prob();
    window.glp_set_prob_name(lp, 'mestoptimalisatie');
    window.glp_set_obj_dir(lp, opType === 'min' ? window.GLP_MIN : window.GLP_MAX);

    // Voeg kolommen toe (mestsoorten)
    const colIndices = {};
    mestData.forEach((m, index) => {
        const col = window.glp_add_cols(lp, 1);
        window.glp_set_col_name(lp, col, m.id);
        window.glp_set_col_bnds(lp, col, window.GLP_DB, m.min, m.max);
        const kosten = Math.abs(getGehaltePerNutriënt('financieel', m.mest)); // Gebruik absolute waarde
        window.glp_set_obj_coef(lp, col, opType === 'min' ? kosten : -kosten);
        colIndices[m.id] = col;
        console.log(`📊 Kolom ${m.id}: bereik ${m.min}–${m.max}t, kosten €${kosten}/ton`);
    });

    // Voeg rijen toe (beperkingen)
    const rowIndices = {};
    const nutriëntLimieten = {
        stikstof: gebruiksruimte.A,
        fosfaat: gebruiksruimte.C,
        kalium: gebruiksruimte.B * 1.25,
        organisch: gebruiksruimte.organisch || Infinity
    };

    // Nutriëntbeperkingen
    for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch']) {
        if (nut !== nutId && nutriëntLimieten[nut] !== undefined && !StateManager.isLocked(nut)) {
            const row = window.glp_add_rows(lp, 1);
            window.glp_set_row_name(lp, row, nut);
            window.glp_set_row_bnds(lp, row, window.GLP_UP, 0, nutriëntLimieten[nut]);
            rowIndices[nut] = row;
            console.log(`🔒 Nutriëntbeperking ${nut}: max ${nutriëntLimieten[nut]}`);
        }
    }

    // Vergrendelde nutriënten
    for (const nut of ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel']) {
        if (StateManager.isLocked(nut) && nut !== nutId) {
            const vergrendeldeWaarde = huidigeNut[nut] || 0;
            const row = window.glp_add_rows(lp, 1);
            window.glp_set_row_name(lp, row, nut);
            window.glp_set_row_bnds(lp, row, window.GLP_DB, vergrendeldeWaarde - 0.1, vergrendeldeWaarde + 0.1);
            rowIndices[nut] = row;
            console.log(`🔒 Vergrendelde beperking ${nut}: ${vergrendeldeWaarde} (±0.1)`);
        }
    }

    // Doelbeperking voor nutId
    const doelRow = window.glp_add_rows(lp, 1);
    window.glp_set_row_name(lp, doelRow, nutId);
    window.glp_set_row_bnds(lp, doelRow, window.GLP_FX, doelWaarde, doelWaarde); // Gebruik GLP_FX voor exacte waarde
    rowIndices[nutId] = doelRow;
    console.log(`🧮 Doelbeperking ${nutId}: ${doelWaarde} (exact)`);

    // Bouw coëfficiëntenmatrix
    const ia = [], ja = [], ar = [];
    let nz = 0;
    const usedEntries = new Set();
    for (const nut of Object.keys(rowIndices)) {
        for (const m of mestData) {
            const gehalte = getGehaltePerNutriënt(nut, m.mest);
            if (gehalte !== 0) {
                const entryKey = `${rowIndices[nut]}-${m.id}`;
                if (usedEntries.has(entryKey)) {
                    console.warn(`⚠️ Dubbele matrixinvoer voor ${nut}, mest: ${m.id}, rij: ${rowIndices[nut]}`);
                    continue;
                }
                usedEntries.add(entryKey);
                ia[nz + 1] = rowIndices[nut];
                ja[nz + 1] = colIndices[m.id];
                ar[nz + 1] = gehalte;
                nz++;
            }
        }
    }

    // Log en valideer matrix
    console.log("🔍 GLPK Matrix Invoer:", {
        ia: ia.slice(1),
        ja: ja.slice(1),
        ar: ar.slice(1),
        rows: window.glp_get_num_rows(lp),
        cols: window.glp_get_num_cols(lp),
        nz
    });
    for (let i = 1; i <= nz; i++) {
        if (ia[i] < 1 || ia[i] > window.glp_get_num_rows(lp) || ja[i] < 1 || ja[i] > window.glp_get_num_cols(lp) || isNaN(ar[i])) {
            console.error(`❌ Ongeldige matrixindex: ia[${i}] = ${ia[i]}, ja[${i}] = ${ja[i]}, ar[${i}] = ${ar[i]}`);
            UIController.shake(nutId);
            return; // Geen opruiming nodig, probleem wordt niet gebruikt
        }
    }

    // Laad matrix
    window.glp_load_matrix(lp, nz, ia, ja, ar);

    // Debug: Log GLPK-status vóór simplex
    console.log("🔍 GLPK Rijen:", Array.from({ length: window.glp_get_num_rows(lp) }, (_, i) => ({
        name: window.glp_get_row_name(lp, i + 1),
        bnds: {
            type: window.glp_get_row_type(lp, i + 1),
            lb: window.glp_get_row_lb(lp, i + 1),
            ub: window.glp_get_row_ub(lp, i + 1)
        }
    })));
    console.log("🔍 GLPK Kolommen:", Array.from({ length: window.glp_get_num_cols(lp) }, (_, i) => ({
        name: window.glp_get_col_name(lp, i + 1),
        bnds: {
            type: window.glp_get_col_type(lp, i + 1),
            lb: window.glp_get_col_lb(lp, i + 1),
            ub: window.glp_get_col_ub(lp, i + 1)
        },
        coef: window.glp_get_obj_coef(lp, i + 1)
    })));

    // Stel logging in voor GLPK
    window.glp_set_print_func(function(data) {
        console.log("GLPK: " + data);
    });

    // Los op
    try {
        const result = window.glp_simplex(lp, {
            msg_lev: window.GLP_MSG_ALL,
            meth: window.GLP_PRIMAL,
            pricing: window.GLP_PT_STD,
            r_test: window.GLP_RT_STD,
            tol_bnd: 1e-6,
            tol_dj: 1e-6,
            tol_piv: 1e-8,
            it_lim: 1000,
            tm_lim: 10000,
            presolve: window.GLP_ON
        });

        console.log("🔍 GLPK Resultaat:", result);
        console.log("🔍 GLPK Status:", {
            status: window.glp_get_status ? window.glp_get_status(lp) : "onbekend",
            prim_stat: window.glp_get_prim_stat ? window.glp_get_prim_stat(lp) : "onbekend",
            dual_stat: window.glp_get_dual_stat ? window.glp_get_dual_stat(lp) : "onbekend",
            obj_val: window.glp_get_obj_val ? window.glp_get_obj_val(lp) : "onbekend"
        });

        if (result !== 0) { // GLP_OPT = 0
            console.warn(`⚠️ Geen optimale oplossing. Status: ${result}`);
            UIController.shake(nutId);
            return;
        }

        // Haal tonnages op
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

        // Valideer oplossing
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
            console.warn(`⚠️ LP-oplossing ongeldig`);
            UIController.shake(nutId);
            return;
        }

        // Pas tonnages toe
        pasTonnagesToe(tonnages);

        // Update slider
        updateSlider(nutId, doelWaarde, huidigeNut);

        const kosten = window.glp_get_obj_val(lp);
        console.log(`💰 Totale kosten: €${kosten.toFixed(2)}`);

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
