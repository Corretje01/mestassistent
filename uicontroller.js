/**
 * uiController.js
 * Alle DOM interactie en UI rendering
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { LogicEngine } from './logicengine.js';

export const UIController = (() => {

  /**
   * Init alle standaard sliders (nutriënten, kunstmest, kosten)
   */
  function initStandardSliders() {
    const ruimte = StateManager.getGebruiksruimte();

    const sliders = [
      { id: 'stikstof', label: 'Stikstof dierlijk', max: ruimte.A || 10000, unit: 'kg' },
      { id: 'fosfaat', label: 'Fosfaat', max: ruimte.C || 5000, unit: 'kg' },
      { id: 'kalium', label: 'Kalium', max: (ruimte.B || 10000) * 1.25, unit: 'kg' },
      { id: 'organisch', label: 'Organische stof', max: 3000, unit: 'kg' },
      { id: 'kunststikstof', label: 'Kunstmest stikstof', max: ruimte.B || 10000, unit: 'kg' },
      { id: 'financieel', label: 'Kosten', max: 10000, unit: 'eur' }
    ];

    sliders.forEach(slider => createSlider(slider.id, slider.label, slider.max, slider.unit));
  }

  /**
   * Creeër slider-elementen in DOM
   */
  function createSlider(id, label, max, unit) {
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
      <input type="range" id="slider-${id}" min="0" max="${max}" step="0.1" />
    `;
    container.appendChild(group);

    document.getElementById(`lock-${id}`).addEventListener('change', (e) => {
      StateManager.setLock(id, e.target.checked);
    });

    document.getElementById(`slider-${id}`).addEventListener('input', (e) => {
      LogicEngine.onSliderChange(id, parseFloat(e.target.value));
    });
  }

  /**
   * Slider wijziging afhandelen
   */
  function handleSliderChange(id, newValue) {
    if (ValidationEngine.isLocked(id)) {
      shake(id);
      return;
    }

    if (id === 'kunststikstof') {
      StateManager.setKunstmest(newValue);
    }
    // verdere routering komt hier (straks via centrale onSliderChange)

    updateSliders();

    const fout = ValidationEngine.checkUsageLimits();
    if (fout) {
      console.warn(fout);
      shake(id);
    }
  }

  /**
   * Update sliderwaarden in UI
   */
  function updateSliders() {
    const total = CalculationEngine.calculateTotalNutrients(true);

    updateSliderValue('stikstof', total.N);
    updateSliderValue('fosfaat', total.P);
    updateSliderValue('kalium', total.K);
    updateSliderValue('organisch', total.OS);
    updateSliderValue('financieel', total.FIN);
    updateSliderValue('kunststikstof', StateManager.getKunstmest());
  }

  function updateSliderValue(id, value) {
    const slider = document.getElementById(`slider-${id}`);
    const valueEl = document.getElementById(`value-${id}`);
    if (!slider || !valueEl) return;

    slider.value = value.toFixed(1);
    valueEl.textContent = `${value.toFixed(1)} / ${slider.max}`;
  }

  /**
   * Shake effect bij fouten
   */
  function shake(id) {
    const el = document.getElementById(`group-${id}`);
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  }

  return {
    initStandardSliders,
    updateSliders,
    shake
  }

})();
