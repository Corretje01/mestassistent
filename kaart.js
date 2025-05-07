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
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution: '© OSM contributors' }).addTo(map);

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
  for (const p of parcels) if (p.layer.getBounds().contains(e.latlng)) return removeParcel(p.id);

  try {
    const res   = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
    const data  = await res.json();
    const feat  = data.features?.[0];
    if (!feat) { if (LIVE_ERRORS) alert('Geen perceel gevonden.'); return; }
    console.log('DEBUG kaart properties:', feat.properties);

    const layer = L.geoJSON(feat.geometry, { style:{ color:'#1e90ff', weight:2, fillOpacity:0.2 } }).addTo(map);
    const props = feat.properties;
    const name  = props.weergavenaam || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde;
    const ha    = opp != null ? (opp/10000).toFixed(2) : '';

    // Bodemsoort bepalen
    let baseCat = getBaseCategory(props.grondsoort);
    // Indien zand, verder specificeren op provincie
    let grondsoort = baseCat;
    if (baseCat === 'Zand') {
      const prov = props.provincie || '';
      if (prov === 'Limburg' || prov === 'Noord-Brabant') {
        grondsoort = 'Zuidelijk zand';
      } else {
        grondsoort = 'Noordelijk westelijk en centraal zand';
      }
    }

    parcels.push({
      id:         uuid(),
      layer,
      name,
      grondsoort,
      nvgebied:   window.isNV?'Ja':'Nee',
      ha,
      landgebruik: props.landgebruik || 'Onbekend',
      gewasCode:   props.gewasCode   || '',
      gewasNaam:   props.gewasNaam   || ''
    });
    renderParcelList();
  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
