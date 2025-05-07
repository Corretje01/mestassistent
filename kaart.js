// ===== kaart.js =====
const DEBUG = false;
const LIVE_ERRORS = true;

let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(name) {
  const e = soilMapping.find(x => x.name === name);
  return e?.category || 'Onbekend';
}

const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM contributors' }).addTo(map);

let parcels = [];
function uuid() { return 'p_' + Math.random().toString(36).slice(2); }

function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  parcels.forEach(p => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.dataset.id = p.id;
    div.innerHTML = `
      <div class="form-group"><label>Perceel</label><input readonly value="${p.name}"></div>
      <div class="form-group"><label>Provincie</label><input readonly value="${p.provincie || 'Onbekend'}"></div>
      <div class="form-group"><label>Grondsoort</label><input readonly value="${p.grondsoort}"></div>
      <div class="form-group"><label>NV-gebied?</label><input readonly value="${p.nvgebied}"></div>
      <div class="form-group"><label>Ha (ha)</label><input readonly value="${p.ha}"></div>
      <div class="form-group"><label>Landgebruik</label><input readonly value="${p.landgebruik}"></div>
      <div class="form-group"><label>Gewascode</label><input readonly value="${p.gewasCode}"></div>
      <div class="form-group"><label>Gewas naam</label><input readonly value="${p.gewasNaam}"></div>
      <button class="remove-btn">Verwijder</button>
    `;
    div.querySelector('.remove-btn').onclick = () => removeParcel(p.id);
    container.append(div);
  });
}
}

function removeParcel(id) {
  const idx = parcels.findIndex(p => p.id === id);
  if (idx >= 0) {
    map.removeLayer(parcels[idx].layer);
    parcels.splice(idx, 1);
    renderParcelList();
  }
}

map.on('click', async e => {
  console.clear();
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // Deselecteer bij herhaald klikken
  for (const p of parcels) {
    if (p.layer.getBounds().contains(e.latlng)) {
      return removeParcel(p.id);
    }
  }

  try {
    const res  = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) {
      if (LIVE_ERRORS) alert('Geen perceel gevonden.');
      return;
    }
    console.log('DEBUG kaart properties:', feat.properties);

    // Highlight perceel
    const layer = L.geoJSON(feat.geometry, { style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 } }).addTo(map);

    // Lees basisprops
    const props = feat.properties;
    const name  = props.weergavenaam || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde;
    const ha    = opp != null ? (opp/10000).toFixed(2) : '';

    // Ophalen provincie via CBS-Provincies WFS
    let provincie = 'Onbekend';
    try {
      const provParams = new URLSearchParams({
        service:      'WFS',
        version:      '2.0.0',
        request:      'GetFeature',
        typeNames:    'cbsgebied:Provincie',
        outputFormat: 'application/json',
        srsName:      'EPSG:4326',
        count:        '1',
        CQL_FILTER:   `CONTAINS(geometry,POINT(${lon} ${lat}))`
      });
      const provUrl   = `https://geodata.nationaalgeoregister.nl/cbsgebied/wfs/v2_0?${provParams.toString()}`;
      const provFeat  = (await fetch(provUrl).then(r=>r.json())).features?.[0];
      if (provFeat) provincie = provFeat.properties.provincienaam;
      console.log('DEBUG provincie:', provincie);
    } catch(err) {
      console.error('Fout bij ophalen provincie:', err);
    }

    // Ophalen bodemsoort
    let baseCat = window.huidigeGrond;
    if (!baseCat || baseCat === 'Onbekend') {
      try {
        const pj = await (await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`)).json();
        baseCat = getBaseCategory(pj.grondsoort);
      } catch {}
    }

    // Voeg toe aan lijst
    parcels.push({
      id:         uuid(),
      layer,
      name,
      provincie:   props.provincie || 'Onbekend',
      grondsoort: baseCat,
      nvgebied:   window.isNV ? 'Ja' : 'Nee',
      ha,
      landgebruik: props.landgebruik || 'Onbekend',
      gewasCode:   props.gewasCode   || '',
      gewasNaam:   props.gewasNaam   || ''
    });
    renderParcelList();
    renderParcelList();
  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
