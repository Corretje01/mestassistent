// kaart.js — initialisatie en percelenlijst

const DEBUG = false;
const LIVE_ERRORS = true;

let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(name) {
  const e = soilMapping.find(x => x.name === name);
  return e?.category || 'Onbekend';
}

const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

let parcels = [];
function uuid() { return 'p_' + Math.random().toString(36).slice(2); }

function renderParcelList() {
  const container = document.getElementById('parcelList');
  if (!container) return;
  container.innerHTML = '';

  parcels.forEach(p => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.dataset.id = p.id;

    // alleen deze vier velden zichtbaar
    div.innerHTML = `
      <div class="form-group"><label>Perceel</label><input readonly value="${p.name}"></div>
      <div class="form-group"><label>Opp. (ha)</label><input readonly value="${p.ha}"></div>
      <div class="form-group"><label>Gewascode</label><input readonly value="${p.gewasCode}"></div>
      <div class="form-group"><label>Gewasnaam</label><input readonly value="${p.gewasNaam}"></div>
      <button class="remove-btn">Verwijder</button>
    `;
    div.querySelector('.remove-btn').onclick = () => removeParcel(p.id);
    container.append(div);
  });
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
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // Deselecteren bij klik binnen bestaand perceel
  for (const p of parcels) {
    if (p.layer.getBounds().contains(e.latlng)) {
      return removeParcel(p.id);
    }
  }

  try {
    // Perceel ophalen
    const res  = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
    if (!res.ok) throw new Error(`Perceel-API returned ${res.status}`);
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) {
      if (LIVE_ERRORS) alert('Geen perceel gevonden.');
      return;
    }
    if (DEBUG) console.log('DEBUG kaart properties:', feat.properties);

    // Polygon tekenen
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    const props = feat.properties;
    const name  = props.weergavenaam
                || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde;
    const ha    = opp != null ? (opp / 10000).toFixed(2) : '';

    // Bodemsoort ophalen en categoriseren
    let baseCat = getBaseCategory(props.grondsoortNaam || '');
    if (baseCat === 'Zand') {
      baseCat = ['Limburg','Noord-Brabant'].includes(props.provincie)
              ? 'Zuidelijk zand'
              : 'Noordelijk, westelijk en centraal zand';
    }

    // Parcels-data (zonder nvgebied)
    parcels.push({
      id:         uuid(),
      layer,
      name,
      provincie:  props.provincie,
      grondsoort: baseCat,
      ha,
      landgebruik: props.landgebruik   || 'Onbekend',
      gewasCode:   props.gewasCode     || '',
      gewasNaam:   props.gewasNaam     || ''
    });

    renderParcelList();

  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
