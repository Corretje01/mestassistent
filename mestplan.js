// mestplan.js

// 0) Hulpfunctie: URL-parameters uitlezen
function getQueryParams() {
  const params = {};
  window.location.search.substring(1).split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return params;
}

const queryParams = getQueryParams();
const totaalA = Number(queryParams['totaalA']) || null;
const totaalB = Number(queryParams['totaalB']) || null;
const totaalC = Number(queryParams['totaalC']) || null;

if (!totaalA || !totaalB || !totaalC) {
  alert("Waarschuwing: de gebruiksruimte kon niet worden overgenomen van stap 1.");
}

console.log("TotaalA (N dierlijk):", totaalA);
console.log("TotaalB (N grondgebonden):", totaalB);
console.log("TotaalC (P totaal):", totaalC);

// 0.1) Data containers
const slidersContainer = document.getElementById('sliders-container');
const categoryMap = {
  drijfmest: 'Drijfmest',
  vastemest: 'Vaste mest',
  overig:    'Overig'
};
const actieveMestData = {}; // per mestsoort key
let mestsoortenData = {};   // json uit data/mestsoorten.json

// 0.2) JSON met mestwaardes laden
fetch('/data/mestsoorten.json')
  .then(res => res.json())
  .then(data => {
    mestsoortenData = data;
    console.log("✅ mestsoorten.json geladen", mestsoortenData);
  })
  .catch(err => console.error("❌ Kan mestsoorten.json niet laden:", err));

// 1) Knoppen logica

document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');

    const type   = btn.dataset.type;
    const animal = btn.dataset.animal;
    const key    = `${type}-${animal}`;
    const label  = `${categoryMap[type]} ${animal}`;

    if (btn.classList.contains('active')) {
      addDynamicSlider(key, label);

      // mestwaardes koppelen
      if (mestsoortenData[type] && mestsoortenData[type][animal]) {
        actieveMestData[key] = mestsoortenData[type][animal];
        console.log(`📦 Geselecteerd: ${key}`, actieveMestData[key]);
      } else {
        console.warn(`⚠️ Geen mestdata gevonden voor ${key}`);
      }

    } else {
      removeDynamicSlider(key);
      delete actieveMestData[key];
    }
  });
});

// 2) Init standaard sliders
const standaardSliders = [
  { id: 'stikstof',        max: totaalA, unit: 'kg' },
  { id: 'fosfaat',         max: totaalC, unit: 'kg' },
  { id: 'kalium',          max: 7500,    unit: 'kg' },
  { id: 'organisch',       max: 3000,    unit: 'kg' },
  { id: 'kunststikstof',   max: 5000,    unit: 'kg' },
  { id: 'financieel',      max: 10000,   unit: '€' }
];
standaardSliders.forEach(({id, max, unit}) => initSlider(id, max, unit));

// 3a) Dynamische slider toevoegen
function addDynamicSlider(key, label) {
  if (document.getElementById(`slider-${key}`)) return;
  const maxTon = 650;
  const group = document.createElement('div');
  group.className = 'slider-group';
  group.id = `group-${key}`;
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

  slider.value = 0;
  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} / ${maxTon} ton`;
    // toekomstige stap: koppelen aan andere sliders op basis van actieveMestData[key]
  });

  lockInput.addEventListener('change', () => {
    slider.disabled = lockInput.checked;
  });
}

// 3b) Dynamische slider verwijderen
function removeDynamicSlider(key) {
  const group = document.getElementById(`group-${key}`);
  if (group) group.remove();
}

// 4) Standaard sliders initialiseren
function initSlider(id, max, unit) {
  const slider  = document.getElementById(`slider-${id}`);
  const valueEl = document.getElementById(`value-${id}`);
  const roundedMax = Math.round(max);
  const startValue = Math.round(roundedMax / 2);

  slider.max = roundedMax;
  slider.value = startValue;
  valueEl.textContent = `${startValue} / ${roundedMax} ${unit}`;

  slider.addEventListener('input', () => {
    const val = Math.min(Number(slider.value), roundedMax);
    valueEl.textContent = `${val} / ${roundedMax} ${unit}`;
  });
}

// 5) Optimaliseer-knop

document.getElementById('optimaliseer-btn').addEventListener('click', () => {
  const resultaat = [];

  standaardSliders.forEach(s => {
    resultaat.push({
      key:    s.id,
      val:    Number(document.getElementById(`slider-${s.id}`).value),
      locked: document.getElementById(`lock-${s.id}`).checked
    });
  });

  document.querySelectorAll('[id^="group-"]').forEach(group => {
    const key = group.id.replace('group-', '');
    resultaat.push({
      key,
      val:    Number(group.querySelector('input[type="range"]').value),
      locked: group.querySelector('input[type="checkbox"]').checked
    });
  });

  console.log('Plan-uitkomst:', resultaat);
});
