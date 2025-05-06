// ===== kaart.js =====
const DEBUG = false;
const LIVE_ERRORS = true;

// Soil-mapping inladen
en let soilMapping = [];
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
  attribution:'© OSM contributors'
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
    div.querySelector('.derogatie').onchange = e => { p.derogatie = e.target.value; };
    container.append(div);
  });
}

// Helper: verwijder perceel\..
