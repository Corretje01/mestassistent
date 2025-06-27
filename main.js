import { StateManager } from './statemanager.js';
import { UIController } from './uicontroller.js';
import { LogicEngine } from './logicengine.js';
import { CalculationEngine } from './calculationengine.js';
import { ValidationEngine } from './validationengine.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Laad mestsoorten uit JSON
  const response = await fetch('./mestsoorten.json');
  const mestData = await response.json();
  StateManager.setMestTypes(mestData);

  // Stel gebruiksruimte in op basis van URL-query's
  const query = new URLSearchParams(window.location.search);
  const totaalA = parseFloat(query.get('totaalA') || '0'); // stikstof
  const totaalB = parseFloat(query.get('totaalB') || '0'); // stikstof incl. kunstmest
  const totaalC = parseFloat(query.get('totaalC') || '0'); // fosfaat
  StateManager.setGebruiksruimte(totaalA, totaalB, totaalC);

  // Initialiseer UI
  UIController.initStandardSliders();
  UIController.hideSlidersContainer();

  // Klik op mestsoort-knop activeert sliders
  const knoppen = document.querySelectorAll('.mesttype');
  knoppen.forEach(knop => {
    knop.addEventListener('click', () => {
      const id = knop.dataset.mestid;
      const mest = StateManager.getMestTypes()[id];
      if (!mest) return;

      const alActief = StateManager.getActieveMest()[id];
      if (alActief) {
        // Verwijderen
        StateManager.removeMestType(id);
        knop.classList.remove('active');
        document.getElementById(`group-${id}`)?.remove();
      } else {
        // Toevoegen
        StateManager.addMestType(id, mest);
        knop.classList.add('active');
        const max = CalculationEngine.calculateMaxAllowedTonnage(id);
        UIController.renderMestsoortSlider(id, mest.naam, max);
      }

      const actief = Object.keys(StateManager.getActieveMest()).length > 0;
      if (actief) UIController.showSlidersContainer();
      else UIController.hideSlidersContainer();

      UIController.updateSliders();
    });
  });

  // Initiale update van UI
  UIController.updateSliders();

  // Debug-knop
  const btn = document.getElementById('controleer-plan');
  if (btn) {
    btn.addEventListener('click', () => {
      const result = ValidationEngine.checkUsageLimits();
      alert(result ? '✅ Alles binnen de grenzen!' : '⚠️ Overschrijding gedetecteerd.');
    });
  }
});
