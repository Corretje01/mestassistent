/**
 * uiController.js
 * Definitieve versie met volledige kunstmest-stikstof functionaliteit zoals origineel
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { LogicEngine } from './logicengine.js';

export const UIController = (() => {

  /**
   * Init standaard nutriëntsliders
   */
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

    sliders.forEach(slider => renderSlider(slider.id, slider.label, slider.max, slider.unit));
  }

  /**
   * Render 1 slider
   */
  function renderSlider(id, label, max, unit) {
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
   * Update alle sliderwaarden
   */
  function updateSliders() {
    const ruimte = StateManager.getGebruiksruimte();

    // Haal de actuele totalen op
    const totaalDierlijk = CalculationEngine.calculateTotalNutrients(false);
    const totaalInclKunstmest = CalculationEngine.calculateTotalNutrients(true);

    // Standaard sliders actualiseren
    const updates = [
      { id: 'stikstof', value: totaalDierlijk.N, max: Math.min(ruimte.A, ruimte.B - StateManager.getKunstmest()), unit: 'kg' },
      { id: 'fosfaat', value: totaalInclKunstmest.P, max: ruimte.C, unit: 'kg' },
      { id: 'kalium', value: totaalInclKunstmest.K, max: ruimte.B * 1.25, unit: 'kg' },
      { id: 'organisch', value: totaalInclKunstmest.OS, max: 3000, unit: 'kg' },
      { id: 'kunststikstof', value: StateManager.getKunstmest(), max: ruimte.B, unit: 'kg' },
      { id: 'financieel', value: totaalInclKunstmest.FIN, max: 10000, unit: 'eur' }
    ];

    updates.forEach(({ id, value, max, unit }) => {
      const sliderEl = document.getElementById(`slider-${id}`);
      const valueEl = document.getElementById(`value-${id}`);
      if (!sliderEl || !valueEl) return;

      const afgerond = id === 'financieel' ? Math.round(value) : Math.round(value * 10) / 10;

      // Max limiet bijwerken
      sliderEl.max = max;

      // Alleen waarde bijwerken als niet gelockt
      if (!ValidationEngine.isLocked(id)) {
        sliderEl.value = afgerond;
      }

      const formattedVal = formatSliderValue(afgerond, unit, id === 'financieel');
      const formattedMax = formatSliderValue(max, unit, id === 'financieel');
      valueEl.textContent = `${formattedVal} / ${formattedMax}`;
    });

    // Dynamische mestsoorten ook updaten
    updateMestsoortenSliders();
  }

  /**
   * Render dynamische mestsoorten sliders
   */
  function renderMestsoortSlider(key, label, maxTon) {
    const container = document.getElementById('sliders-container');
    const group = document.createElement('div');
    group.className = 'slider-group';
    group.id = `group-${key}`;
    group.innerHTML = `
      <div class="slider-header">
        <input type="checkbox" id="lock-${key}" />
        <label for="slider-${key}">${label}</label>
        <span class="value" id="value-${key}">0 / ${maxTon} ton</span>
      </div>
      <input type="range" id="slider-${key}" min="0" max="${maxTon}" step="0.1" />
    `;
    container.appendChild(group);

    document.getElementById(`lock-${key}`).addEventListener('change', (e) => {
      StateManager.setLock(key, e.target.checked);
    });

    document.getElementById(`slider-${key}`).addEventListener('input', (e) => {
      LogicEngine.onSliderChange(key, parseFloat(e.target.value));
    });
  }

  /**
   * Update dynamische mestsoorten sliders
   */
  function updateMestsoortenSliders() {
    const mestData = StateManager.getActieveMest();

    Object.entries(mestData).forEach(([key, data]) => {
      const sliderEl = document.getElementById(`slider-${key}`);
      const valueEl = document.getElementById(`value-${key}`);
      if (!sliderEl || !valueEl) return;

      const afgerond = Math.round(data.ton * 10) / 10;
      if (!ValidationEngine.isLocked(key)) {
        sliderEl.value = afgerond;
      }

      const formattedVal = formatSliderValue(afgerond, 'ton');
      const formattedMax = formatSliderValue(sliderEl.max, 'ton');
      valueEl.textContent = `${formattedVal} / ${formattedMax}`;
    });
  }

  /**
   * Shake effect
   */
  function shake(id) {
    const el = document.getElementById(`slider-${id}`);
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  }

  /**
   * Formatteren van waardes
   */
  function formatSliderValue(value, unit, isFinancieel = false) {
    const formatted = value.toLocaleString('nl-NL', {
      minimumFractionDigits: isFinancieel ? 0 : 1,
      maximumFractionDigits: isFinancieel ? 0 : 1
    });

    if (isFinancieel || unit === 'eur') {
      return `€ ${formatted},-`;
    } else {
      return `${formatted} ${unit}`;
    }
  }

  return { initStandardSliders, renderMestsoortSlider, updateSliders, shake };

})();
