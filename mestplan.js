// mestplan.js

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

const categoryMap = {
  drijfmest: 'Drijfmest',
  vastemest: 'Vaste mest',
  overig:    'Overig'
};

const jsonKeyMap = {
  vastemest: 'vaste_mest',
  drijfmest: 'drijfmest',
  overig:    'overig'
};

const slidersContainer = document.getElementById('sliders-container');

let mestsoortenData = {};
const actieveMestData = {};

fetch('/data/mestsoorten.json')
  .then(res => res.json())
  .then(json => {
    mestsoortenData = json;
    console.log('✅ mestsoorten.json geladen:', mestsoortenData);
  })
  .catch(err => console.error('❌ Kan mestsoorten.json niet laden:', err));

document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');

    const type   = btn.dataset.type;
    const animal = btn.dataset.animal;
    const key    = `${type}-${animal}`;
    const label  = `${categoryMap[type]} ${animal}`;
    const jsonType = jsonKeyMap[type];

    if (btn.classList.contains('active')) {
      addDynamicSlider(key, label);

      if (mestsoortenData[jsonType] && mestsoortenData[jsonType][animal]) {
        actieveMestData[key] = {
          ...mestsoortenData[jsonType][animal],
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
        console.warn(`⚠️ Geen mestdata gevonden voor ${key}`);
      }

    } else {
      removeDynamicSlider(key);
      delete actieveMestData[key];
      updateStandardSliders();
    }
  });
});

function createStandaardSliders(totaalA, totaalB, totaalC) {
  const maxKalium = totaalB * 1.25;
  return [
    { id: 'stikstof',        label: 'Stikstof uit dierlijke mest',     max: totaalA, unit: 'kg' },
    { id: 'fosfaat',         label: 'Fosfaat',                         max: totaalC, unit: 'kg' },
    { id: 'kalium', label: 'Kalium', max: maxKalium, unit: 'kg' },
    { id: 'organisch',       label: 'Organische stof',                 max: 3000,    unit: 'kg' },
    { id: 'kunststikstof',   label: 'Stikstof uit kunstmest',          max: totaalB, unit: 'kg' },
    { id: 'financieel',      label: 'Geschatte financiële vergoeding', max: 10000,   unit: 'eur' }
  ];
}

const standaardSliders = createStandaardSliders(totaalA, totaalB, totaalC);

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

  const kunstmestSlider = document.getElementById('slider-kunststikstof');
  const kunstmestValue  = document.getElementById('value-kunststikstof');
  const kunstmestLock   = document.getElementById('lock-kunststikstof');

  if (kunstmestSlider && kunstmestValue && kunstmestLock && !kunstmestLock.checked) {
    const remainingN = Math.max(0, totaalB - totalN);
    kunstmestSlider.value = Math.round(remainingN);
    kunstmestValue.textContent = `${Math.round(remainingN)} / ${kunstmestSlider.max} kg`;
  }

  const totalen = [
    { id: 'stikstof',  value: totalN },
    { id: 'fosfaat',   value: totalP },
    { id: 'kalium',    value: totalK },
    { id: 'organisch', value: totalOS },
    { id: 'financieel', value: Object.values(actieveMestData).reduce((sum, m) => sum + (m?.totaal?.FIN || 0), 0) }
  ];

  totalen.forEach(({id, value}) => {
    const sliderEl = document.getElementById(`slider-${id}`);
    const valueElem = document.getElementById(`value-${id}`);
    const lockElem = document.getElementById(`lock-${id}`);
    const unit = standaardSliders.find(s => s.id === id)?.unit || 'kg';
    const slider = document.getElementById(`slider-${id}`);
    const valueEl = document.getElementById(`value-${id}`);
    const lock = document.getElementById(`lock-${id}`);

    if (sliderEl && valueElem && lockElem && !lockElem.checked) {
      const rounded = Math.round(value);
      sliderEl.value = rounded;
      valueElem.textContent = `${rounded} / ${sliderEl.max} ${unit}`;
    }
  });
}

function addDynamicSlider(key, label) {
  if (document.getElementById(`slider-${key}`)) return;
  let maxTon = 650;
  const limiterMap = {
    'drijfmest-koe': ['drijfmest', 'koe'],
    'drijfmest-varken': ['drijfmest', 'varken'],
    'vastemest-varken': ['vaste_mest', 'varken'],
    'vastemest-koe': ['vaste_mest', 'koe'],
    'vastemest-geit': ['vaste_mest', 'geit'],
    'vastemest-kip': ['vaste_mest', 'kip'],
    'vastemest-paard': ['vaste_mest', 'paard'],
    'overig-digestaat': ['overig', 'digestaat'],
    'overig-champost': ['overig', 'champost'],
    'overig-compost': ['overig', 'compost']
  };

  if (limiterMap[key]) {
    const [type, animal] = limiterMap[key];
    if (mestsoortenData[type] && mestsoortenData[type][animal]) {
      const data = mestsoortenData[type][animal];
      if (data.N_kg_per_ton && data.P_kg_per_ton) {
      const maxN = totaalA / data.N_kg_per_ton;
      const maxP = totaalC / data.P_kg_per_ton;
      maxTon = Math.floor(Math.min(maxN, maxP));
    }
    }
  }
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
      const transportkosten = 10; // EUR per ton (voor toekomstige uitbreiding)
      data.totaal = {
        N: ton * data.N_kg_per_ton,
        P: ton * data.P_kg_per_ton,
        K: ton * data.K_kg_per_ton,
        OS: ton * (data.OS_percent / 100),
        DS: ton * (data.DS_percent / 100),
        BG: ton * data.biogaspotentieel_m3_per_ton,
        FIN: ton * (data.Inkoopprijs_per_ton - 10) // inkoopprijs minus €10 transportkosten per ton
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
