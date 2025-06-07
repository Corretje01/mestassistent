// mestplan.js

function getQueryParams() {
  const params = {};
  window.location.search.substring(1).split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return params;
}

function isLocked(sliderId) {
  const lock = document.getElementById(`lock-${sliderId}`);
  return lock?.checked === true;
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
    { id: 'financieel',      label: 'Geschatte kosten', max: 10000,   unit: 'eur' }
  ];
}

const standaardSliders = createStandaardSliders(totaalA, totaalB, totaalC);

standaardSliders.forEach(({id, label, max, unit}) => initSlider(id, label, max, unit));

function compenseerVergrendeldNutrient(changedKey) {
  const lockedNutrient = 'stikstof';
  if (!isLocked(lockedNutrient)) return;

  const mestKeys = Object.keys(actieveMestData);
  if (mestKeys.length < 2) return;

  const [keyA, keyB] = mestKeys;
  const changedIsA = changedKey === keyA;
  const mestA = actieveMestData[changedIsA ? keyA : keyB];
  const mestB = actieveMestData[changedIsA ? keyB : keyA];
  const oudeTonA = mestA.ton;

  const nPerTonA = mestA.N_kg_per_ton;
  const nPerTonB = mestB.N_kg_per_ton;

  const slider = document.getElementById(`slider-${lockedNutrient}`);
  const lockedN = Number(slider?.value || 0);

  const huidigA = mestA.ton;
  const huidigB = mestB.ton;
  const totaalNuitA = huidigA * nPerTonA;
  const totaalNuitB = huidigB * nPerTonB;
  const huidigTotaalN = totaalNuitA + totaalNuitB;

  if (mestKeys.length === 2) {
    const deltaN = huidigTotaalN - lockedN;
    if (Math.abs(deltaN) < 0.1) return;

    const deltaB = -deltaN / nPerTonB;
    const nieuwB = huidigB + deltaB;

    if (nieuwB < 0 || nieuwB > 650) {
      console.warn("❌ Compensatie niet mogelijk, zou mesthoeveelheid negatief maken.");
      return;
    }

    const sliderB = document.getElementById(`slider-${changedIsA ? keyB : keyA}`);
    const valueB = document.getElementById(`value-${changedIsA ? keyB : keyA}`);
    if (sliderB && valueB) {
      sliderB.value = Math.round(nieuwB);
      valueB.textContent = `${Math.round(nieuwB)} / ${sliderB.max} ton`;
      sliderB.dispatchEvent(new Event('input'));
    }

    return;
  }

  // Nieuw: 3 of meer mestsoorten actief
  const deltaN = huidigTotaalN - lockedN;
  if (Math.abs(deltaN) < 0.1) return;

  const succes = verdeelCompensatieOverMestsoorten(
    lockedNutrient,
    changedKey,
    deltaN,
    mestKeys
  );

  if (!succes) {
    console.warn(`🔄 Wijziging aan '${changedKey}' is teruggedraaid vanwege onhaalbare compensatie.`);
    const slider = document.getElementById(`slider-${changedKey}`);
    const value = document.getElementById(`value-${changedKey}`);
    if (slider && value && oudeTonA !== undefined) {
      slider.value = Math.round(oudeTonA);
      value.textContent = `${Math.round(oudeTonA)} / ${slider.max} ton`;
      slider.dispatchEvent(new Event('input'));
    }
  }
}

function verdeelCompensatieOverMestsoorten(vergrendeldeNutrient, veroorzakerKey, deltaKg, actieveKeys) {
  const compenseerders = actieveKeys.filter(key => key !== veroorzakerKey);
  const kgPerMestsoort = deltaKg / compenseerders.length;

  const nieuweTonwaarden = {};
  let wijzigingMogelijk = true;

  for (const key of compenseerders) {
    const mest = actieveMestData[key];
    const nutrientPerTon = mest[`${vergrendeldeNutrient}_kg_per_ton`];

    if (!nutrientPerTon || nutrientPerTon === 0) {
      console.warn(`⚠️ Mestsoort '${key}' heeft geen waarde voor ${vergrendeldeNutrient}; compensatie niet mogelijk.`);
      wijzigingMogelijk = false;
      break;
    }

    const deltaTon = -kgPerMestsoort / nutrientPerTon;
    const nieuweTon = mest.ton + deltaTon;

    if (nieuweTon < 0 || nieuweTon > 650) {
      console.warn(`🚫 Compensatie voor '${key}' ongeldig: ${nieuweTon.toFixed(1)} ton`);
      wijzigingMogelijk = false;
      break;
    }

    nieuweTonwaarden[key] = nieuweTon;
    console.log(`✅ Compensatie voor '${key}': ${mest.ton.toFixed(1)} → ${nieuweTon.toFixed(1)} ton`);
  }

  if (!wijzigingMogelijk) {
    console.warn("❌ Proportionele compensatie niet mogelijk – wijziging geannuleerd.");
    return false;
  }

  for (const [key, nieuweTon] of Object.entries(nieuweTonwaarden)) {
    const slider = document.getElementById(`slider-${key}`);
    const value = document.getElementById(`value-${key}`);
    if (slider && value) {
      const afgerond = Math.round(nieuweTon * 10) / 10;  // afronding op 1 decimaal
      slider.value = afgerond;
      value.textContent = `${afgerond} / ${slider.max} ton`;
      slider.dispatchEvent(new Event('input'));
    }
  }

  return true;
}

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
    const afgerond = Math.round(remainingN * 10) / 10;
    kunstmestSlider.value = afgerond;
    kunstmestValue.textContent = `${afgerond} / ${kunstmestSlider.max} kg`;
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

    if (sliderEl && valueElem) {
      if (!isLocked(id)) {
        const isFinancieel = id === 'financieel';
        const afgerond = isFinancieel
          ? Math.round(value)  // hele euro’s
          : Math.round(value * 10) / 10;  // 1 decimaal

        sliderEl.value = afgerond;
        valueElem.textContent = `${afgerond} / ${sliderEl.max} ${unit}`;
      } else {
        // Visueel slotje is al aanwezig — geen update toepassen
        console.log(`🔒 Nutriëntslider '${id}' is gelocked; update genegeerd.`);

        // ⏬ VISUELE FEEDBACK TOEVOEGEN
        sliderEl.classList.add('shake');
        setTimeout(() => sliderEl.classList.remove('shake'), 300);
      }
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
      step="0.1"
    />
  `;
  slidersContainer.appendChild(group);

  const slider    = group.querySelector('input[type="range"]');
  const valueEl   = group.querySelector('.value');
  const lockInput = group.querySelector('input[type="checkbox"]');

  slider.value = 0;
  slider.addEventListener('input', () => {
    const ton = Number(slider.value);
    valueEl.textContent = `${ton.toFixed(1)} / ${maxTon} ton`;

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
        FIN: ton * (data.Inkoopprijs_per_ton + 10) // inkoopprijs plus €10 transportkosten per ton
      };

      compenseerVergrendeldNutrient(key);
  
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
      step="0.1"
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
