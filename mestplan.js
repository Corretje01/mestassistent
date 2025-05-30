// mestplan.js

// Haal totaalwaardes op uit URL (nog zonder ze te gebruiken)
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

// mapping van data-type naar nette categorie-naam
const categoryMap = {
  drijfmest: 'Drijfmest',
  vastemest: 'Vaste mest',
  overig:    'Overig'
};

// referentie naar container
const slidersContainer = document.getElementById('sliders-container');

// globale opslag voor mestdata
let mestsoortenData = {};
const actieveMestData = {}; // bevat ook tonnage en berekende totalen per soort

// laad JSON met mestwaardes
fetch('/data/mestsoorten.json')
  .then(res => res.json())
  .then(json => {
    mestsoortenData = json;
    console.log('✅ mestsoorten.json geladen:', mestsoortenData);
  })
  .catch(err => console.error('❌ Kan mestsoorten.json niet laden:', err));

// 1) Mest-knoppen: toggle en dynamisch sliders toevoegen/verwijderen
const jsonKeyMap = {
  vastemest: 'vaste_mest',
  drijfmest: 'drijfmest',
  overig:    'overig'
};

document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');

    const type   = btn.dataset.type;
    const animal = btn.dataset.animal;
    const key    = `${type}-${animal}`;
    const label  = `${categoryMap[type]} ${animal}`;

    if (btn.classList.contains('active')) {
    addDynamicSlider(key, label);

    const jsonType = jsonKeyMap[type];

    // Uitsluiten van mestsoort 'eend'
    if (animal === 'eend') {
      console.warn(`⚠️ 'eend' wordt overgeslagen zoals aangegeven.`);
      return;
    }

    if (mestsoortenData[jsonType] && mestsoortenData[jsonType][animal]) {
        actieveMestData[key] = {
          ...mestsoortenData[type][animal],
          ton: 0,
          totaal: {
            N: 0,
            P: 0,
            K: 0,
            OS: 0,
            DS: 0,
            BG: 0
          }
        };
        console.log(`📦 Geselecteerd: ${key}`, actieveMestData[key]);
        updateStandardSliders();
      } else {
        console.warn(`⚠️ Geen mestdata gevonden voor ${key} (type: ${jsonType})`);
      }

    } else {
      removeDynamicSlider(key);
      delete actieveMestData[key];
      updateStandardSliders();
    }
  });
});

// 2) Init standaard sliders
const standaardSliders = [
  { id: 'stikstof',        label: 'Stikstof uit dierlijke mest',     max: totaalA, unit: 'kg' },
  { id: 'fosfaat',         label: 'Fosfaat',                         max: totaalC, unit: 'kg' },
  { id: 'kalium',          label: 'Kalium',                          max: 7500,    unit: 'kg' },
  { id: 'organisch',       label: 'Organische stof',                 max: 3000,    unit: 'kg' },
  { id: 'kunststikstof',   label: 'Stikstof uit kunstmest',          max: 5000,    unit: 'kg' },
  { id: 'financieel',      label: 'Geschatte financiële vergoeding', max: 10000,   unit: 'eur' }
];

standaardSliders.forEach(({id, label, max, unit}) => initSlider(id, label, max, unit));

function updateStandardSliders() {
  let totalN = 0, totalP = 0, totalK = 0, totalOS = 0;

  for (const key in actieveMestData) {
    const mest = actieveMestData[key];
    if (mest?.totaal) {
      totalN  += mest.totaal.N;
      totalP  += mest.totaal.P;
      totalK  += mest.totaal.K;
      totalOS += mest.totaal.OS;
    }
  }

  const totalen = [
    { id: 'stikstof',  value: totalN },
    { id: 'fosfaat',   value: totalP },
    { id: 'kalium',    value: totalK },
    { id: 'organisch', value: totalOS }
  ];

  totalen.forEach(({id, value}) => {
    const slider = document.getElementById(`slider-${id}`);
    const valueEl = document.getElementById(`value-${id}`);
    const lock = document.getElementById(`lock-${id}`);

    if (slider && valueEl && lock && !lock.checked) {
      const rounded = Math.round(value);
      slider.value = rounded;
      valueEl.textContent = `${rounded} / ${slider.max} kg`;
    }
  });
}

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
    const ton = Number(slider.value);
    valueEl.textContent = `${ton} / ${maxTon} ton`;

    if (actieveMestData[key]) {
      const data = actieveMestData[key];
      data.ton = ton;
      data.totaal = {
        N: ton * data.N_kg_per_ton,
        P: ton * data.P_kg_per_ton,
        K: ton * data.K_kg_per_ton,
        OS: ton * (data.OS_percent / 100),
        DS: ton * (data.DS_percent / 100),
        BG: ton * data.biogaspotentieel_m3_per_ton
      };
      updateStandardSliders();
    }
  });

  lockInput.addEventListener('change', () => {
    slider.disabled = lockInput.checked;
  });
}

function removeDynamicSlider(key) {
  const group = document.getElementById(`group-${key}`);
  if (group) group.remove();
}

function initSlider(id, label, max, unit) {
  if (document.getElementById(`slider-${id}`)) return;

  const group = document.createElement('div');
  group.className = 'slider-group';
  group.id = `group-${id}`;
  group.innerHTML = `
    <div class="slider-header">
      <input type="checkbox" id="lock-${id}" />
      <label for="slider-${id}">${label || (id.charAt(0).toUpperCase() + id.slice(1))}</label>
      <span class="value" id="value-${id}">0 / ${Math.round(max)} ${unit}</span>
    </div>
    <input
      type="range"
      id="slider-${id}"
      min="0"
      max="${Math.round(max)}"
      step="1"
    />
  `;
  slidersContainer.appendChild(group);

  const slider  = group.querySelector(`#slider-${id}`);
  const valueEl = group.querySelector(`#value-${id}`);

  slider.value = Math.round(max / 2);
  valueEl.textContent = `${slider.value} / ${Math.round(max)} ${unit}`;

  slider.addEventListener('input', () => {
    const val = Math.min(Number(slider.value), Math.round(max));
    valueEl.textContent = `${val} / ${Math.round(max)} ${unit}`;
  });

  const lockInput = group.querySelector(`#lock-${id}`);
  lockInput.addEventListener('change', () => {
    slider.disabled = lockInput.checked;
  });
}

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
  console.log('Totaal actieve mestdata:', actieveMestData);
});
