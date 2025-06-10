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
      updateStandardSliders();
    }
  });
});

function getNutriëntenWaarden({ inclusiefKunstmest = false } = {}) {
  return berekenTotaleNutriënten(inclusiefKunstmest);
}

function bepaalMaxStikstofDierlijk() {
  const geselecteerdeKunstmest = Number(document.getElementById('slider-kunststikstof')?.value || 0);
  return Math.min(totaalA, totaalB - geselecteerdeKunstmest);
}

function createStandaardSliders(totaalA, totaalB, totaalC) {
  const maxKalium = totaalB * 1.25;
  const maxStikstofDierlijk = bepaalMaxStikstofDierlijk();

  return [
    { id: 'stikstof',        label: 'Stikstof uit dierlijke mest',     max: maxStikstofDierlijk, unit: 'kg' },
    { id: 'fosfaat',         label: 'Fosfaat',                         max: totaalC,     unit: 'kg' },
    { id: 'kalium',          label: 'Kalium',                          max: maxKalium,   unit: 'kg' },
    { id: 'organisch',       label: 'Organische stof',                 max: 3000,        unit: 'kg' },
    { id: 'kunststikstof',   label: 'Stikstof uit kunstmest',          max: totaalB,     unit: 'kg' },
    { id: 'financieel',      label: 'Geschatte kosten',                max: 10000,       unit: 'eur' }
  ];
}

const standaardSliders = createStandaardSliders(totaalA, totaalB, totaalC);

standaardSliders.forEach(({id, label, max, unit}) => initSlider(id, label, max, unit));

const kunstmestSlider = document.getElementById('slider-kunststikstof');
if (kunstmestSlider) {
  kunstmestSlider.addEventListener('input', () => {
    updateMaxStikstofSlider();
  });
}

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

function compenseerVergrendeldeNutriënten(changedKey, oudeTonHandmatig) {
  const lockedNutriënten = ['stikstof', 'fosfaat', 'kalium', 'organisch']
    .filter(nut => isLocked(nut));
  if (lockedNutriënten.length === 0) return true;

  const mestKeys = Object.keys(actieveMestData);
  if (mestKeys.length < 2) {
    console.warn("⛔️ Compensatie niet mogelijk – slechts één mestsoort actief.");
    return false;
  }

  const oudeTon = (oudeTonHandmatig ?? actieveMestData[changedKey]?.ton) || 0;
  const nieuweTon = actieveMestData[changedKey]?.ton || oudeTon;
  const deltaTon = nieuweTon - oudeTon;

  if (Math.abs(deltaTon) < 0.0001) {
    return true; // geen werkelijke wijziging
  }

  const mest = actieveMestData[changedKey];
  const deltaMap = {};

  const nutriëntKeyMap = {
    stikstof:  'N_kg_per_ton',
    fosfaat:   'P_kg_per_ton',
    kalium:    'K_kg_per_ton',
    organisch: 'OS_percent' // als % → delen door 100
  };

  for (const nut of lockedNutriënten) {
    const keyInData = nutriëntKeyMap[nut];
    if (!keyInData) continue;

    let gehalte = mest[keyInData] || 0;
    if (nut === 'organisch') gehalte = gehalte / 100;

    const verschil = deltaTon * gehalte;
    if (Math.abs(verschil) > 0.01) {
      deltaMap[nut] = verschil;
      console.warn(`🔒 Vergrendeld nutriënt '${nut}' zou veranderen – verschil: ${verschil.toFixed(2)} → poging tot compensatie...`);
    }
  }

  if (Object.keys(deltaMap).length === 0) {
    return true; // geen gelockte waarden die veranderen
  }

  const gecompenseerd = verdeelCompensatie(changedKey, deltaMap, mestKeys);
  if (gecompenseerd) {
    console.log(`✅ Compensatie succesvol toegepast.`);
    return true;
  }

  // ❌ Compensatie mislukt – wijzig terugdraaien
console.warn(`❌ Compensatie niet mogelijk – wijziging wordt teruggedraaid.`);
stelMesthoeveelheidIn(changedKey, oudeTon);

// 🎯 Shake-effect op ALLE gelockte sliders (nutriënten én mest)
document.querySelectorAll('[id^="slider-"]').forEach(slider => {
  const id = slider.id.replace('slider-', '');
  const lock = document.getElementById(`lock-${id}`);
  if (lock?.checked) {
    slider.classList.add('shake');
    setTimeout(() => slider.classList.remove('shake'), 400);
  }
});

// 🎯 Shake-effect op de slider die je probeerde te wijzigen
const slider = document.getElementById(`slider-${changedKey}`);
if (slider) {
  slider.classList.add('shake');
  setTimeout(() => slider.classList.remove('shake'), 400);
}

return false;
}

function verdeelCompensatie(veroorzakerKey, deltaMap, mestKeys) {
  const nutriëntKeyMap = {
    stikstof:  'N_kg_per_ton',
    fosfaat:   'P_kg_per_ton',
    kalium:    'K_kg_per_ton',
    organisch: 'OS_percent' // moet gedeeld worden door 100
  };

  const compenseerbare = mestKeys.filter(k => k !== veroorzakerKey && !isLocked(k));
  if (compenseerbare.length === 0) return false;

  const correcties = {};
  for (const key of compenseerbare) correcties[key] = 0;

  // Bereken benodigde correctie per mestsoort
  for (const nut in deltaMap) {
    const keyInData = nutriëntKeyMap[nut];
    if (!keyInData) continue;

    const delta = deltaMap[nut]; // positief = te veel → moet omlaag
    let totaalBijdrage = 0;

    // Bereken totale bijdrage van compenseerbare mestsoorten
    for (const key of compenseerbare) {
      const waarde = actieveMestData[key]?.[keyInData] || 0;
      totaalBijdrage += (nut === 'organisch' ? waarde / 100 : waarde);
    }

    if (totaalBijdrage === 0) {
      console.warn(`⚠️ Geen nutriëntinhoud voor ${nut} in compenseerbare mest.`);
      return false;
    }

    // Bereken per mestsoort de tonnage-correctie
    for (const key of compenseerbare) {
      const mest = actieveMestData[key];
      let bijdrage = mest?.[keyInData] || 0;
      if (nut === 'organisch') bijdrage = bijdrage / 100;

      const aandeel = bijdrage / totaalBijdrage;
      const tonnageCorrectie = -delta * aandeel / (bijdrage || 1); // bescherm tegen 0
      correcties[key] += tonnageCorrectie;
    }
  }

  // Valideer correcties
  for (const key of compenseerbare) {
    const huidig = actieveMestData[key].ton;
    const nieuw = huidig + correcties[key];
    if (nieuw < 0 || nieuw > 650) {
      console.warn(`⛔️ Correctie voor '${key}' ongeldig (${nieuw.toFixed(1)} ton) – buiten grenzen.`);
      return false;
    }
  }

  // 🧪 Debug logs vóór toepassen
  console.log("🔁 DeltaMap:", deltaMap);
  console.log("🔄 Correcties per mestsoort:", correcties);

  // Pas correcties toe
  for (const key of compenseerbare) {
    const nieuwTon = actieveMestData[key].ton + correcties[key];
    stelMesthoeveelheidIn(key, nieuwTon);
  }

  return true;
}

function updateMaxStikstofSlider() {
  const stikstofSlider = document.getElementById('slider-stikstof');
  const stikstofValue  = document.getElementById('value-stikstof');
  const kunstSlider    = document.getElementById('slider-kunststikstof');
  const kunstValue     = document.getElementById('value-kunststikstof');

  if (!stikstofSlider || !stikstofValue || !kunstSlider || !kunstValue) return;

  const stikstofLocked = isLocked('stikstof');
  const huidigeStikstofWaarde = Number(stikstofSlider.value || 0);
  const berekendeMax = bepaalMaxStikstofDierlijk(); // totaalA, totaalB - kunstmest

  // 🧮 Veilig maximum bepalen
  const veiligeMax = stikstofLocked
    ? Math.max(huidigeStikstofWaarde, berekendeMax)
    : berekendeMax;

  stikstofSlider.max = veiligeMax;

  // 🚨 Conflictsituatie: kunstmest maakt stikstof-lock onhoudbaar
  if (stikstofLocked && berekendeMax < huidigeStikstofWaarde) {
    const maxKunstmest = Math.max(0, totaalB - huidigeStikstofWaarde);
    kunstSlider.value = maxKunstmest;

    // 🎯 Shake kunstmest
    kunstSlider.classList.add('shake');
    setTimeout(() => kunstSlider.classList.remove('shake'), 400);

    // 🎯 Shake alle gelockte sliders
    document.querySelectorAll('[id^="slider-"]').forEach(slider => {
      const id = slider.id.replace('slider-', '');
      const lock = document.getElementById(`lock-${id}`);
      if (lock?.checked) {
        slider.classList.add('shake');
        setTimeout(() => slider.classList.remove('shake'), 400);
      }
    });

    // Update UI van kunstmestslider
    const afgerond = Math.round(maxKunstmest * 10) / 10;
    const formattedVal = formatSliderValue(afgerond, 'kg');
    const formattedMax = formatSliderValue(Number(kunstSlider.max), 'kg');
    kunstValue.textContent = `${formattedVal} / ${formattedMax}`;
  }

  // 🧾 Altijd UI van stikstofslider bijwerken (maar geen value aanpassen bij lock)
  const afgerond = Math.round(huidigeStikstofWaarde * 10) / 10;
  const formattedVal = formatSliderValue(afgerond, 'kg');
  const formattedMax = formatSliderValue(veiligeMax, 'kg');
  stikstofValue.textContent = `${formattedVal} / ${formattedMax}`;
}

function updateStandardSliders() {
  let totalN = 0, totalP = 0, totalK = 0, totalOS = 0, totalFIN = 0;

  for (const mest of Object.values(actieveMestData)) {
    if (mest?.totaal) {
      totalN  += mest.totaal.N || 0;
      totalP  += mest.totaal.P || 0;
      totalK  += mest.totaal.K || 0;
      totalOS += mest.totaal.OS || 0;
      totalFIN += mest.totaal.FIN || 0;
    }
  }

  // 👇 Kunstmest automatisch bijstellen (indien niet gelocked)
  const kunstmestSlider = document.getElementById('slider-kunststikstof');
  const kunstmestValue  = document.getElementById('value-kunststikstof');
  const kunstmestLock   = document.getElementById('lock-kunststikstof');

  const geselecteerdeKunstmest = Number(kunstmestSlider?.value || 0);
  const totaalToegestaneN_dierlijk = Math.min(totaalA, totaalB - geselecteerdeKunstmest);
  const remainingN = Math.max(0, totaalToegestaneN_dierlijk - totalN);

  if (kunstmestSlider && kunstmestValue && kunstmestLock && !kunstmestLock.checked) {
    const huidigeWaarde = Number(kunstmestSlider.value);
    const nieuweWaarde  = Math.min(huidigeWaarde, remainingN);
    const afgerond      = Math.round(nieuweWaarde * 10) / 10;

    kunstmestSlider.value = afgerond;

    const formattedVal = formatSliderValue(afgerond, 'kg');
    const formattedMax = formatSliderValue(Number(kunstmestSlider.max), 'kg');
    kunstmestValue.textContent = `${formattedVal} / ${formattedMax}`;
  }

  // 👇 Update de nutriënten- en financieelsliders
  const totalen = [
    { id: 'stikstof',   value: totalN },
    { id: 'fosfaat',    value: totalP },
    { id: 'kalium',     value: totalK },
    { id: 'organisch',  value: totalOS },
    { id: 'financieel', value: totalFIN }
  ];

  for (const { id, value } of totalen) {
    const sliderEl  = document.getElementById(`slider-${id}`);
    const valueElem = document.getElementById(`value-${id}`);
    const unit      = standaardSliders.find(s => s.id === id)?.unit || 'kg';
    const isFin     = id === 'financieel';

    if (!sliderEl || !valueElem) continue;

    if (!isLocked(id)) {
      const afgerond = isFin ? Math.round(value) : Math.round(value * 10) / 10;
      sliderEl.value = afgerond;

      const formattedVal = formatSliderValue(afgerond, unit, isFin);
      const formattedMax = formatSliderValue(Number(sliderEl.max), unit, isFin);
      valueElem.textContent = `${formattedVal} / ${formattedMax}`;
    } else {
      // Alleen UI max bijwerken, waarde niet
      const huidigeWaarde = Number(sliderEl.value || 0);
      const formattedVal = formatSliderValue(huidigeWaarde, unit, isFin);
      const formattedMax = formatSliderValue(Number(sliderEl.max), unit, isFin);
      valueElem.textContent = `${formattedVal} / ${formattedMax}`;
    }
  }

  // ⛳ Max van stikstofslider bijwerken, waarde blijft ongemoeid
  updateMaxStikstofSlider();
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
    const afgerond = Math.round(nieuweTon * 10) / 10;
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

  // Bereken maxTon op basis van N en P restricties
  if (limiterMap[key]) {
    const [type, animal] = limiterMap[key];
    const data = mestsoortenData?.[type]?.[animal];
    if (data?.N_kg_per_ton && data?.P_kg_per_ton) {
      const maxN = totaalA / data.N_kg_per_ton;
      const maxP = totaalC / data.P_kg_per_ton;
      maxTon = Math.floor(Math.min(maxN, maxP));
    }
  }

  // Maak slidergroep HTML
  const group = document.createElement('div');
  group.className = 'slider-group';
  group.id = `group-${key}`;
  group.innerHTML = `
    <div class="slider-header">
      <input type="checkbox" id="lock-${key}" />
      <label for="slider-${key}">${label}</label>
      <span class="value" id="value-${key}">0 / ${maxTon} ton</span>
    </div>
    <input type="range" id="slider-${key}" min="0" max="${maxTon}" step="0.1" />
  `;
  slidersContainer.appendChild(group);

  const slider    = group.querySelector('input[type="range"]');
  const valueEl   = group.querySelector('.value');
  const lockInput = group.querySelector('input[type="checkbox"]');

  // Initialiseer slider op 0
  slider.value = 0;

  // 📦 Event: Bij verschuiven van de mestslider
  slider.addEventListener('input', () => {
    const nieuweTon = Number(slider.value);
    const oudeData = actieveMestData[key];
    const oudeTon = oudeData?.ton || 0;

    if (Math.abs(nieuweTon - oudeTon) < 0.0001) return; // geen werkelijke wijziging

    if (oudeData) {
      // Maak een tijdelijke kopie van de data
      const tijdelijk = { ...oudeData, ton: nieuweTon };
      tijdelijk.totaal = berekenMestWaardenPerTon(tijdelijk, nieuweTon);

      // Backup voor eventueel terugzetten
      const backup = actieveMestData[key];
      actieveMestData[key] = tijdelijk;

      const geslaagd = compenseerVergrendeldeNutriënten(key, oudeTon);
      actieveMestData[key] = geslaagd ? tijdelijk : backup;

      if (!geslaagd) {
        slider.value = oudeTon;
        valueEl.textContent = `${formatSliderValue(oudeTon, 'ton')} / ${formatSliderValue(maxTon, 'ton')}`;
        slider.classList.add('shake');
        setTimeout(() => slider.classList.remove('shake'), 500);
        return;
      }

      // Succes – werk UI bij
      valueEl.textContent = `${formatSliderValue(nieuweTon, 'ton')} / ${formatSliderValue(maxTon, 'ton')}`;
      updateStandardSliders();
    }
  });

  // 📦 Event: vergrendelen/unlocken van mestslider
  lockInput.addEventListener('change', () => {
    slider.disabled = lockInput.checked;
  });
}

function removeDynamicSlider(key) {
  const group = document.getElementById(`group-${key}`);
  if (group) group.remove();

  delete actieveMestData[key];
  updateStandardSliders(); // 💡 Totale nutriëntwaarden bijwerken
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
  slider.value = 0;

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
