// ===== kaart.js =====
const DEBUG = false;
const LIVE_ERRORS = true;

// Soil-mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(name) {
  const e = soilMapping.find(x => x.name === name);
  return e?.category || 'Onbekend';
}

// Leaflet init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{  
  attribution: '© OSM contributors'
}).addTo(map);

// Data-structuur voor geselecteerde percelen
let parcels = [];

// Hulpfunctie: unieke ID
function uuid() {
  return 'p_' + Math.random().toString(36).slice(2);
}

// Helper: render UI-lijst
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  parcels.forEach(p => {
    const div = document.createElement('div');
    div.classList.add('parcel-item');
    div.dataset.id = p.id;
    div.innerHTML = `
      <div class="form-group"><label>Perceel</label><input readonly value="${p.name}"></div>
      <div class="form-group"><label>Grondsoort</label><input readonly value="${p.grondsoort}"></div>
      <div class="form-group"><label>NV-gebied?</label><input readonly value="${p.nvgebied}"></div>
      <div class="form-group"><label>Ha (ha)</label><input readonly value="${p.ha}"></div>
      <div class="form-group"><label>Landgebruik</label><input readonly value="${p.landgebruik}"></div>
      <div class="form-group"><label>Gewascode</label><input readonly value="${p.gewasCode}"></div>
      <div class="form-group"><label>Gewas naam</label><input readonly value="${p.gewasNaam}"></div>
      <div class="form-group"><label>Teelt</label>
        <select class="teelt">
          <option value="mais"${p.gewas==='mais'?' selected':''}>Maïs</option>
          <option value="tarwe"${p.gewas==='tarwe'?' selected':''}>Tarwe</option>
          <option value="suikerbieten"${p.gewas==='suikerbieten'?' selected':''}>Suikerbieten</option>
        </select>
      </div>
      <div class="form-group"><label>Derogatie</label>
        <select class="derogatie">
          <option value="nee"${p.derogatie==='nee'?' selected':''}>Nee</option>
          <option value="ja"${p.derogatie==='ja'?' selected':''}>Ja</option>
        </select>
      </div>
      <button class="remove-btn">Verwijder</button>
    `;
    div.querySelector('.remove-btn').onclick = () => removeParcel(p.id);
    div.querySelector('.teelt').onchange = e => { p.gewas = e.target.value; };
    div. querySelector('.derogatie').onchange = e => { p.derogatie = e.target.value; };
    container.append(div);
  });
}

// Helper: verwijder perceel van kaart en uit lijst
function removeParcel(id) {
  const idx = parcels.findIndex(p => p.id === id);
  if (idx < 0) return;
  map.removeLayer(parcels[idx].layer);
  parcels.splice(idx, 1);
  renderParcelList();
}

// Click-handler
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // Deselecteer als opnieuw op hetzelfde perceel geklikt
  for (const p of parcels) {
    if (p.layer.getBounds().contains(e.latlng)) {
      removeParcel(p.id);
      return;
    }
  }

  // Ophalen via proxy
  const url = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Proxy-perceel URL →', url);

  try {
    const res = await fetch(url);
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) {
      if (LIVE_ERRORS) alert('Geen perceel gevonden.');
      return;
    }

    // Highlight perceel op kaart
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // Lees eigenschappen
    const props = feat.properties;
    const name = props.weergavenaam || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp  = props.kadastraleGrootteWaarde;
    const ha   = opp != null ? (opp/10000).toFixed(2) : '';

    // Bodemsoort ophalen indien nodig
    let baseCat = window.huidigeGrond;
    if (!baseCat || baseCat === 'Onbekend') {
      try {
        const br = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
        const pj = await br.json();
        if (br.ok) baseCat = getBaseCategory(pj.grondsoort);
      } catch {}
    }

    // Perceel toevoegen aan lijst
    const id = uuid();
    parcels.push({
      id,
      layer,
      name,
      grondsoort: baseCat,
      nvgebied:   window.isNV ? 'Ja' : 'Nee',
      ha,
      landgebruik: props.landgebruik || 'Onbekend',
      gewasCode:   props.gewasCode   || '',
      gewasNaam:   props.gewasNaam   || '',
      gewas:       'mais',
      derogatie:   'nee'
    });
    renderParcelList();

  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
