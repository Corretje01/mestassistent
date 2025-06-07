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

function compenseerVergrendeldNutrient(changedKey) {
  const lockedNutrient = 'stikstof';
  if (!isLocked(lockedNutrient)) return;

  const mestKeys = Object.keys(actieveMestData);
  if (mestKeys.length < 2) {
    console.warn("🚫 Slechts één mestsoort actief bij gelockte stikstof – wijziging niet toegestaan.");
    // Terugdraaien van de wijziging
    const oudeTon = actieveMestData[changedKey]?.ton || 0;
    stelMesthoeveelheidIn(changedKey, oudeTon);
    return;
  }

  const slider = document.getElementById(`slider-${lockedNutrient}`);
  const lockedN = Number(slider?.value || 0);

  // ⛳️ Oude waarde opslaan om eventueel terug te kunnen zetten
  const oudeTon = actieveMestData[changedKey]?.ton || 0;

  // Herbereken huidig totaal stikstof
  const huidigTotaalN = mestKeys.reduce((totaal, key) => {
    const mest = actieveMestData[key];
    return totaal + mest.ton * mest.N_kg_per_ton;
  }, 0);

  const deltaN = huidigTotaalN - lockedN;
  if (Math.abs(deltaN) < 0.1) return;

  const succes = verdeelCompensatieOverMestsoorten(
    lockedNutrient,
    changedKey,
    deltaN,
    mestKeys
  );

  if (!succes) {
    console.warn(`🔄 Compensatie mislukt – wijziging aan '${changedKey}' wordt teruggedraaid.`);
    stelMesthoeveelheidIn(changedKey, oudeTon);
  }
}

function verdeelCompensatieOverMestsoorten(nutriënt, veroorzakerKey, delta, mestKeys) {
  const actieveKeys = mestKeys.filter(key => key !== veroorzakerKey && !isLocked(key));
  if (actieveKeys.length === 0) return false;

  const totalNutriëntPerTon = actieveKeys.reduce((sum, key) => {
    const mest = actieveMestData[key];
    return sum + mest[`${nutriënt[0].toUpperCase()}_kg_per_ton`] || 0;
  }, 0);

  if (totalNutriëntPerTon === 0) return false;

  for (const key of actieveKeys) {
    const mest = actieveMestData[key];
    const nPerTon = mest[`${nutriënt[0].toUpperCase()}_kg_per_ton`] || 0;
    const aandeel = nPerTon / totalNutriëntPerTon;
    const correctie = -delta * aandeel / nPerTon; // hoeveelheid ton aanpassing

    const nieuwTon = mest.ton + correctie;

    // blokkeer negatieve of onrealistische waarden
    if (nieuwTon < 0 || nieuwTon > 650) return false;

    // ✅ werk data + slider bij
    mest.ton = nieuwTon;
    const transportkosten = 10;
    mest.totaal = {
      N: nieuwTon * mest.N_kg_per_ton,
      P: nieuwTon * mest.P_kg_per_ton,
      K: nieuwTon * mest.K_kg_per_ton,
      OS: nieuwTon * (mest.OS_percent / 100),
      DS: nieuwTon * (mest.DS_percent / 100),
      BG: nieuwTon * mest.biogaspotentieel_m3_per_ton,
      FIN: nieuwTon * (mest.Inkoopprijs_per_ton + 10)
    };

    // ✅ update slider-UI
    const slider = document.getElementById(`slider-${key}`);
    const value  = document.getElementById(`value-${key}`);
    if (slider && value) {
      slider.value = Math.round(nieuwTon * 10) / 10;
      value.textContent = `${slider.value} / ${slider.max} ton`;
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

function stelMesthoeveelheidIn(key, nieuweTon) {
  if (!actieveMestData[key]) return;

  const data = actieveMestData[key];
  data.ton = nieuweTon;

  const ton = nieuweTon;
  const transportkosten = 10; // EUR per ton
  data.totaal = {
    N: ton * data.N_kg_per_ton,
    P: ton * data.P_kg_per_ton,
    K: ton * data.K_kg_per_ton,
    OS: ton * (data.OS_percent / 100),
    DS: ton * (data.DS_percent / 100),
    BG: ton * data.biogaspotentieel_m3_per_ton,
    FIN: ton * (data.Inkoopprijs_per_ton + 10)
  };

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
      const ton = nieuweTon;
      const transportkosten = 10;
      data.totaal = {
        N: ton * data.N_kg_per_ton,
        P: ton * data.P_kg_per_ton,
        K: ton * data.K_kg_per_ton,
        OS: ton * (data.OS_percent / 100),
        DS: ton * (data.DS_percent / 100),
        BG: ton * data.biogaspotentieel_m3_per_ton,
        FIN: ton * (data.Inkoopprijs_per_ton + 10)
      };

      const geslaagd = compenseerVergrendeldNutrient(key);

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
