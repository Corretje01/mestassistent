/**
 * uiController.js
 * Alle DOM interactie en UI rendering
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { LogicEngine } from './logicengine.js';

export const UIController = (() => {

  function initStandardSliders() {
    const ruimte = StateManager.getGebruiksruimte();

    const sliders = [
      { id: 'stikstof', label: 'Stikstof dierlijk', max: ruimte.A, unit: 'kg' },
      { id: 'fosfaat', label: 'Fosfaat', max: ruimte.C, unit: 'kg' },
      { id: 'kalium', label: 'Kalium', max: ruimte.B * 1.25, unit: 'kg' },
      { id: 'organisch', label: 'Organische stof', max: 3000, unit: 'kg' },
      { id: 'kunststikstof', label: 'Kunstmest stikstof', max: ruimte.B, unit: 'kg' },
      { id: 'financieel', label: 'Kosten', max: 10000, unit: 'eur' }
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
        <span class="value" id="value-${id}">0 / ${max} ${unit}</span>
      </div>
      <input type="range" id="slider-${id}" min="0" max="${max}" step="0.1" value="0" />
    `;
    container.appendChild(group);

    document.getElementById(`lock-${id}`).addEventListener('change', (e) => {
      StateManager.setLock(id, e.target.checked);
    });

    document.getElementById(`slider-${id}`).addEventListener('input', (e) => {
      LogicEngine.onSliderChange(id, parseFloat(e.target.value));
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
        <span class="value" id="value-${id}">0 / ${max} ton</span>
      </div>
      <input type="range" id="slider-${id}" min="0" max="${max}" step="0.1" value="0" />
    `;
    container.appendChild(group);

    document.getElementById(`lock-${id}`).addEventListener('change', (e) => {
      StateManager.setLock(id, e.target.checked);
    });

    document.getElementById(`slider-${id}`).addEventListener('input', (e) => {
      LogicEngine.onSliderChange(id, parseFloat(e.target.value));
    });
  }

  function updateSliders() {
    const ruimte = StateManager.getGebruiksruimte();
    const nutDierlijk = CalculationEngine.berekenNutriënten(false);
    const nutInclKunstmest = CalculationEngine.berekenNutriënten(true);

    const sliders = [
      { id: 'stikstof', value: nutDierlijk.stikstof, unit: 'kg' },
      { id: 'fosfaat', value: nutDierlijk.fosfaat, unit: 'kg' },
      { id: 'kalium', value: nutDierlijk.kalium, unit: 'kg' },
      { id: 'organisch', value: nutDierlijk.organisch, unit: 'kg' },
      { id: 'kunststikstof', value: StateManager.getKunstmest(), unit: 'kg' }
    ];

    sliders.forEach(({ id, value, unit }) => {
      const sliderEl = document.getElementById(`slider-${id}`);
      const valueEl = document.getElementById(`value-${id}`);
      if (!sliderEl || !valueEl) return;

      const afgerond = Math.round(value * 10) / 10;

      if (!StateManager.isLocked(id)) {
        sliderEl.value = afgerond;
      }

      const formattedVal = `${afgerond} ${unit}`;
      const formattedMax = `${sliderEl.max} ${unit}`;
      valueEl.textContent = `${formattedVal} / ${formattedMax}`;
    });

    // Kunstmest max updaten
    const kunstmestSlider = document.getElementById('slider-kunststikstof');
    if (kunstmestSlider) {
      const maxKunstmest = ValidationEngine.getMaxKunstmest();
      kunstmestSlider.max = maxKunstmest;
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
    shake,
    showSlidersContainer,
    hideSlidersContainer
  };

})();
