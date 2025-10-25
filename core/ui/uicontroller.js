// core/ui/uicontroller.js
/**
 * uiController.js
 * Alle DOM interactie en UI rendering (incl. integer sliders + echte vergrendeling)
 */

import { StateManager }      from '../domain/statemanager.js';
import { CalculationEngine } from '../domain/calculationengine.js';
import { ValidationEngine }  from '../domain/validationengine.js';
import { LogicEngine }       from '../domain/logicengine.js';

export const UIController = (() => {

  function initStandardSliders() {
    const ruimte = StateManager.getGebruiksruimte();

    const sliders = [
      { id: 'stikstof',      label: 'Stikstof dierlijk',     max: ruimte.A,        unit: 'kg'  },
      { id: 'fosfaat',       label: 'Fosfaat',               max: ruimte.C,        unit: 'kg'  },
      { id: 'kalium',        label: 'Kalium',                max: ruimte.B * 1.25, unit: 'kg'  },
      { id: 'organisch',     label: 'Organische stof',       max: 3000,            unit: 'kg'  },
      { id: 'kunststikstof', label: 'Kunstmest stikstof',    max: ruimte.B,        unit: 'kg'  },
      { id: 'financieel',    label: 'Kosten',                max: 10000,           unit: 'eur' }
    ];

    sliders.forEach(s => createStandardSlider(s.id, s.label, s.max, s.unit));
  }

  function createStandardSlider(id, label, max, unit) {
    const container = document.getElementById('sliders-container');
    const group = document.createElement('div');
    group.className = 'slider-group';
    group.id = `group-${id}`;
    group.innerHTML = `
      <div class="slider-header">
        <input type="checkbox" id="lock-${id}" />
        <label for="slider-${id}">${label}</label>
        <span class="value" id="value-${id}">0 / ${Math.round(max)} ${unit}</span>
      </div>
      <input type="range" id="slider-${id}" min="0" max="${Math.round(max)}" step="1" value="0" />
    `;
    container.appendChild(group);

    const lockEl   = document.getElementById(`lock-${id}`);
    const sliderEl = document.getElementById(`slider-${id}`);

    // Init lock-UI op basis van bestaande state
    const initiallyLocked = StateManager.isLocked(id);
    lockEl.checked = initiallyLocked;
    sliderEl.disabled = initiallyLocked;

    lockEl.addEventListener('change', (e) => {
      const locked = e.target.checked;
      StateManager.setLock(id, locked);
      sliderEl.disabled = locked; // <- echte vergrendeling
    });

    sliderEl.addEventListener('input', (e) => {
      if (sliderEl.disabled) return;
      const v = parseFloat(e.target.value);
      LogicEngine.onSliderChange(id, Number.isFinite(v) ? v : 0);
    });
  }

  function renderMestsoortSlider(id, label, max) {
    const container = document.getElementById('sliders-container');
    const group = document.createElement('div');
    group.className = 'slider-group';
    group.id = `group-${id}`;
    group.innerHTML = `
      <div class="slider-header">
        <input type="checkbox" id="lock-${id}" />
        <label for="slider-${id}">${label}</label>
        <span class="value" id="value-${id}">0 / ${Math.round(max)} ton</span>
      </div>
      <input type="range" id="slider-${id}" min="0" max="${Math.round(max)}" step="1" value="0" />
    `;
    container.appendChild(group);

    const lockEl   = document.getElementById(`lock-${id}`);
    const sliderEl = document.getElementById(`slider-${id}`);

    const initiallyLocked = StateManager.isLocked(id);
    lockEl.checked = initiallyLocked;
    sliderEl.disabled = initiallyLocked;

    lockEl.addEventListener('change', (e) => {
      const locked = e.target.checked;
      StateManager.setLock(id, locked);
      sliderEl.disabled = locked;
    });

    sliderEl.addEventListener('input', (e) => {
      if (sliderEl.disabled) return;
      const v = parseFloat(e.target.value);
      LogicEngine.onSliderChange(id, Number.isFinite(v) ? v : 0);
    });
  }

  function updateSliders() {
    const nutDierlijk       = CalculationEngine.berekenNutriënten(false);
    const nutInclKunstmest  = CalculationEngine.berekenNutriënten(true);
    const { A, B, C }       = StateManager.getGebruiksruimte();

    // 1) Standaard sliders
    const standaard = [
      { id: 'stikstof',      value: nutDierlijk.stikstof,        max: A,           unit: 'kg'  },
      { id: 'fosfaat',       value: nutDierlijk.fosfaat,         max: C,           unit: 'kg'  },
      { id: 'kalium',        value: nutDierlijk.kalium,          max: B * 1.25,    unit: 'kg'  },
      { id: 'organisch',     value: nutDierlijk.organisch,       max: 3000,        unit: 'kg'  },
      { id: 'kunststikstof', value: StateManager.getKunstmest(), max: B,           unit: 'kg'  },
      { id: 'financieel',    value: nutInclKunstmest.financieel, max: 10000,       unit: 'eur' }
    ];

    standaard.forEach(({ id, value, max, unit }) => {
      const sliderEl = document.getElementById(`slider-${id}`);
      const valueEl  = document.getElementById(`value-${id}`);
      if (!sliderEl || !valueEl) return;

      const locked = StateManager.isLocked(id);
      sliderEl.max = String(Math.round(max));
      sliderEl.disabled = locked;

      const afgerond = Math.round(Number(value) || 0);
      if (!locked) {
        sliderEl.value = String(afgerond);
      }
      valueEl.textContent = `${afgerond} ${unit} / ${sliderEl.max} ${unit}`;
    });

    // 2) Mest-sliders
    const actieveMest = StateManager.getActieveMest();
    Object.entries(actieveMest).forEach(([id, mest]) => {
      const sliderEl = document.getElementById(`slider-${id}`);
      const valueEl  = document.getElementById(`value-${id}`);
      if (!sliderEl || !valueEl) return;

      const newMax = Math.round(ValidationEngine.getMaxTonnage(id));
      const locked = StateManager.isLocked(id);
      sliderEl.max = String(newMax);
      sliderEl.disabled = locked;

      const afgerond = Math.round(Number(mest.ton) || 0);
      if (!locked) {
        sliderEl.value = String(afgerond);
      }
      valueEl.textContent = `${afgerond} ton / ${sliderEl.max} ton`;
    });
  }

  function updateMestsoortenSliders() {
    const actieveMest = StateManager.getActieveMest();

    for (const [id, mest] of Object.entries(actieveMest)) {
      const sliderEl = document.getElementById(`slider-${id}`);
      const valueEl  = document.getElementById(`value-${id}`);
      if (!sliderEl || !valueEl) continue;

      sliderEl.disabled = StateManager.isLocked(id); // extra defensief
      const afgerond = Math.round(Number(mest.ton) || 0);

      if (!sliderEl.disabled) {
        sliderEl.value = String(afgerond);
      }

      const formattedVal = `${afgerond} ton`;
      const formattedMax = `${Math.round(Number(sliderEl.max) || 0)} ton`;
      valueEl.textContent = `${formattedVal} / ${formattedMax}`;
    }
  }

  function shake(id) {
    const slider = document.getElementById(`slider-${id}`);
    if (!slider) return;
    slider.classList.add('shake');
    setTimeout(() => slider.classList.remove('shake'), 400);
  }

  function showSlidersContainer() {
    const container = document.getElementById('sliders-container');
    if (container) container.style.display = 'block';
  }

  function hideSlidersContainer() {
    const container = document.getElementById('sliders-container');
    if (container) container.style.display = 'none';
  }

  return {
    initStandardSliders,
    renderMestsoortSlider,
    updateSliders,
    updateMestsoortenSliders,
    shake,
    showSlidersContainer,
    hideSlidersContainer
  };

})();
