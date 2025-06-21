// mestplan.js

const DEBUG_MODE = true;

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

if (DEBUG_MODE) console.log("TotaalA (N dierlijk):", totaalA);
if (DEBUG_MODE) console.log("TotaalB (N grondgebonden):", totaalB);
if (DEBUG_MODE) console.log("TotaalC (P totaal):", totaalC);

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

let lastUpdateSource = null;
let suppressAutoUpdate = false;
let mestsoortenData = {};
const actieveMestData = {};
let userModifiedKunstmest = false;
const activeUserChangeSet = new Set();

fetch('/data/mestsoorten.json')
  .then(res => res.json())
  .then(json => {
    mestsoortenData = json;
    if (DEBUG_MODE) console.log('✅ mestsoorten.json geladen:', mestsoortenData);
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
        if (DEBUG_MODE) console.log(`📦 Geselecteerd: ${key}`, actieveMestData[key]);
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

standaardSliders.forEach(({id, label, max, unit}) => {
  initSlider(id, label, max, unit);

  const slider = document.getElementById(`slider-${id}`);
  if (!slider) return;

  // 👇 Alleen sliders met effect op berekening
  if (['stikstof', 'fosfaat', 'kalium', 'organisch', 'kunststikstof'].includes(id)) {
    let startWaarde = Number(slider.value);
    let vorigeWaarde = startWaarde;
    let heeftBeweegd = false;
    
    slider.addEventListener('mousedown', () => {
      startWaarde = Number(slider.value);
      vorigeWaarde = startWaarde;
      heeftBeweegd = false;
    });
    
    slider.addEventListener('input', () => {
      requestAnimationFrame(() => {
        const huidigeWaarde = Number(slider.value);
    
        const verschilVanafStart = Math.abs(huidigeWaarde - startWaarde);
        if (verschilVanafStart < 0.1 && !heeftBeweegd) return;
    
        if (!heeftBeweegd) heeftBeweegd = true;
    
        if (Math.abs(huidigeWaarde - vorigeWaarde) >= 0.1) {
          vorigeWaarde = huidigeWaarde;
    
          onSliderChange(id, huidigeWaarde, 'user');
        }
      });
    });
  }
});

  const kunstmestSlider = document.getElementById('slider-kunststikstof');
  if (kunstmestSlider) {
    kunstmestSlider.addEventListener('input', () => {
      userModifiedKunstmest = true;
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
  
  if (DEBUG_MODE) {
    console.log("🧩 Beschikbare mestsoorten voor compensatie:", mestKeys.filter(id => {
      return !isLocked(id) && id !== changedKey && !activeUserChangeSet.has(id);
    }));
  }

  const gecompenseerd = verdeelCompensatie(changedKey, deltaMap, mestKeys.filter(id => {
    return !isLocked(id) && id !== changedKey && !activeUserChangeSet.has(id);
  }));

  if (gecompenseerd) {
    if (DEBUG_MODE) console.log(`✅ Compensatie succesvol toegepast.`);
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
  
  const compenseerbare = mestKeys.filter(k => 
      k !== veroorzakerKey && 
      !isLocked(k) && 
      !activeUserChangeSet.has(k)
    );
  
  if (DEBUG_MODE) {
    console.log("🧩 Beschikbare mestsoorten voor compensatie:", compenseerbare);
  }

  if (compenseerbare.length === 0) return false;

  const correcties = {};
  for (const key of compenseerbare) correcties[key] = 0;

  // Bereken benodigde correctie per mestsoort
  for (const nut in deltaMap) {
    const keyInData = nutriëntKeyMap[nut];
    if (!keyInData) continue;
  
    const delta = deltaMap[nut]; // totale gewenste correctie (positief = teveel)
  
    const beschikbareMest = compenseerbare.map(key => {
      const mest = actieveMestData[key];
      let gehalte = mest?.[keyInData] || 0;
      if (nut === 'organisch') gehalte = gehalte / 100;
      return { key, gehalte };
    }).filter(m => m.gehalte > 0);
  
    if (beschikbareMest.length === 0) {
      console.warn(`⚠️ Geen compenseerbare mestsoorten met bijdrage aan ${nut}.`);
      return false;
    }
  
    // Bepaal maximale capaciteit per mestsoort
    const capaciteitPerMest = beschikbareMest.map(({ key, gehalte }) => {
      const huidig = actieveMestData[key].ton;
      const min = 0;
      const max = 650;
      const corrTotMin = (min - huidig) * gehalte;
      const corrTotMax = (max - huidig) * gehalte;
  
      const maxCorrectieNut = delta > 0 ? Math.min(0, corrTotMin) : Math.max(0, corrTotMax);
      return { key, gehalte, maxNutriëntCorrectie: Math.abs(maxCorrectieNut) };
    });
  
    const totaalMaxCorr = capaciteitPerMest.reduce((sum, m) => sum + m.maxNutriëntCorrectie, 0);
  
    if (totaalMaxCorr + 0.00001 < Math.abs(delta)) {
      console.warn(`⚠️ Onvoldoende capaciteit om ${nut} volledig te compenseren.`);
      return false;
    }
  
    // Nu daadwerkelijk verdelen
    for (const mest of capaciteitPerMest) {
      if (mest.maxNutriëntCorrectie === 0) continue;
  
      const aandeel = mest.maxNutriëntCorrectie / totaalMaxCorr;
      const toegewezenNut = delta * aandeel;
      const tonCorrectie = -toegewezenNut / mest.gehalte;
  
      correcties[mest.key] = (correcties[mest.key] || 0) + tonCorrectie;
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
  if (DEBUG_MODE) console.log("🔁 DeltaMap:", deltaMap);
  if (DEBUG_MODE) console.log("🔄 Correcties per mestsoort:", correcties);

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
      totalN  += mest.totaal.N  || 0;
      totalP  += mest.totaal.P  || 0;
      totalK  += mest.totaal.K  || 0;
      totalOS += mest.totaal.OS || 0;
      totalFIN += mest.totaal.FIN || 0;
    }
  }

  const kunstmestSlider = document.getElementById('slider-kunststikstof');
  const kunstmestValue  = document.getElementById('value-kunststikstof');
  const kunstmestLock   = document.getElementById('lock-kunststikstof');

  const huidigeWaarde = Number(kunstmestSlider?.value || 0);
  const maxKunstmest = Math.max(0, totaalB - totalN);

  if (kunstmestSlider && kunstmestValue && kunstmestLock && !kunstmestLock.checked) {
    const stikstofGelocked = isLocked('stikstof');
    const stikstofSlider = document.getElementById('slider-stikstof');
    const currentStikstofWaarde = Number(stikstofSlider?.value || 0);
    const maxKunstmestVoorStikstofLock = Math.max(0, totaalB - currentStikstofWaarde);

    if (stikstofGelocked && huidigeWaarde > maxKunstmestVoorStikstofLock) {
      const afgerond = Math.round(maxKunstmestVoorStikstofLock * 10) / 10;
      kunstmestSlider.value = afgerond;

      const formattedVal = formatSliderValue(afgerond, 'kg');
      const formattedMax = formatSliderValue(Number(kunstmestSlider.max), 'kg');
      kunstmestValue.textContent = `${formattedVal} / ${formattedMax}`;

      kunstmestSlider.classList.add('shake');
      setTimeout(() => kunstmestSlider.classList.remove('shake'), 400);
      userModifiedKunstmest = false;

    } else if (!userModifiedKunstmest && huidigeWaarde > maxKunstmest) {
      const afgerond = Math.round(maxKunstmest * 10) / 10;
      kunstmestSlider.value = afgerond;

      const formattedVal = formatSliderValue(afgerond, 'kg');
      const formattedMax = formatSliderValue(Number(kunstmestSlider.max), 'kg');
      kunstmestValue.textContent = `${formattedVal} / ${formattedMax}`;
    } else {
      const afgerond = Math.round(huidigeWaarde * 10) / 10;
      const formattedVal = formatSliderValue(afgerond, 'kg');
      const formattedMax = formatSliderValue(Number(kunstmestSlider.max), 'kg');
      kunstmestValue.textContent = `${formattedVal} / ${formattedMax}`;
    }
  }

  // 👇 Update standaard sliders
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

    const huidigeWaarde = Number(sliderEl.value || 0);
    const afgerond = isFin ? Math.round(value) : Math.round(value * 10) / 10;
    
    if (!isLocked(id) && !activeUserChangeSet.has(id)) {
      sliderEl.value = afgerond;
    } else {
      if (DEBUG_MODE) {
        console.log(`🔒 ${id} is gelockt of actief gewijzigd → waarde blijft op ${huidigeWaarde}`);
      }
    }
    
    const formattedVal = formatSliderValue(sliderEl.value, unit, isFin);
    const formattedMax = formatSliderValue(Number(sliderEl.max), unit, isFin);
    valueElem.textContent = `${formattedVal} / ${formattedMax}`;
  }

  updateMaxStikstofSlider();
  userModifiedKunstmest = false;
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

function stelMesthoeveelheidIn(key, nieuweTon, source = 'auto') {
  if (!actieveMestData[key]) return;
  if (isLocked(key) && source !== 'auto') return;

  const data = actieveMestData[key];
  data.ton = nieuweTon;
  data.totaal = berekenMestWaardenPerTon(data, nieuweTon);

  const slider = document.getElementById(`slider-${key}`);
  const value  = document.getElementById(`value-${key}`);
  if (slider && value) {
    const afgerond = Math.round(nieuweTon * 10) / 10;
    const huidigeWaarde = parseFloat(slider.value);

    slider.value = afgerond;
    slider.setAttribute('value', afgerond); // nodig voor visuele sync
    value.textContent = `${afgerond} / ${slider.max} ton`;

    if (source === 'auto' && Math.abs(huidigeWaarde - afgerond) > 0.01) {
      activeUserChangeSet.add(key);
      onSliderChange(key, afgerond, 'auto');
    }
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
    const data = mestsoortenData?.[type]?.[animal];
    if (data?.N_kg_per_ton && data?.P_kg_per_ton) {
      const maxN = totaalA / data.N_kg_per_ton;
      const maxP = totaalC / data.P_kg_per_ton;
      maxTon = Math.floor(Math.min(maxN, maxP));
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
    <input type="range" id="slider-${key}" min="0" max="${maxTon}" step="0.1" />
  `;
  slidersContainer.appendChild(group);

  const slider    = group.querySelector('input[type="range"]');
  const valueEl   = group.querySelector('.value');
  const lockInput = group.querySelector('input[type="checkbox"]');

  slider.value = 0;

slider.addEventListener('input', () => {
  const nieuweTon = Number(slider.value);
  onSliderChange(key, nieuweTon, 'user');
});

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

  if (DEBUG_MODE) console.log('Plan-uitkomst:', resultaat);
  if (DEBUG_MODE) console.log('Totaal actieve mestdata:', actieveMestData);
});

// --- [ BIDIRECTIONELE SYNC: Nutriënt ➜ Mesthoeveelheden ] ---

// 🔧 Bereken totale nutriënten, maar sla gelockte mestsoorten over
function berekenTotaleNutriëntenZonderLocked() {
  const totaal = {
    stikstof: 0,
    fosfaat: 0,
    kalium: 0,
    organisch: 0,
    financieel: 0
  };

  for (const [id, mest] of Object.entries(actieveMestData)) {
    if (isLocked(id)) continue;

    totaal.stikstof   += mest.totaal.N   || 0;
    totaal.fosfaat    += mest.totaal.P   || 0;
    totaal.kalium     += mest.totaal.K   || 0;
    totaal.organisch  += mest.totaal.OS  || 0;
    totaal.financieel += mest.totaal.FIN || 0;
  }

  return totaal;
}

function updateFromNutrients(changedId, newValue) {
  activeUserChangeSet.add(changedId); // voorkom indirecte triggers op deze slider

  const currentNutriënten = berekenTotaleNutriënten();
  const huidigNut = currentNutriënten[changedId];
  const delta = newValue - huidigNut;

  if (DEBUG_MODE) {
    console.log(`🔧 [updateFromNutrients] START → ${changedId}`);
    console.log(`📐 Gewenste wijziging: ${huidigNut.toFixed(2)} → ${newValue.toFixed(2)} (delta: ${delta.toFixed(2)})`);
  }

  const nutriëntKeyMap = {
    stikstof: 'N_kg_per_ton',
    fosfaat: 'P_kg_per_ton',
    kalium: 'K_kg_per_ton',
    organisch: 'OS_percent',
    financieel: 'FIN_per_ton'
  };

  if (!nutriëntKeyMap[changedId]) {
    console.warn(`⚠️ Nutriënt '${changedId}' wordt niet ondersteund.`);
    return;
  }

  const huidigeMestverdeling = Object.entries(actieveMestData).map(([id, data]) => ({
    id,
    ton: data.ton,
    locked: isLocked(id)
  }));

  let beschikbareMest = [];

  for (const m of huidigeMestverdeling) {
    if (m.locked) continue;

    const mest = actieveMestData[m.id];
    let gehalte = 0;

    if (changedId === 'financieel') {
      gehalte = (mest.Inkoopprijs_per_ton || 0) + 10;
    } else if (changedId === 'organisch') {
      gehalte = (mest[nutriëntKeyMap[changedId]] || 0) / 100;
    } else {
      gehalte = mest[nutriëntKeyMap[changedId]] || 0;
    }

    if (delta > 0 && gehalte > 0) {
      beschikbareMest.push(m.id);
    }

    if (delta < 0 && gehalte > 0 && mest.ton > 0) {
      beschikbareMest.push(m.id);
    }
  }

  if (beschikbareMest.length === 0) {
    console.warn(`❌ Geen mestsoorten beschikbaar voor aanpassing (richting: ${delta > 0 ? 'omhoog' : 'omlaag'})`);
    triggerShakeEffect(changedId);
    revertSliderToPreviousValue(changedId);
    return;
  }

  let totaalBasis = 0;
  const bijdragePerMest = {};

  for (const id of beschikbareMest) {
    const mest = actieveMestData[id];
    let gehalte = 0;

    if (changedId === 'financieel') {
      gehalte = (mest.Inkoopprijs_per_ton || 0) + 10;
    } else if (changedId === 'organisch') {
      gehalte = (mest[nutriëntKeyMap[changedId]] || 0) / 100;
    } else {
      gehalte = mest[nutriëntKeyMap[changedId]] || 0;
    }

    let basis = 0;

    if (delta > 0) {
      basis = gehalte;
    } else {
      basis = mest.ton * gehalte;
    }

    bijdragePerMest[id] = { gehalte, basis };
    totaalBasis += basis;
  }

  if (totaalBasis === 0) {
    console.warn(`⚠️ Geen bijdragebasis beschikbaar, aanpassing niet mogelijk.`);
    triggerShakeEffect(changedId);
    revertSliderToPreviousValue(changedId);
    return;
  }

  const nieuweVerdeling = {};

  for (const id of beschikbareMest) {
    const mest = actieveMestData[id];
    const { gehalte, basis } = bijdragePerMest[id];
    const aandeel = basis / totaalBasis;
    const corrigeerNut = delta * aandeel;
    const corrigeerTon = gehalte > 0 ? corrigeerNut / gehalte : 0;

    const huidigeTon = mest.ton;
    const inBeweging = activeUserChangeSet.has(id);
    const nieuweTon = inBeweging ? huidigeTon : Math.max(0, huidigeTon + corrigeerTon);
    nieuweVerdeling[id] = nieuweTon;
  }

  if (DEBUG_MODE) {
    console.log('📊 Nieuwe tonnages voorgesteld:');
    console.table(nieuweVerdeling);
  }

  let wijzigToegestaan = true;
  Object.entries(nieuweVerdeling).forEach(([id, ton]) => {
    const sliderEl = document.getElementById(`slider-${id}`);
    if (!sliderEl) return;

    const min = Number(sliderEl.min || 0);
    const max = Number(sliderEl.max || 650);
    if (ton < min - 0.01 || ton > max + 0.01) {
      console.warn(`⛔️ Correctie buiten grens bij ${id}: ${ton.toFixed(2)} ton (limiet: ${min}-${max})`);
      triggerShakeEffect(id);
      wijzigToegestaan = false;
    }
  });

  if (!wijzigToegestaan) {
    triggerShakeEffect(changedId);
    revertSliderToPreviousValue(changedId);
    return;
  }

  Object.entries(nieuweVerdeling).forEach(([id, ton]) => {
    if (!activeUserChangeSet.has(id)) {
      if (DEBUG_MODE) console.log(`✅ toepassen: ${id} → ${ton.toFixed(2)} ton`);
      activeUserChangeSet.add(id);
      stelMesthoeveelheidIn(id, ton, 'auto');
    }
  });

  const locked = ['stikstof', 'fosfaat', 'kalium', 'organisch'].filter(nut => isLocked(nut));
  const na = berekenTotaleNutriënten();

  for (const nut of locked) {
    const slider = document.getElementById(`slider-${nut}`);
    const lockedValue = Number(slider?.value || 0);
    const actueleWaarde = na[nut];

    if (Math.abs(actueleWaarde - lockedValue) > 0.01) {
      if (DEBUG_MODE) console.warn(`⛔️ Nutriënt '${nut}' is gelockt maar zou veranderen: ${lockedValue} → ${actueleWaarde}`);
      triggerShakeEffect(changedId);
      revertSliderToPreviousValue(changedId);
      return;
    }
  }

  updateStandardSliders();
}

function berekenOptimaleMestverdeling(
  doelwaarden,
  beschikbareMest,
  lockedNutriënten = [],
  huidigeTonnage = {},
  changedNutriënt = null
) {
  if (DEBUG_MODE) {
    console.log('📐 [berekenOptimaleMestverdeling] Gestart');
    console.log('🎯 Doelwaarden:', doelwaarden);
    console.log('🔒 Soft-locked nutriënten:', lockedNutriënten);
    console.log('📦 Beschikbare mest:', beschikbareMest);
  }

  const nutrienten = ['stikstof', 'fosfaat', 'kalium', 'organisch', 'kunststikstof', 'kosten'];
  const relevanteNutriënten = nutrienten.filter(n => doelwaarden[n] != null);

  const A = [];
  const b = [];

  for (let nut of relevanteNutriënten) {
    const rij = [];
    for (let mest of beschikbareMest) {
      const eenheid = actieveMestData[mest];
      rij.push(eenheid?.[nut] || 0);
    }
    A.push(rij);
    b.push(doelwaarden[nut]);
  }

  if (A.length === 0 || A[0].length === 0) {
    if (DEBUG_MODE) console.warn('⚠️ Matrix A of b is leeg – geen oplossing mogelijk');
    return null;
  }

  // Gewichten
  const gewichten = relevanteNutriënten.map(n =>
    lockedNutriënten.includes(n) ? 100 : (changedNutriënt && n === changedNutriënt ? 1 : 0.1)
  );

  const gewogenA = A.map((row, i) => row.map(val => val * gewichten[i]));
  const gewogenB = b.map((val, i) => val * gewichten[i]);

  const matrixA = math.matrix(gewogenA);
  const vectorB = math.matrix(gewogenB);

  let vectorX;
  try {
    vectorX = math.multiply(math.pinv(matrixA), vectorB);
  } catch (e) {
    if (DEBUG_MODE) console.warn('❌ Matrix-oplossing gefaald:', e);
    return null;
  }

  const resultaat = {};
  let geldigeOplossing = true;

  vectorX.toArray().forEach((ton, i) => {
    const mestId = beschikbareMest[i];
    const tonnage = Math.max(0, Math.round(ton * 10) / 10);
    const max = bepaalMaxToelaatbareTon(mestId);

    if (tonnage > max) {
      if (DEBUG_MODE)
        console.warn(`⛔️ Correctie voor '${mestId}' ongeldig (${tonnage} ton) – buiten grenzen.`);
      geldigeOplossing = false;
    } else {
      resultaat[mestId] = tonnage;
      if (DEBUG_MODE)
        console.log(`💧 ${mestId}: berekend ${ton.toFixed(3)} → toegepast ${tonnage}`);
    }
  });

  return geldigeOplossing ? resultaat : null;
}

// --- [ STAP 3: Volledige eerste versie van onSliderChange() ] ---

let pendingUserSliderUpdate = null;
/**
 * Centrale router voor sliders. Wordt aangesproken bij elke gebruikersactie.
 * @param {string} sliderId - bv. 'stikstof', 'drijfmest-koe'
 * @param {number} newValue - nieuwe waarde van de slider
 * @param {'user'|'auto'} source - bron van de wijziging
 */
function onSliderChange(sliderId, newValue, source = 'user') {
  if (DEBUG_MODE) {
    console.log(`🟠 [DEBUG] onSliderChange START → ${sliderId} = ${newValue} (via ${source})`);
    console.log('👉 actuele slider DOM waarde:', document.getElementById(`slider-${sliderId}`)?.value);
    console.log('📦 volledige mestdata vooraf:', JSON.stringify(actieveMestData));
  }

  if (typeof suppressAutoUpdate === 'undefined') suppressAutoUpdate = false;
  if (suppressAutoUpdate) return;
  suppressAutoUpdate = true;

  activeUserChangeSet.add(sliderId);
  lastUpdateSource = source;

  const isNutriënt = ['stikstof', 'fosfaat', 'kalium', 'organisch', 'kunststikstof'].includes(sliderId);
  const isMestsoort = actieveMestData[sliderId] !== undefined;

  if (!enforceLocks(sliderId, newValue)) {
    suppressAutoUpdate = false;
    return;
  }

  if (!enforceBoundaries(sliderId, newValue)) {
    suppressAutoUpdate = false;
    return;
  }

  if (isNutriënt) {
    if (sliderId === 'kunststikstof') {
      const toegestaan = verwerkKunstmestStikstof(newValue);
      if (!toegestaan) {
        suppressAutoUpdate = false;
        return;
      }
    }
    
    if (['stikstof', 'fosfaat', 'kalium', 'organisch'].includes(sliderId) && Object.keys(actieveMestData).length === 0) {
      console.warn(`⛔️ Nutriënt wijziging geblokkeerd: geen mest actief.`);
      triggerShakeEffect(sliderId);

      const sliderEl = document.getElementById(`slider-${sliderId}`);
      const vorigeWaarde = berekenTotaleNutriënten()[sliderId];
      sliderEl.value = vorigeWaarde.toFixed(2);
      
      updateStandardSliders();
      
      suppressAutoUpdate = false;
      return;
    }
      
    const slider = document.getElementById(`slider-${sliderId}`);
    if (slider && !isLocked(sliderId)) {
      slider.value = newValue;
    }

    updateFromNutrients(sliderId, newValue);
  }

  if (isMestsoort) {
    const maxToelaatbaar = bepaalMaxToelaatbareTon(sliderId);
    const sliderEl = document.getElementById(`slider-${sliderId}`);
    if (sliderEl) sliderEl.max = maxToelaatbaar;

    const oudeTon = actieveMestData[sliderId]?.ton || 0;
    const tijdelijk = { ...actieveMestData[sliderId], ton: newValue };
    tijdelijk.totaal = berekenMestWaardenPerTon(tijdelijk, newValue);
    const backup = actieveMestData[sliderId];
    actieveMestData[sliderId] = tijdelijk;

    const nutNa = berekenTotaleNutriënten(false);
    const nutInclKunstmest = berekenTotaleNutriënten(true);
    const overschrijding = overschrijdtMaxToegestaneWaarden(nutNa, nutInclKunstmest);

    if (overschrijding) {
      actieveMestData[sliderId] = backup;
      stelMesthoeveelheidIn(sliderId, oudeTon);
      triggerShakeEffect(sliderId);
      suppressAutoUpdate = false;
      return;
    }

    const succes = compenseerVergrendeldeNutriënten(sliderId, oudeTon);
    actieveMestData[sliderId] = succes ? tijdelijk : backup;

    if (!succes) {
      stelMesthoeveelheidIn(sliderId, oudeTon);
      triggerShakeEffect(sliderId);
      revertSliderToPreviousValue(sliderId);
      suppressAutoUpdate = false;
      return;
    }

    stelMesthoeveelheidIn(sliderId, newValue);
    updateStandardSliders();
  }

  updateDebugOverlay();
  suppressAutoUpdate = false;

  // ⬇️ Wacht met leegmaken om race-conditions te voorkomen
  setTimeout(() => activeUserChangeSet.clear(), 0);
}

function triggerShakeEffect(sliderId) {
  const el = document.getElementById(`slider-${sliderId}`);
  if (el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  }
}

/**
 * Controleert of een slider vergrendeld is en blokkeert de wijziging indien nodig.
 * @param {string} id - slider-id zoals 'stikstof' of 'drijfmest-koe'
 * @param {number} nieuweWaarde - de voorgestelde nieuwe waarde
 * @returns {boolean} true als wijziging toegestaan is, false als geblokkeerd
 */
function enforceLocks(id, nieuweWaarde) {
  if (!isLocked(id)) return true;

  const huidige = document.getElementById(`slider-${id}`)?.value;
  const verschil = Math.abs(nieuweWaarde - Number(huidige || 0));

  if (verschil > 0.0001) {
    if (DEBUG_MODE) {
      console.warn(`⛔️ Wijziging geblokkeerd: '${id}' is vergrendeld (huidig: ${huidige}, voorstel: ${nieuweWaarde})`);
    }
    triggerShakeEffect(id);
    revertSliderToPreviousValue(id);
    return false;
  }

  return true;
}

/**
 * Zet slider visueel terug naar huidige DOM-waarde (bij vergrendeling)
 * @param {string} id - slider-id
 */
function revertSliderToPreviousValue(id) {
  const slider = document.getElementById(`slider-${id}`);
  if (!slider) return;

  const huidigeWaarde = Number(slider.value || 0);
  slider.value = huidigeWaarde;

  const valueSpan = document.getElementById(`value-${id}`);
  const unit = standaardSliders.find(s => s.id === id)?.unit || 'kg';
  const isFin = id === 'financieel';

  const formattedVal = formatSliderValue(huidigeWaarde, unit, isFin);
  const formattedMax = formatSliderValue(Number(slider.max), unit, isFin);
  valueSpan.textContent = `${formattedVal} / ${formattedMax}`;
}

/**
 * Controleert of een waarde binnen geldige grenzen valt.
 * Bij overschrijding: shake, rollback, logging.
 * @param {string} id - slider-id (bijv. 'stikstof', 'drijfmest-koe')
 * @param {number} waarde - voorgestelde nieuwe waarde
 * @returns {boolean} true als toegestaan, false bij overschrijding
 */
function enforceBoundaries(id, waarde) {
  const slider = document.getElementById(`slider-${id}`);
  if (!slider) return true; // geen element = geen grenscheck

  const min = Number(slider.min ?? 0);
  const max = Number(slider.max ?? 650); // default max voor mest

  const ondergrens = waarde < min - 0.001;
  const bovengrens = waarde > max + 0.001;

  if (!ondergrens && !bovengrens) return true;

  if (DEBUG_MODE) {
    const grensType = ondergrens ? 'ondergrens' : 'bovengrens';
    console.warn(`⛔️ ${id}: ${grensType} overschreden (${waarde} buiten ${min}–${max})`);
  }

  triggerShakeEffect(id);
  revertSliderToPreviousValue(id);
  return false;
}

/**
 * Berekent de maximale toegestane tonnage voor een mestsoort o.b.v. huidige gebruiksruimte.
 * @param {string} key - bijv. 'drijfmest-koe'
 * @returns {number} maximale toegestane tonnage, default 650
 */
function bepaalMaxToelaatbareTon(key) {
  const mest = actieveMestData[key];
  if (!mest) return 650;

  const N = mest.N_kg_per_ton || 0;
  const P = mest.P_kg_per_ton || 0;

  let maxN = Infinity;
  let maxP = Infinity;

  if (N > 0 && totaalA) {
    maxN = totaalA / N;
  }

  if (P > 0 && totaalC) {
    maxP = totaalC / P;
  }

  const maxTon = Math.floor(Math.min(maxN, maxP, 650));
  return Math.max(0, maxTon);
}

/**
 * Voert logica uit bij wijziging van kunstmest-stikstof, inclusief vergrendelingscontrole
 * @param {number} nieuweWaarde - voorgestelde hoeveelheid kunststikstof
 * @returns {boolean} true = toegestaan, false = geblokkeerd
 */
function verwerkKunstmestStikstof(nieuweWaarde) {
  const stikstofSlider = document.getElementById('slider-stikstof');
  if (!stikstofSlider) return true;

  const stikstofLocked = isLocked('stikstof');
  const huidigDierlijk = Number(stikstofSlider.value || 0);
  const maxDierlijkToegestaan = Math.min(totaalA, totaalB - nieuweWaarde);

  if (stikstofLocked && huidigDierlijk > maxDierlijkToegestaan) {
    if (DEBUG_MODE) {
      console.warn(`⛔️ Kunststikstof zou stikstof-lock overschrijden. (${huidigDierlijk} > ${maxDierlijkToegestaan})`);
    }
    triggerShakeEffect('kunststikstof');
    revertSliderToPreviousValue('kunststikstof');
    return false;
  }

  return true;
}

function initDebugOverlay() {
  if (!DEBUG_MODE) return;

  // Voeg HTML-element toe
  const overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  document.body.appendChild(overlay);

  // Voeg CSS-styling toe
  const style = document.createElement('style');
  style.innerHTML = `
    #debug-overlay {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0,0,0,0.85);
      color: #00ff7f;
      font-family: monospace;
      font-size: 12px;
      padding: 8px 12px;
      max-height: 24vh;
      overflow-y: auto;
      z-index: 9999;
      white-space: pre-wrap;
      display: block;
    }
  `;
  document.head.appendChild(style);

  // Voeg updatefunctie toe aan global scope
  window.updateDebugOverlay = function () {
    const el = document.getElementById('debug-overlay');
    if (!el) return;
  
    const nut = berekenTotaleNutriënten(true);
    const sliders = ['stikstof', 'fosfaat', 'kalium', 'organisch', 'financieel'];
    const deltaInfo = sliders.map(id => {
      const doel = Number(document.getElementById(`slider-${id}`)?.value || 0);
      const huidig = nut[id] || 0;
      const verschil = doel - huidig;
      return `• ${id}: delta = ${verschil.toFixed(2)}`;
    }).join('\n');
  
    const locked = [
      'stikstof', 'fosfaat', 'kalium', 'organisch', 'kunststikstof'
    ].map(id => ({
      id,
      val: document.getElementById(`slider-${id}`)?.value || '-',
      locked: isLocked(id) ? '✅' : '❌'
    }));
  
    const mestregels = Object.entries(actieveMestData)
      .map(([k, v]) => {
        const gelocked = isLocked(k) ? '🔒' : '';
        const slider = document.getElementById(`slider-${k}`);
        const max = slider?.max || '–';
        return `- ${k}: ${v.ton.toFixed(1)} / ${max} ton ${gelocked}`;
      }).join('\n');
  
    const vrijeStikstofruimte = totaalB - (Number(document.getElementById('slider-kunststikstof')?.value || 0));
  
    const beschikbareMest = Object.keys(actieveMestData).filter(id => !isLocked(id));
    const waarschuwing = beschikbareMest.length === 0
      ? `\n⚠️ Geen mestsoorten beschikbaar voor correctie (alles gelocked?)`
      : '';
  
    el.textContent =
      `🧪 [DEBUG OVERLAY]\n` +
      `Totaal N: ${nut.stikstof?.toFixed(1) || '?'} / ${totaalA}\n` +
      `Totaal P: ${nut.fosfaat?.toFixed(1) || '?'} / ${totaalC}\n` +
      `Kunstmest-stikstof: ${Number(document.getElementById('slider-kunststikstof')?.value || 0)} → max dierlijk: ${vrijeStikstofruimte}\n\n` +
      `🔒 Locks:\n` +
      locked.map(l => `• ${l.id}: ${l.val} (${l.locked})`).join('\n') +
      `\n\n🚛 Mestsoorten:\n${mestregels}` +
      `\n\n📉 Nutriënten-delta:\n${deltaInfo}` +
      waarschuwing;
  };
}

if (DEBUG_MODE) {
  initDebugOverlay();
  updateDebugOverlay();
}



