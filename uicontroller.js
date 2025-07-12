/**
 * uiController.js
 * Beheert alle DOM-interacties en updates van sliders
 */

import { StateManager } from './statemanager.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';
import { LogicEngine } from './logicengine.js';

export const UIController = (() => {
  let standardSlidersInitialized = false;

  function init() {
    initButtonListeners();
  }

  function initButtonListeners() {
    const buttons = document.querySelectorAll('.btn.mest-btn');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const id = button.id;
        const isActive = button.classList.contains('active');
        if (!isActive) {
          button.classList.add('active');
          StateManager.addMestType(id, { ton: 0 });
          if (!standardSlidersInitialized) {
            initStandardSliders();
            standardSlidersInitialized = true;
          }
          renderMestsoortSlider(id, button.textContent, 100);
          showSliders();
        } else {
          button.classList.remove('active');
          StateManager.removeMestType(id);
          removeMestsoortSlider(id);
          if (!document.querySelector('.btn.mest-btn.active')) {
            hideSliders();
            standardSlidersInitialized = false; // Reset voor volgende keer
          }
        }
      });
    });
  }

  function initStandardSliders() {
    const ruimte = StateManager.getGebruiksruimte ? StateManager.getGebruiksruimte() : { A: 1000, B: 1000, C: 1000 };
    const nutrientContainer = document.getElementById('nutrient-sliders');

    const sliders = [
      { id: 'stikstof', label: 'Stikstof dierlijk', max: ruimte.A, unit: 'kg' },
      { id: 'fosfaat', label: 'Fosfaat', max: ruimte.C, unit: 'kg' },
      { id: 'kalium', label: 'Kalium', max: ruimte.B * 1.25, unit: 'kg' },
      { id: 'organisch', label: 'Organische stof', max: 3000, unit: 'kg' },
      { id: 'kunststikstof', label: 'Kunstmest stikstof', max: ruimte.B, unit: 'kg' },
      { id: 'financieel', label: 'Kosten', max: 10000, unit: 'eur' }
    ];

    sliders.forEach(s => createStandardSlider(s.id, s.label, s.max, s.unit, nutrientContainer));
  }

  function createStandardSlider(id, label, max, unit, container) {
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

    const lockEl = document.getElementById(`lock-${id}`);
    const sliderEl = document.getElementById(`slider-${id}`);

    lockEl.addEventListener('change', (e) => {
      const locked = e.target.checked;
      if (typeof StateManager.setLock === 'function') {
        StateManager.setLock(id, locked);
      }
      if (sliderEl) sliderEl.disabled = locked;
      updateSliders();
    });

    sliderEl.addEventListener('input', (e) => {
      if (typeof LogicEngine.onSliderChange === 'function') {
        LogicEngine.onSliderChange(id, parseFloat(e.target.value));
      }
    });
  }

  function renderMestsoortSlider(id, label, max) {
    const container = document.getElementById('mest-sliders');
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

    const lockEl = document.getElementById(`lock-${id}`);
    const sliderEl = document.getElementById(`slider-${id}`);

    lockEl.addEventListener('change', (e) => {
      const locked = e.target.checked;
      if (typeof StateManager.setLock === 'function') {
        StateManager.setLock(id, locked);
      }
      if (sliderEl) sliderEl.disabled = locked;
      updateSliders();
    });

    sliderEl.addEventListener('input', (e) => {
      if (typeof LogicEngine.onSliderChange === 'function') {
        LogicEngine.onSliderChange(id, parseFloat(e.target.value));
      }
    });
  }

  function removeMestsoortSlider(id) {
    const group = document.getElementById(`group-${id}`);
    if (group) group.remove();
  }

  function updateSliders() {
    const nutDierlijk = CalculationEngine.berekenNutriënten ? CalculationEngine.berekenNutriënten(false) : { stikstof: 0, fosfaat: 0, kalium: 0, organisch: 0 };
    const nutInclKunstmest = CalculationEngine.berekenNutriënten ? CalculationEngine.berekenNutriënten(true) : { financieel: 0 };

    const sliders = [
      { id: 'stikstof', value: nutDierlijk.stikstof, unit: 'kg' },
      { id: 'fosfaat', value: nutDierlijk.fosfaat, unit: 'kg' },
      { id: 'kalium', value: nutDierlijk.kalium, unit: 'kg' },
      { id: 'organisch', value: nutDierlijk.organisch, unit: 'kg' },
      { id: 'kunststikstof', value: StateManager.getKunstmest ? StateManager.getKunstmest() : 0, unit: 'kg' },
      { id: 'financieel', value: nutInclKunstmest.financieel, unit: 'eur' }
    ];

    sliders.forEach(({ id, value, unit }) => {
      const sliderEl = document.getElementById(`slider-${id}`);
      const valueEl = document.getElementById(`value-${id}`);
      if (!sliderEl || !valueEl) return;

      const afgerond = Math.round(value * 10) / 10;
      const locked = StateManager.isLocked ? StateManager.isLocked(id) : false;

      sliderEl.disabled = locked;
      if (!locked) {
        sliderEl.value = afgerond;
      }

      valueEl.textContent = `${afgerond} / ${sliderEl.max} ${unit}`;
    });

    updateMestsoortenSliders();
  }

  function updateMestsoortenSliders() {
    const actieveMest = StateManager.getActieveMest ? StateManager.getActieveMest() : {};

    for (const [id, mest] of Object.entries(actieveMest)) {
      const sliderEl = document.getElementById(`slider-${id}`);
      const valueEl = document.getElementById(`value-${id}`);
      if (!sliderEl || !valueEl) continue;

      const afgerond = Math.round(mest.ton * 10) / 10;
      const locked = StateManager.isLocked ? StateManager.isLocked(id) : false;

      sliderEl.disabled = locked;
      if (!locked) {
        sliderEl.value = afgerond;
      }

      valueEl.textContent = `${afgerond} / ${sliderEl.max} ton`;
    }
  }

  function shake(id) {
    const slider = document.getElementById(`slider-${id}`);
    if (!slider) return;
    slider.classList.add('shake');
    setTimeout(() => slider.classList.remove('shake'), 400);
  }

  function showSliders() {
    const mestContainer = document.getElementById('mest-sliders');
    const nutrientContainer = document.getElementById('nutrient-sliders');
    if (mestContainer) mestContainer.style.display = 'block';
    if (nutrientContainer) nutrientContainer.style.display = 'block';
  }

  function hideSliders() {
    const mestContainer = document.getElementById('mest-sliders');
    const nutrientContainer = document.getElementById('nutrient-sliders');
    if (mestContainer) mestContainer.style.display = 'none';
    if (nutrientContainer) nutrientContainer.style.display = 'none';
  }

  return {
    init,
    initStandardSliders,
    renderMestsoortSlider,
    updateSliders,
    shake,
    showSliders,
    hideSliders
  };

})();
