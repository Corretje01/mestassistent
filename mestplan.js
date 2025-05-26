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
const actieveMestData = {};

// laad JSON met mestwaardes
fetch('/data/mestsoorten.json')
  .then(res => res.json())
  .then(json => {
    mestsoortenData = json;
    console.log('✅ mestsoorten.json geladen:', mestsoortenData);
  })
  .catch(err => console.error('❌ Kan mestsoorten.json niet laden:', err));

// 1) Mest-knoppen: toggle en dynamisch sliders toevoegen/verwijderen
document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');

    const type   = btn.dataset.type;               // drijfmest, vastemest of overig
    const animal = btn.textContent;                // bijv. "Koe"
    const key    = `${type}-${btn.dataset.animal}`;
    const label  = `${categoryMap[type]} ${animal}`; // bijv. "Drijfmest Koe"

    if (btn.classList.contains('active')) {
      addDynamicSlider(key, label);

      // mestwaardes koppelen
      if (mestsoortenData[type] && mestsoortenData[type][btn.dataset.animal]) {
        actieveMestData[key] = mestsoortenData[type][btn.dataset.animal];
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
  { id: 'stikstof', label: 'Stikstof (N) uit dierlijke mest',  max: totaalA, unit: 'kg' },
  { id: 'fosfaat', label: 'Fosfaat (P)',   max: totaalC,  unit: 'kg' },
  { id: 'kalium', label: 'Kalium (K)',    max: 7500, unit: 'kg' },
  { id: 'organisch', label: 'Organische stof', max: 3000, unit: 'kg' },
  { id: 'kunststikstof', label: 'Stikstof uit kunstmest', max: 5000, unit: 'kg' },
  { id: 'financieel', label: 'Geschatte opbrengsten', max: 10000, unit: 'eur' }
];
standaardSliders.forEach(({id, max, unit}) => initSlider(id, max, unit));

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
    valueEl.textContent = `${slider.value} / ${maxTon} ton`;
    // toekomstige stap: gebruik actieveMestData[key] voor berekening
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
  if (document.getElementById(`slider-${id}`)) {
    return; // slider bestaat al (veiligheidscheck)
  }

  const group = document.createElement('div');
  group.className = 'slider-group';
  group.id = `group-${id}`;
  group.innerHTML = `
    <div class="slider-header">
      <input type="checkbox" id="lock-${id}" />
      <label for="slider-${id}">${id.charAt(0).toUpperCase() + id.slice(1)}</label>
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
  // … hier je eigen verwerking …
});
