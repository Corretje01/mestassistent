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
    } else {
      removeDynamicSlider(key);
    }
  });
});

// 2) Init standaard sliders (ongewijzigd)
const standaardSliders = [
  { id: 'stikstof',  max: totaalA, unit: 'kg' },
  { id: 'fosfaat',   max: totaalC,  unit: 'kg' },
  { id: 'kalium',    max: 7500, unit: 'kg' },
  { id: 'organisch', max: 3000, unit: 'kg' }
  { id: 'kunststikstof', max: 1000,   unit: 'kg' }
];
standaardSliders.forEach(({id, max, unit}) => initSlider(id, max, unit));

// 3a) Functie om dynamische slider toe te voegen (verder ongewijzigd)
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

  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} / ${maxTon} ton`;
  });
  lockInput.addEventListener('change', () => {
    slider.disabled = lockInput.checked;
  });
}

// 3b) Functie om dynamische slider te verwijderen (ongewijzigd)
function removeDynamicSlider(key) {
  const group = document.getElementById(`group-${key}`);
  if (group) group.remove();
}

// 4) Helper voor init standaard sliders (ongewijzigd)
function initSlider(id, max, unit) {
  const slider  = document.getElementById(`slider-${id}`);
  const valueEl = document.getElementById(`value-${id}`);

  // Maximale waarde instellen
  slider.max = Math.round(max);

  // Startwaarde op 50% van max
  const startValue = Math.round(max / 2);
  slider.value = startValue;

  // UI aanpassen aan startwaarde
  valueEl.textContent = `${startValue} / ${Math.round(max)} ${unit}`;

  // Bij interactie: update de waarde
  slider.addEventListener('input', () => {
    const currentVal = Math.min(Number(slider.value), Math.round(max));
    valueEl.textContent = `${currentVal} / ${Math.round(max)} ${unit}`;
  });
}

// 5) Knop om mestplan te berekenen (ongewijzigd)
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

  resultaat.push({
    key:    'financieel',
    val:    Number(document.getElementById('slider-financieel').value),
    locked: document.getElementById('lock-financieel').checked
  });

  console.log('Plan-uitkomst:', resultaat);
  // … hier je eigen verwerking …
});
