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

// functie om standaard sliders bij te werken
function updateStandardSliders() {
  let totalN = 0, totalP = 0, totalK = 0, totalOS = 0;

  for (const key in actieveMestData) {
    const totaal = actieveMestData[key].totaal;
    if (!totaal) continue;
    totalN  += totaal.N;
    totalP  += totaal.P;
    totalK  += totaal.K;
    totalOS += totaal.OS;
  }

  const updates = [
    { id: 'stikstof',  val: totalN },
    { id: 'fosfaat',   val: totalP },
    { id: 'kalium',    val: totalK },
    { id: 'organisch', val: totalOS }
  ];

  updates.forEach(({id, val}) => {
    const slider = document.getElementById(`slider-${id}`);
    const valueEl = document.getElementById(`value-${id}`);
    const lock = document.getElementById(`lock-${id}`);
    if (slider && valueEl && lock && !lock.checked) {
      const rounded = Math.round(val);
      slider.value = rounded;
      valueEl.textContent = `${rounded} / ${slider.max} kg`;
    }
  });
}

// 1) Mest-knoppen: toggle en dynamisch sliders toevoegen/verwijderen
document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');

    const type   = btn.dataset.type;               // drijfmest, vastemest of overig
    const animal = btn.dataset.animal;
    const key    = `${type}-${animal}`;
    const label  = `${categoryMap[type]} ${animal}`;

    if (btn.classList.contains('active')) {
      addDynamicSlider(key, label);

      // mestwaardes koppelen
      if (mestsoortenData[type] && mestsoortenData[type][animal]) {
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
        console.warn(`⚠️ Geen mestdata gevonden voor ${key}`);
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

// 3a) Functie om dynamische slider toe te voegen
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
      actieveMestData[key].ton = ton;
      actieveMestData[key].totaal = {
        N: ton * actieveMestData[key].N_kg_per_ton,
        P: ton * actieveMestData[key].P_kg_per_ton,
        K: ton * actieveMestData[key].K_kg_per_ton,
        OS: ton * (actieveMestData[key].OS_percent / 100),
        DS: ton * (actieveMestData[key].DS_percent / 100),
        BG: ton * actieveMestData[key].biogaspotentieel_m3_per_ton
      };
      console.log(`📊 ${key} totaal bij ${ton} ton:`, actieveMestData[key].totaal);
      updateStandardSliders();
    }
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
function initSlider(id, label, max, unit) {
  if (document.getElementById(`slider-${id}`)) {
    return; // slider bestaat al (veiligheidscheck)
  }

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

// 5) Knop om mestplan te berekenen
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
  // … hier je eigen verwerking …
});
