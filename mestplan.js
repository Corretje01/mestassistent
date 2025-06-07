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
  if (!lock) {
    console.warn(`⚠️ Lock-element voor '${sliderId}' niet gevonden`);
    return false;
  }
  return lock.checked === true;
}

function formatSliderValue(value, unit, isFinancieel = false) {
  const formatted = value.toLocaleString('nl-NL', {
    minimumFractionDigits: isFinancieel ? 0 : 1,
    maximumFractionDigits: isFinancieel ? 0 : 1
  });

  if (isFinancieel || unit === 'eur') {
    return `€ ${formatted},-`;
  } else {
    return `${formatted} ${unit}`;
  }
}

const queryParams = getQueryParams();
const totaalA = queryParams['totaalA'] !== undefined ? Number(queryParams['totaalA']) : null;
const totaalB = queryParams['totaalB'] !== undefined ? Number(queryParams['totaalB']) : null;
const totaalC = queryParams['totaalC'] !== undefined ? Number(queryParams['totaalC']) : null;

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

function getNutriëntenWaarden({ inclusiefKunstmest = false } = {}) {
  return berekenTotaleNutriënten(inclusiefKunstmest);
}

function createStandaardSliders(totaalA, totaalB, totaalC) {
  const maxKalium = totaalB * 1.25;
  return [
    { id: 'stikstof',        label: 'Stikstof uit dierlijke mest',     max: totaalA,     unit: 'kg' },
    { id: 'fosfaat',         label: 'Fosfaat',                         max: totaalC,     unit: 'kg' },
    { id: 'kalium',          label: 'Kalium',                          max: maxKalium,   unit: 'kg' },
    { id: 'organisch',       label: 'Organische stof',                 max: 3000,        unit: 'kg' },
    { id: 'kunststikstof',   label: 'Stikstof uit kunstmest',          max: totaalB,     unit: 'kg' },
    { id: 'financieel',      label: 'Geschatte kosten',                max: 10000,       unit: 'eur' }
  ];
}

const standaardSliders = createStandaardSliders(totaalA, totaalB, totaalC);

standaardSliders.forEach(({id, label, max, unit}) => initSlider(id, label, max, unit));

function getLockedNutriëntenWaarden() {
  const waarden = {};
  ['stikstof', 'fosfaat', 'kalium', 'organisch'].forEach(nut => {
    const slider = document.getElementById(`slider-${nut}`);
    waarden[nut] = Number(slider?.value || 0);
  });
  return waarden;
}

function overschrijdtMaxToegestaneWaarden(nutriënten, nutriëntenInclKunstmest) {
  if (totaalA && nutriënten.stikstof > totaalA) {
    return 'stikstof uit dierlijke mest (totaalA overschreden)';
  }
  if (totaalC && nutriënten.fosfaat > totaalC) {
    return 'fosfaat (totaalC overschreden)';
  }
  if (totaalB && nutriëntenInclKunstmest.stikstof > totaalB) {
    return 'totale stikstof (totaalB overschreden)';
  }
  return null;
}

function berekenTotaleNutriënten(inclusiefKunstmest = false) {
  const totals = { stikstof: 0, fosfaat: 0, kalium: 0, organisch: 0 };
  for (const key in actieveMestData) {
    const mest = actieveMestData[key];
    totals.stikstof += mest.totaal?.N || 0;
    totals.fosfaat  += mest.totaal?.P || 0;
    totals.kalium   += mest.totaal?.K || 0;
    totals.organisch+= mest.totaal?.OS || 0;
  }

  if (inclusiefKunstmest) {
    const extraN = Number(document.getElementById('slider-kunststikstof')?.value || 0);
    totals.stikstof += extraN;
  }

  return totals;
}

function compenseerVergrendeldeNutriënten(changedKey) {
  const lockedNutriënten = ['stikstof', 'fosfaat', 'kalium', 'organisch']
    .filter(nut => isLocked(nut));

  if (lockedNutriënten.length === 0) return true;

  const mestKeys = Object.keys(actieveMestData);
  if (mestKeys.length < 2) {
    console.warn("⛔️ Compensatie niet mogelijk – slechts één mestsoort actief.");
    return false;
  }

  const oudeTon = actieveMestData[changedKey]?.ton || 0;
  const lockedWaarden = getLockedNutriëntenWaarden();

  const berekend = {
    zonder: getNutriëntenWaarden(),
    met: getNutriëntenWaarden({ inclusiefKunstmest: true })
  };

  const overschrijding = overschrijdtMaxToegestaneWaarden(berekend.zonder, berekend.met);
  
    if (overschrijding) {
      console.warn(`🚫 Overschrijding van ${overschrijding} – wijziging geweigerd.`);
      stelMesthoeveelheidIn(changedKey, oudeTon);

      // Shake-effect op de mestslider
      const slider = document.getElementById(`slider-${changedKey}`);
      if (slider) {
        slider.classList.add('shake');
        setTimeout(() => slider.classList.remove('shake'), 400);
      }

      return false;
    }
  return true;
}

function verdeelCompensatie(veroorzakerKey, deltaMap, mestKeys) {
  const compenseerbare = mestKeys.filter(k => k !== veroorzakerKey && !isLocked(k));
  if (compenseerbare.length === 0) return false;

  const correcties = {};
  for (const key of compenseerbare) correcties[key] = 0;

  for (const nut in deltaMap) {
    const totalPerTon = compenseerbare.reduce((sum, key) =>
      sum + (actieveMestData[key][`${nut[0].toUpperCase()}_kg_per_ton`] || 0), 0);
    if (totalPerTon === 0) return false;

    for (const key of compenseerbare) {
      const mest = actieveMestData[key];
      const val = mest[`${nut[0].toUpperCase()}_kg_per_ton`] || 0;
      const aandeel = val / totalPerTon;
      const correctie = -deltaMap[nut] * aandeel / (val || 1); // bescherm tegen 0
      correcties[key] += correctie;
    }
  }

  // Valideer alle correcties
  for (const key of compenseerbare) {
    const nieuwTon = actieveMestData[key].ton + correcties[key];
    if (nieuwTon < 0 || nieuwTon > 650) return false;
  }

  // Voer correcties uit
  for (const key of compenseerbare) {
    const mest = actieveMestData[key];
    const nieuwTon = mest.ton + correcties[key];
    stelMesthoeveelheidIn(key, nieuwTon);
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

  const totaalToegestaneN = totaalA;  // ✅ stikstof uit URL-query
  const remainingN = Math.max(0, totaalToegestaneN - totalN);

  const kunstmestSlider = document.getElementById('slider-kunststikstof');
  const kunstmestValue  = document.getElementById('value-kunststikstof');
  const kunstmestLock   = document.getElementById('lock-kunststikstof');

  if (kunstmestSlider && kunstmestValue && kunstmestLock && !kunstmestLock.checked) {
    const afgerond = Math.round(remainingN * 10) / 10;
    kunstmestSlider.value = afgerond;

    const formattedVal = formatSliderValue(afgerond, 'kg');
    const formattedMax = formatSliderValue(Number(kunstmestSlider.max), 'kg');
    kunstmestValue.textContent = `${formattedVal} / ${formattedMax}`;
  }

  const totalen = [
    { id: 'stikstof',   value: totalN },
    { id: 'fosfaat',    value: totalP },
    { id: 'kalium',     value: totalK },
    { id: 'organisch',  value: totalOS },
    { id: 'financieel', value: Object.values(actieveMestData).reduce((sum, m) => sum + (m?.totaal?.FIN || 0), 0) }
  ];

  totalen.forEach(({ id, value }) => {
    const sliderEl  = document.getElementById(`slider-${id}`);
    const valueElem = document.getElementById(`value-${id}`);
    const lockElem  = document.getElementById(`lock-${id}`);
    const unit = standaardSliders.find(s => s.id === id)?.unit || 'kg';

    if (sliderEl && valueElem) {
      if (!isLocked(id)) {
        const isFinancieel = id === 'financieel';
        const afgerond = isFinancieel
          ? Math.round(value)
          : Math.round(value * 10) / 10;

        sliderEl.value = afgerond;
        const formattedVal = formatSliderValue(afgerond, unit, isFinancieel);
        const formattedMax = formatSliderValue(Number(sliderEl.max), unit, isFinancieel);
        valueElem.textContent = `${formattedVal} / ${formattedMax}`;
      } else {
        console.log(`🔒 Nutriëntslider '${id}' is gelocked; update genegeerd.`);
        sliderEl.classList.add('shake');
        setTimeout(() => sliderEl.classList.remove('shake'), 300);
      }
    }
  });
}

function berekenMestWaardenPerTon(data, ton) {
  const transportkosten = 10;
  return {
    N: ton * data.N_kg_per_ton,
    P: ton * data.P_kg_per_ton,
    K: ton * data.K_kg_per_ton,
    OS: ton * (data.OS_percent / 100),
    DS: ton * (data.DS_percent / 100),
    BG: ton * data.biogaspotentieel_m3_per_ton,
    FIN: ton * (data.Inkoopprijs_per_ton + transportkosten)
  };
}

function stelMesthoeveelheidIn(key, nieuweTon) {
  if (!actieveMestData[key]) return;

  const data = actieveMestData[key];
  data.ton = nieuweTon;
  data.totaal = berekenMestWaardenPerTon(data, nieuweTon);

  const slider = document.getElementById(`slider-${key}`);
  const value  = document.getElementById(`value-${key}`);
  if (slider && value) {
    const afgerond = Math.round(ton * 10) / 10;
    slider.value = afgerond;
    value.textContent = `${afgerond} / ${slider.max} ton`;
  }
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
    const nieuweTon = Number(slider.value);
    const oudeTon = actieveMestData[key]?.ton || 0;

    if (actieveMestData[key]) {
      // Probeer ton toe te passen
      actieveMestData[key].ton = nieuweTon;
      const data = actieveMestData[key];
      data.totaal = berekenMestWaardenPerTon(data, nieuweTon);

      const geslaagd = compenseerVergrendeldeNutriënten(key);

      if (geslaagd === false) {
        console.warn(`❌ Compensatie mislukt – wijziging aan '${key}' wordt teruggedraaid.`);

        // Herstel vorige waarde
        slider.value = oudeTon;
        actieveMestData[key].ton = oudeTon;
        valueEl.textContent = `${formatSliderValue(oudeTon, 'ton')} / ${formatSliderValue(maxTon, 'ton')}`;

        // ✨ Shake-effect op de SLIDER zelf
        slider.classList.add('shake');
        setTimeout(() => slider.classList.remove('shake'), 500);

        return;
      }

      // Bij succes: werk UI bij
      valueEl.textContent = `${formatSliderValue(nieuweTon, 'ton')} / ${formatSliderValue(maxTon, 'ton')}`;
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
      <span class="value" id="value-${id}">0</span>
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

  const isFinancieel = id === 'financieel';

  slider.value = isFinancieel
    ? 0
    : Math.round(max * 5) / 10;  // default op halve max voor niet-financieel

  const formattedStart = formatSliderValue(Number(slider.value), unit, isFinancieel);
  const formattedMax   = formatSliderValue(Number(slider.max), unit, isFinancieel);
  valueEl.textContent = `${formattedStart} / ${formattedMax}`;

  slider.addEventListener('input', () => {
    const val = Number(slider.value);
    const formattedVal = formatSliderValue(val, unit, isFinancieel);
    const formattedMax = formatSliderValue(Number(slider.max), unit, isFinancieel);
    valueEl.textContent = `${formattedVal} / ${formattedMax}`;
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
