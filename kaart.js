// kaart.js — Meerdere percelen selecteren, WMS-laag en dynamische formulieren

// Debug flags
const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil-mapping inladen (nodig voor berekening.js)
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json kon niet geladen worden:', err));
function getBaseCategory(name) {
  const e = soilMapping.find(x => x.name === name);
  return e?.category || 'Onbekend';
}

// 2) Kaart initialiseren
const map = L.map('map').setView([52.1, 5.1], 7);

// 2a) OSM-tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 2b) Kadaster kadastrale grenzen via PDOK WMS
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'perceel',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  SRS: 'EPSG:3857',
  attribution: '&copy; Kadaster'
}).addTo(map);

// 3) Bijhouden van geselecteerde percelen
const selected = [];

// Hulpfunctie: update de lijst in de DOM
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = ''; // alles wissen
  selected.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.innerHTML = `
      <h3>Perceel ${i+1}: ${p.name}</h3>
      <div class="form-row">
        <label>Oppervlakte (ha)</label>
        <span>${p.hectare.toFixed(2)}</span>
      </div>
      <div class="form-row">
        <label>Grondsoort</label>
        <span>${p.grondsoort}</span>
      </div>
      <div class="form-row">
        <label>NV-gebied?</label>
        <span>${p.nvgebied}</span>
      </div>
      <div class="form-row">
        <label>Teelt</label>
        <select data-index="${i}" class="teelt-select">
          <option value="mais">Maïs</option>
          <option value="tarwe">Tarwe</option>
          <option value="suikerbieten">Suikerbieten</option>
        </select>
      </div>
      <div class="form-row">
        <label>Derogatie</label>
        <select data-index="${i}" class="derogatie-select">
          <option value="nee">Nee</option>
          <option value="ja">Ja</option>
        </select>
      </div>
    `;
    container.appendChild(div);
  });

  // Voeg eventlisteners toe op de nieuw gemaakte selects
  container.querySelectorAll('.teelt-select').forEach(sel => {
    sel.value = selected[sel.dataset.index].teelt;
    sel.addEventListener('change', e => {
      selected[e.target.dataset.index].teelt = e.target.value;
    });
  });
  container.querySelectorAll('.derogatie-select').forEach(sel => {
    sel.value = selected[sel.dataset.index].derogatie;
    sel.addEventListener('change', e => {
      selected[e.target.dataset.index].derogatie = e.target.value;
    });
  });
}

// 4) Klik op de kaart: selecteer of deselecteer perceel
map.on('click', async e => {
  // 4a) Deselect als we binnen een bestaand highlight klikken
  for (let i = 0; i < selected.length; i++) {
    const layer = selected[i].layer;
    if (layer.getBounds().contains(e.latlng)) {
      map.removeLayer(layer);
      selected.splice(i, 1);
      renderParcelList();
      return;
    }
  }

  const { lat, lng } = e.latlng;

  // 4b) Bodemsoort ophalen
  let grondsoort = 'Onbekend';
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lng}&lat=${lat}`);
    const j    = await resp.json();
    if (!resp.ok) throw new Error(j.error||resp.status);
    grondsoort = getBaseCategory(j.grondsoort);
  } catch (err) {
    console.error('Bodem fout:', err);
    grondsoort = 'Fout';
  }

  // 4c) Perceel opvragen via proxy
  try {
    const resp = await fetch(`/.netlify/functions/perceel?lon=${lng}&lat=${lat}`);
    const j    = await resp.json();
    if (!resp.ok) throw new Error(j.error||resp.status);
    const feat = j.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden hier.');
      return;
    }

    // 4d) Turf check: punt-in-polygoon
    const pt  = turf.point([lng, lat]);
    const poly= turf.feature(feat.geometry);
    if (!turf.booleanPointInPolygon(pt, poly)) {
      alert('Klik viel net buiten de perceelgrens. Probeer precies binnen te klikken.');
      return;
    }

    // 4e) Highlight en meetgegevens
    const layer = L.geoJSON(feat.geometry, {
      style:{ color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);

    const props = feat.properties;
    const naam  = props.weergavenaam
                  || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const oppM2 = props.kadastraleGrootteWaarde;
    const ha    = oppM2 != null ? oppM2/10000 : 0;

    // 4f) Nieuwe entry in selected[]
    selected.push({
      layer,
      name:      naam,
      hectare:   ha,
      grondsoort,
      nvgebied:  window.isNV ? 'Ja' : 'Nee',
      teelt:     'mais',
      derogatie: 'nee'
    });

    renderParcelList();

  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
