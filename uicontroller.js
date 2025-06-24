/**
 * uicontroller.js
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
      { id: 'stikstof', label: 'Stikstof dierlijk', max: ruimte.A || 10000, unit: 'kg' },
      { id: 'fosfaat', label: 'Fosfaat', max: ruimte.C || 5000, unit: 'kg' },
      { id: 'kalium', label: 'Kalium', max: (ruimte.B || 10000) * 1.25, unit: 'kg' },
      { id: 'organisch', label: 'Organische stof', max: 3000, unit: 'kg' },
      { id: 'kunststikstof', label: 'Kunstmest stikstof', max: ruimte.B || 10000, unit: 'kg' },
      { id: 'financieel', label: 'Kosten', max: 10000, unit: 'eur' }
    ];

    sliders.forEach(slider => {
      renderSlider({
        id: slider.id,
        label: slider.label,
        max: slider.max,
        unit: slider.unit,
        lockable: true,
        onChange: (newValue) => {
          LogicEngine.onSliderChange(slider.id, newValue);
        }
      });
    });
  }

  function initMestsoortenSliders() {
    const actieveMest = StateManager.getActieveMest();
    for (const id in actieveMest) {
      const mest = actieveMest[id];
      const maxTon = ValidationEngine.getMaxTonnage(id);

      renderSlider({
        id: id,
        label: mest.label,
        max: maxTon,
        unit: 'ton',
        lockable: true,
        onChange: (newValue) => {
          if (ValidationEngine.isLocked(id)) {
            shake(id);
            return;
          }
          StateManager.setMestTonnage(id, newValue);
          updateSliders();
        }
      });
    }
  }

  function renderSlider({ id, label, max, unit, initialValue = 0, lockable = true, onChange }) {
    const container = document.getElementById('sliders-container');
    const group = document.createElement('div');
    group.className = 'slider-group';
    group.id = `group-${id}`;

    group.innerHTML = `
      <div class="slider-header">
        ${lockable ? `<input type="checkbox" id="lock-${id}" />` : ''}
        <label for="slider-${id}">${label}</label>
        <span class="value" id="value-${id}">${initialValue} / ${max} ${unit}</span>
      </div>
      <input type="range" id="slider-${id}" min="0" max="${max}" step="0.1" value="${initialValue}" />
    `;
    container.appendChild(group);

    if (lockable) {
      document.getElementById(`lock-${id}`).addEventListener('change', (e) => {
        StateManager.setLock(id, e.target.checked);
      });
    }

    document.getElementById(`slider-${id}`).addEventListener('input', (e) => {
      onChange(parseFloat(e.target.value));
    });
  }

  function updateSliders() {
    const total = CalculationEngine.calculateTotalNutrients(true);

    updateSliderValue('stikstof', total.N);
    updateSliderValue('fosfaat', total.P);
    updateSliderValue('kalium', total.K);
    updateSliderValue('organisch', total.OS);
    updateSliderValue('financieel', total.FIN);
    updateSliderValue('kunststikstof', StateManager.getKunstmest());

    const actieveMest = StateManager.getActieveMest();
    for (const id in actieveMest) {
      const mest = actieveMest[id];
      const slider = document.getElementById(`slider-${id}`);
      const valueEl = document.getElementById(`value-${id}`);
      if (slider && valueEl) {
        slider.value = mest.ton.toFixed(1);
        valueEl.textContent = `${mest.ton.toFixed(1)} / ${slider.max} ton`;
      }
    }
  }

  function updateSliderValue(id, value) {
    const slider = document.getElementById(`slider-${id}`);
    const valueEl = document.getElementById(`value-${id}`);
    if (!slider || !valueEl) return;

    slider.value = value.toFixed(1);
    valueEl.textContent = `${value.toFixed(1)} / ${slider.max}`;
  }

  function shake(id) {
    const el = document.getElementById(`group-${id}`);
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  }

  return {
    initStandardSliders,
    initMestsoortenSliders,
    updateSliders,
    shake
  }

})();
