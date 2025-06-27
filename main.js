import { UIController } from './uicontroller.js';
import { StateManager } from './statemanager.js';
import { LogicEngine } from './logicengine.js';

// Haal query parameters op voor gebruiksruimte
const urlParams = new URLSearchParams(window.location.search);
const totaalA = parseFloat(urlParams.get('totaalA')) || 0;
const totaalB = parseFloat(urlParams.get('totaalB')) || 0;
const totaalC = parseFloat(urlParams.get('totaalC')) || 0;

StateManager.setGebruiksruimte(totaalA, totaalB, totaalC);

// Fetch mestsoortenlijst en bouw checkboxes
fetch('data/mestsoorten.json')
  .then(response => response.json())
  .then(data => {
    StateManager.setMestTypes(data);

    const container = document.getElementById('mestsoorten-container');
    Object.entries(data).forEach(([id, mest]) => {
      const label = document.createElement('label');
      label.classList.add('checkbox-label');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.id = id;

      const kleurblok = document.createElement('span');
      kleurblok.classList.add('kleurblok');
      kleurblok.style.backgroundColor = mest.kleur || '#ccc';

      const naam = document.createElement('span');
      naam.textContent = mest.label;

      label.appendChild(checkbox);
      label.appendChild(kleurblok);
      label.appendChild(naam);
      container.appendChild(label);

      checkbox.addEventListener('change', () => {
        const isSelected = checkbox.checked;

        if (isSelected) {
          StateManager.addMestType(id, mest);
          UIController.renderMestsoortSlider(id, mest);
          label.classList.add('geselecteerd');
        } else {
          StateManager.removeMestType(id);
          UIController.removeMestsoortSlider(id);
          label.classList.remove('geselecteerd');
        }

        const actieveCount = Object.keys(StateManager.getActieveMest()).length;
        if (actieveCount > 0) {
          UIController.showSlidersContainer();

          // Voer alleen init uit bij eerste selectie
          if (actieveCount === 1) {
            UIController.initStandardSliders();
          }

          UIController.updateSliders();
        } else {
          UIController.hideSlidersContainer();
        }
      });
    });
  })
  .catch(error => console.error('Fout bij laden mestsoorten.json:', error));
