// mestplan.js

// Container voor alle sliders
const slidersContainer = document.getElementById('sliders-container');

// 1) Mest‐knoppen logica: togglen en dynamisch sliders toevoegen/verwijderen
document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) {
      addDynamicSlider(type, capitalize(type), 650);
    } else {
      removeDynamicSlider(type);
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
standaardSliders.forEach(s => initSlider(s.id, s.max, s.unit));

// 3a) Functie om dynamische slider toe te voegen
function addDynamicSlider(key, label, max) {
  if (document.getElementById(`slider-${key}`)) return;

  const group = document.createElement('div');
  group.className = 'slider-group';
  group.id = `group-${key}`;

  group.innerHTML = `
    <div class="slider-header">
      <input type="checkbox" id="lock-${key}" />
      <label for="slider-${key}">${label}</label>
      <span class="value" id="value-${key}">0 / ${max} ton</span>
    </div>
    <input
      type="range"
      id="slider-${key}"
      min="0"
      max="${max}"
      step="1"
    />
  `;
  slidersContainer.appendChild(group);

  const slider    = group.querySelector(`input[type="range"]`);
  const valueEl   = group.querySelector(`.value`);
  const lockInput = group.querySelector(`input[type="checkbox"]`);

  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} / ${max} ton`;
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

// 4) Helper voor standaard sliders
function initSlider(id, max, unit) {
  const slider  = document.getElementById(`slider-${id}`);
  const valueEl = document.getElementById(`value-${id}`);
  valueEl.textContent = `0 / ${max} ${unit}`;
  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} / ${max} ${unit}`;
  });
  // Voeg hier eventueel lock‐logic toe als gewenst
}

// 5) Knop om berekening uit te voeren
document.getElementById('optimaliseer-btn').addEventListener('click', () => {
  const resultaat = [];

  // standaard
  standaardSliders.forEach(s => {
    resultaat.push({
      key:    s.id,
      val:    Number(document.getElementById(`slider-${s.id}`).value),
      locked: document.getElementById(`lock-${s.id}`).checked
    });
  });

  // dynamisch
  document.querySelectorAll('[id^="group-"]').forEach(group => {
    const key = group.id.replace('group-', '');
    resultaat.push({
      key,
      val:    Number(group.querySelector('input[type="range"]').value),
      locked: group.querySelector('input[type="checkbox"]').checked
    });
  });

  // financieel
  resultaat.push({
    key:    'financieel',
    val:    Number(document.getElementById('slider-financieel').value),
    locked: document.getElementById('lock-financieel').checked
  });

  console.log('Plan-uitkomst:', resultaat);
  // … verwerk het resultaat verder …
});

// hulpfunctie
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
