// core/domain/logicengine.js
import { StateManager }      from '../core/domain/statemanager.js';        
import { CalculationEngine } from '../core/domain/calculationengine.js';
import { ValidationEngine }  from '../core/domain/validationengine.js';   
import { UIController }      from '../ui/uicontroller.js';   

export const LogicEngine = (() => {
  function overschrijdtNutriëntLimieten(totaal, limieten) {
    for (const nut in limieten) {
      if (limieten[nut] != null && totaal[nut] > limieten[nut] + 1e-6) return nut;
    }
    return null;
  }

  function forceWithinBounds(id, value) {
    const sliderEl = document.getElementById(`slider-${id}`);
    if (!sliderEl) return value;
    const min = Number(sliderEl.min);
    const max = Number(sliderEl.max);
    if (value < min || value > max) {
      UIController.shake(id);
      console.warn(`❌ Slider ${id} overschrijdt grenzen: ${value} (min=${min}, max=${max})`);
      return Math.min(max, Math.max(min, value));
    }
    return value;
  }

  const lastValidSliderValues = {};

  function onSliderChange(id, newValue) {
    const sliderEl = document.getElementById(`slider-${id}`);
    if (!sliderEl) return;

    if (sliderEl.disabled || StateManager.isLocked(id)) {
      UIController.shake(id);
      return;
    }

    const clamped = forceWithinBounds(id, newValue);
    sliderEl.value = String(clamped);
    if (clamped !== newValue) return;

    // Hypothetische check voordat state wijzigt
    const state = JSON.parse(JSON.stringify(StateManager.getState()));
    if (state.actieveMest[id]) state.actieveMest[id].ton = clamped;

    const ruimte = StateManager.getGebruiksruimte();
    const nutLimieten = {
      stikstof: ruimte.A,
      fosfaat:  ruimte.C,
      kalium:   ruimte.B * 1.25,
    };

    const totaalNa = CalculationEngine.berekenNutriëntenVoorState(state);
    const overschredenNut = overschrijdtNutriëntLimieten(totaalNa, nutLimieten);
    if (overschredenNut) {
      sliderEl.value = String(lastValidSliderValues[id] ?? sliderEl.min);
      UIController.shake(id);
      console.warn(`❌ Overschrijding: ${overschredenNut} overschrijdt maximum`);
      return;
    }

    lastValidSliderValues[id] = clamped;

    if (id === 'kunststikstof') {
      StateManager.setKunstmest(clamped);
      updateStikstofMaxDoorKunstmest();
    } else if (isNutrientSlider(id)) {
      handleNutrientChangeViaLP(id, clamped);
    } else {
      handleMestSliderChange(id, clamped);
    }

    UIController.updateSliders();
  }

  function handleMestSliderChange(id, newValue) {
    const oudeState = StateManager.getState();
    const mest = oudeState.actieveMest[id];
    const deltaTon = newValue - mest.ton;
    if (deltaTon === 0) return;

    const clampedValue = forceWithinBounds(id, newValue);
    if (clampedValue !== newValue) return;

    const deltaNut = berekenDeltaNutriënten(mest, deltaTon);
    const vergrendeldeNut = Object.keys(deltaNut).filter(n => StateManager.isLocked(n) && deltaNut[n] !== 0);

    const hypothetischeState = JSON.parse(JSON.stringify(oudeState));
    hypothetischeState.actieveMest[id].ton = clampedValue;

    let aanpassingen = {};
    if (vergrendeldeNut.length > 0) {
      const andereMest = Object.entries(oudeState.actieveMest)
        .filter(([key]) => key !== id && !StateManager.isLocked(key))
        .map(([key, mest]) => ({ id: key, mest }));

      aanpassingen = {};

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
        const nieuw  = huidig + tonDelta;
        const geclampteNieuw = forceWithinBounds(key, nieuw);
        if (geclampteNieuw !== nieuw) {
          UIController.shake(key);
          return;
        }
        hypothetischeState.actieveMest[key].ton = nieuw;
      }
    }

    const ruimte = StateManager.getGebruiksruimte();
    const nutLimieten = {
      stikstof: ruimte.A,
      fosfaat:  ruimte.C,
      kalium:   ruimte.B * 1.25,
    };
    const totaalNa = CalculationEngine.berekenNutriëntenVoorState(hypothetischeState);
    const overschredenNut = overschrijdtNutriëntLimieten(totaalNa, nutLimieten);
    if (overschredenNut) {
      UIController.shake(id);
      return;
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

    const state          = StateManager.getState();
    const actieveMest    = state.actieveMest;
    const gebruiksruimte = StateManager.getGebruiksruimte();
    const huidigeNut     = CalculationEngine.berekenNutriënten(false);

    const huidigeWaarde = huidigeNut[nutId] || 0;
    const delta = doelWaarde - huidigeWaarde;
    const opType = delta > 0 ? 'min' : 'max';

    const mestData = Object.entries(actieveMest)
      .filter(([id]) => !StateManager.isLocked(id))
      .map(([id, mest]) => {
        const gehalte = getGehaltePerNutriënt(nutId, mest);
        const prijsPerTon = getPrijsPerTonInclTransport(mest);
        const kostenPerKgNut = gehalte > 0 ? prijsPerTon / gehalte : Infinity;
        const sliderEl = document.getElementById(`slider-${id}`);
        const minT = Number(sliderEl.min);
        const maxT = Number(sliderEl.max);
        return { id, mest, gehalte, prijsPerTon, kostenPerKgNut, min: minT, max: maxT };
      })
      .filter(m => m.gehalte > 0);

    if (mestData.length === 0) { UIController.shake(nutId); return; }

    const nutriëntLimieten = {
      stikstof:  gebruiksruimte.A,
      fosfaat:   gebruiksruimte.C,
      kalium:    gebruiksruimte.B * 1.25,
      organisch: gebruiksruimte.organisch || Infinity
    };

    try {
      const lp = window.glp_create_prob();
      window.glp_set_prob_name(lp, 'mestoptimalisatie');
      window.glp_set_obj_dir(lp, opType === 'min' ? window.GLP_MAX : window.GLP_MIN);

      const colIndices = {};
      mestData.forEach(m => {
        const col = window.glp_add_cols(lp, 1);
        window.glp_set_col_name(lp, col, m.id);
        window.glp_set_col_bnds(lp, col, window.GLP_DB, m.min, m.max);
        window.glp_set_obj_coef(lp, col, opType === 'min' ? -m.kostenPerKgNut : m.kostenPerKgNut);
        colIndices[m.id] = col;
      });

      const rowIndices = {};
      for (const nut of ['stikstof','fosfaat','kalium','organisch']) {
        if (nut !== nutId && nutriëntLimieten[nut] !== undefined && !StateManager.isLocked(nut)) {
          const row = window.glp_add_rows(lp, 1);
          window.glp_set_row_name(lp, row, nut);
          window.glp_set_row_bnds(lp, row, window.GLP_UP, 0, nutriëntLimieten[nut]);
          rowIndices[nut] = row;
        }
      }
      for (const nut of ['stikstof','fosfaat','kalium','organisch']) {
        if (StateManager.isLocked(nut) && nut !== nutId) {
          const lockedVal = (huidigeNut[nut] || 0);
          const row = window.glp_add_rows(lp, 1);
          window.glp_set_row_name(lp, row, nut);
          window.glp_set_row_bnds(lp, row, window.GLP_DB, lockedVal - 0.5, lockedVal + 0.5);
          rowIndices[nut] = row;
        }
      }
      const doelRow = window.glp_add_rows(lp, 1);
      window.glp_set_row_name(lp, doelRow, nutId);
      window.glp_set_row_bnds(lp, doelRow, window.GLP_DB, doelWaarde - 0.5, doelWaarde + 0.5);
      rowIndices[nutId] = doelRow;

      const ia = [0], ja = [0], ar = [0];
      let nz = 1;
      for (const nut of Object.keys(rowIndices)) {
        for (const m of mestData) {
          const g = getGehaltePerNutriënt(nut, m.mest);
          if (g !== 0) { ia[nz] = rowIndices[nut]; ja[nz] = colIndices[m.id]; ar[nz] = g; nz++; }
        }
      }
      window.glp_load_matrix(lp, nz - 1, ia, ja, ar);

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
      if (ret !== 0 || (status !== window.GLP_OPT && status !== window.GLP_FEAS)) { UIController.shake(nutId); return; }

      const tonnages = {};
      mestData.forEach(m => {
        const col = colIndices[m.id];
        tonnages[m.id] = window.glp_get_col_prim(lp, col);
      });

      const bereikte = { stikstof:0, fosfaat:0, kalium:0, organisch:0 };
      mestData.forEach(m => {
        const ton = tonnages[m.id];
        bereikte.stikstof  += getGehaltePerNutriënt('stikstof',  m.mest) * ton;
        bereikte.fosfaat   += getGehaltePerNutriënt('fosfaat',   m.mest) * ton;
        bereikte.kalium    += getGehaltePerNutriënt('kalium',    m.mest) * ton;
        bereikte.organisch += getGehaltePerNutriënt('organisch', m.mest) * ton;
      });

      let geldig = true;
      for (const nut of ['stikstof','fosfaat','kalium','organisch']) {
        const bereikt = bereikte[nut];
        const limiet  = nutriëntLimieten[nut];
        if (limiet !== undefined && bereikt > limiet + 1e-6) geldig = false;
        if (StateManager.isLocked(nut) && nut !== nutId) {
          const origineel = (huidigeNut[nut] || 0);
          if (Math.abs(bereikt - origineel) > 0.5) geldig = false;
        }
      }
      if (Math.abs(bereikte[nutId] - doelWaarde) > 0.55) geldig = false;
      if (!geldig) { UIController.shake(nutId); return; }

      pasTonnagesToe(tonnages);
      updateSlider(nutId, doelWaarde);

      const kosten = window.glp_get_obj_val(lp);
      console.log(`💰 Totale kostenresultaat: €${kosten.toFixed(2)}`);
    } catch (err) {
      console.error(`❌ LP-optimalisatie gefaald (${nutId}): ${err.message}`);
      UIController.shake(nutId);
    }
  }

  function pasTonnagesToe(tonnages) {
    const state = StateManager.getStateDeepCopy ? StateManager.getStateDeepCopy() : JSON.parse(JSON.stringify(StateManager.getState()));
    for (const [id, tonnage] of Object.entries(tonnages)) {
      const geclampteTonnage = forceWithinBounds(id, tonnage);
      if (state.actieveMest[id]) state.actieveMest[id].ton = geclampteTonnage;
    }

    const ruimte = StateManager.getGebruiksruimte();
    const nutLimieten = {
      stikstof: ruimte.A,
      fosfaat:  ruimte.C,
      kalium:   ruimte.B * 1.25,
    };
    const totaalNa = CalculationEngine.berekenNutriëntenVoorState(state);
    const overschredenNut = overschrijdtNutriëntLimieten(totaalNa, nutLimieten);
    if (overschredenNut) {
      Object.keys(tonnages).forEach(id => UIController.shake(id));
      return;
    }

    for (const [id, tonnage] of Object.entries(tonnages)) {
      const geclampteTonnage = forceWithinBounds(id, tonnage);
      StateManager.setMestTonnage(id, geclampteTonnage);
    }
    UIController.updateSliders();
  }

  function updateSlider(nutId, doelWaarde) {
    const herberekend = CalculationEngine.berekenNutriënten(false);
    const afwijking = Math.abs((herberekend[nutId] || 0) - doelWaarde);
    const slider = document.getElementById(`slider-${nutId}`);
    if (slider && afwijking <= 0.55) {
      slider.value = String(Math.round(doelWaarde));
    } else if (slider) {
      UIController.shake(nutId);
    }
  }

  function berekenDeltaNutriënten(mest, tonDelta) {
    return {
      stikstof:   tonDelta * (mest.N_kg_per_ton || 0),
      fosfaat:    tonDelta * (mest.P_kg_per_ton || 0),
      kalium:     tonDelta * (mest.K_kg_per_ton || 0),
      organisch:  tonDelta * ((mest.OS_percent || 0) / 100),
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

  function updateStikstofMaxDoorKunstmest() {
    const ruimte = StateManager.getGebruiksruimte();
    const nutDierlijk = CalculationEngine.berekenNutriënten(false);
    const maxDierlijk = Math.min(ruimte.A, ruimte.B - StateManager.getKunstmest());

    const stikstofSlider = document.getElementById('slider-stikstof');
    if (stikstofSlider) {
      stikstofSlider.max = String(Math.round(maxDierlijk));
      if (StateManager.isLocked('stikstof') && nutDierlijk.stikstof > maxDierlijk) {
        StateManager.setKunstmest(Math.max(0, ruimte.B - nutDierlijk.stikstof));
        UIController.shake('kunststikstof');
      }
    }
  }

  return { onSliderChange };
})();

export default LogicEngine;
