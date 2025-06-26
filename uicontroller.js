/**
 * uicontroller.js
 * Verantwoordelijk voor slider rendering en updates
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { LogicEngine } from './logicengine.js';

export const UIController = (() => {
  function initStandardSliders() {
    const sliders = [
      { id: 'stikstof', label: 'Stikstof (N)', unit: 'kg' },
      { id: 'fosfaat', label: 'Fosfaat (P)', unit: 'kg' },
      { id: 'kalium', label: 'Kalium (K)', unit: 'kg' },
      { id: 'organisch', label: 'Organische stof', unit: 'kg' },
      { id: 'kunststikstof', label: 'Kunstmest (N)', unit: 'kg' },
      { id: 'financieel', label: 'Kosten', unit: 'eur' }
    ];

    const container = document.getElementById('standard-sliders');
    sliders.forEach(sl => {
      const wrapper = document.createElement('div');
      wrapper.className = 'slider-wrapper';
      wrapper.innerHTML = `
        <label for="slider-${sl.id}">${sl.label}</label>
        <input type="range" id="slider-${sl.id}" min="0" max="10000" step="1" value="0">
        <span id="value-${sl.id}">0</span>
        <input type="checkbox" id="lock-${sl.id}"> 🔒
      `;
      container.appendChild(wrapper);

      const slider = wrapper.querySelector(`#slider-${sl.id}`);
      slider.addEventListener('input', () => {
        const val = Number(slider.value);
        LogicEngine.onSliderChange(sl.id, val);
      });

      const lock = wrapper.querySelector(`#lock-${sl.id}`);
      lock.addEventListener('change', () => {
        StateManager.setLock(sl.id, lock.checked);
      });
    });
  }

  function renderMestsoortSlider(id, data) {
    const container = document.getElementById('mestsliders');
    if (document.getElementById(`slider-${id}`)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'slider-wrapper';
    wrapper.innerHTML = `
      <label for="slider-${id}">${id}</label>
      <input type="range" id="slider-${id}" min="0" max="650" step="1" value="0">
      <span id="value-${id}">0</span>
      <input type="checkbox" id="lock-${id}"> 🔒
    `;
    container.appendChild(wrapper);

    const slider = wrapper.querySelector(`#slider-${id}`);
    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      LogicEngine.onSliderChange(id, val);
    });

    const lock = wrapper.querySelector(`#lock-${id}`);
    lock.addEventListener('change', () => {
      StateManager.setLock(id, lock.checked);
    });
  }

  function updateStandardSlider(id, value, max, unit) {
    const el = document.getElementById(`slider-${id}`);
    const valEl = document.getElementById(`value-${id}`);
    if (!el || !valEl) return;
    el.max = max;
    el.value = value;
    valEl.textContent = `${Math.round(value)} / ${Math.round(max)} ${unit}`;
  }

  function updateMestsoortenSliders() {
    const actieve = StateManager.getActieveMest();
    for (const [id, mest] of Object.entries(actieve)) {
      const el = document.getElementById(`slider-${id}`);
      const valEl = document.getElementById(`value-${id}`);
      if (!el || !valEl) continue;
      const max = CalculationEngine.calculateMaxAllowedTonnage(id);
      el.max = max;
      el.value = mest.ton;
      valEl.textContent = `${mest.ton} / ${max} ton`;
    }
  }

  function updateSliders() {
    const ruimte = StateManager.getGebruiksruimte();
    const totaalDierlijk = CalculationEngine.calculateTotalNutrients(false);
    const totaalInclKunstmest = CalculationEngine.calculateTotalNutrients(true);

    updateStandardSlider('stikstof', totaalDierlijk.N, Math.min(ruimte.A, ruimte.B - StateManager.getKunstmest()), 'kg');
    updateStandardSlider('fosfaat', totaalInclKunstmest.P, ruimte.C, 'kg');
    updateStandardSlider('kalium', totaalInclKunstmest.K, ruimte.B * 1.25, 'kg');
    updateStandardSlider('organisch', totaalInclKunstmest.OS, 3000, 'kg');
    updateStandardSlider('kunststikstof', StateManager.getKunstmest(), ruimte.B, 'kg');
    updateStandardSlider('financieel', totaalInclKunstmest.FIN, 10000, 'eur');

    updateMestsoortenSliders();
  }

  function shake(id) {
    const el = document.getElementById(`slider-${id}`);
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  }

  return {
    initStandardSliders,
    renderMestsoortSlider,
    updateSliders,
    shake
  };
})();
