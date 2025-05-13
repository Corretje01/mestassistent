// mestplan.js

// referentie naar container
const slidersContainer = document.getElementById('sliders-container');

// 1) Mest-knoppen: toggle en dynamisch sliders toevoegen/verwijderen
document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    const key   = `${btn.dataset.type}-${btn.dataset.animal}`;
    const label = btn.textContent;
    if (btn.classList.contains('active')) {
      addDynamicSlider(key, label);
    } else {
      removeDynamicSlider(key);
    }
  });
});

// 2) Init standaard sliders
const standaardSliders = [
  { id: 'stikstof',  max: 2000, unit: 'kg' },
  { id: 'fosfaat',   max: 800,  unit: 'kg' },
  { id: 'kalium',    max: 7500, unit: 'kg' },
  { id: 'organisch', max: 3000, unit: 'kg' }
];
standaardSliders.forEach(({id, max, unit}) => initSlider(id, max, unit));

// 3a) Functie om dynamische slider toe te voegen
function addDynamicSlider(key, label) {
  if (document.getElementById(`slider-${key}`)) return;
  const maxTon = 650;
  const group = document.createElement('div');
  group.className = 'slider-group';
  group.id = `group-${key}`;

  // **aangepaste structuur met checkbox, label en value op één regel**
  group.innerHTML = `
    <div class="slider-header">
      <input type="checkbox" id="lock-${key}" />
      <label for="slider-${key}">${label}</label>
      <span class="value" id="value-${key}">0 / ${maxTon} ton</span>
    </div>
    <input
      type="range"
      id="slider-${key}"
      min="0"
      max="${maxTon}"
      step="1"
    />
  `;
  slidersContainer.appendChild(group);

  const slider    = group.querySelector('input[type="range"]');
  const valueEl   = group.querySelector('.value');
  const lockInput = group.querySelector('input[type="checkbox"]');

  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} / ${maxTon} ton`;
  });
  lockInput.addEventListener('change', () => {
    slider.disabled = lockInput.checked;
  });
}

// 3b) Functie om dynamische slider te verwijderen
function removeDynamicSlider(key) {
  const group = document.getElementById(`group-${key}`);
  if (group) group.remove();
}

// 4) Helper voor init standaard sliders
function initSlider(id, max, unit) {
  const slider  = document.getElementById(`slider-${id}`);
  const valueEl = document.getElementById(`value-${id}`);
  valueEl.textContent = `0 / ${max} ${unit}`;
  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} / ${max} ${unit}`;
  });
}

// 5) Knop om mestplan te berekenen
document.getElementById('optimaliseer-btn').addEventListener('click', () => {
  const resultaat = [];

  standaardSliders.forEach(s => {
    resultaat.push({
      key: s.id,
      val: Number(document.getElementById(`slider-${s.id}`).value),
      locked: document.getElementById(`lock-${s.id}`).checked
    });
  });

  document.querySelectorAll('[id^="group-"]').forEach(group => {
    const key = group.id.replace('group-', '');
    resultaat.push({
      key,
      val: Number(group.querySelector('input[type="range"]').value),
      locked: group.querySelector('input[type="checkbox"]').checked
    });
  });

  resultaat.push({
    key: 'financieel',
    val: Number(document.getElementById('slider-financieel').value),
    locked: document.getElementById('lock-financieel').checked
  });

  console.log('Plan-uitkomst:', resultaat);
  // … hier je eigen verwerking …
});
