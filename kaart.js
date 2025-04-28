// kaart.js — Intersects-only, meter-precies, multi-select

// Debugging
const DEBUG = true;

// 1) SoilMapping
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(rawName) {
  const entry = soilMapping.find(e => e.name === rawName);
  return entry?.category || 'Onbekend';
}

// 2) Init kaart
const map = L.map('map').setView([52.1, 5.1], 8);

// OSM-achtergrond
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// WMS-laag met **alle** kadastrale grenzen onderin
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers:      'kadastralekaart:Perceel',
  format:      'image/png',
  transparent: true,
  version:     '1.1.1',
  attribution: '&copy; Kadaster via PDOK'
}).addTo(map);

// 3) State voor geselecteerde percelen
const selected = [];

// 4) Helper om form-lijst te renderen
function renderParcelList() {
  const listEl = document.getElementById('parcelList');
  listEl.innerHTML = '';
  selected.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'parcel-entry';
    div.innerHTML = `
      <strong>${i+1}. ${p.name}</strong>
      <p>Opp: ${p.opp} ha · Bodem: ${p.grond}</p>
      <button data-idx="${i}">🗑 Verwijder</button>
    `;
    div.querySelector('button').onclick = () => {
      map.removeLayer(p.layer);
      selected.splice(i,1);
      renderParcelList();
    };
    listEl.appendChild(div);
  });
}

// 5) Ophalen bodemsoort
async function fetchBodemsoort(lon, lat) {
  const url = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Bodemsoort URL →', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bodemsoort API ${res.status}`);
  const js = await res.json();
  return js.grondsoort || 'Onbekend';
}

// 6) Ophalen perceel via WFS + CQL INTERSECTS
async function fetchPerceel(lon, lat) {
  const cql = `INTERSECTS(geometry,POINT(${lon}%20${lat}))`; // lon lat
  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '1',
    CQL_FILTER:   cql
  });
  const url = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params}`;
  if (DEBUG) console.log('WFS URL →', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WFS API ${res.status}`);
  const js = await res.json();
  if (DEBUG) console.log('Features ontvangen:', js.features);
  return js.features || [];
}

// 7) Klik‐handler: selecteer / deselecteer
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 7a) Deselect check: klik binnen een al-geselecteerde
  const hit = selected.findIndex(o => o.layer.getBounds().contains(e.latlng));
  if (hit !== -1) {
    map.removeLayer(selected[hit].layer);
    selected.splice(hit,1);
    renderParcelList();
    return;
  }

  try {
    // 7b) Bodemsoort
    const rawSoil = await fetchBodemsoort(lon, lat);
    const grond   = getBaseCategory(rawSoil);

    // 7c) Perceel
    const feats = await fetchPerceel(lon, lat);
    if (feats.length === 0) {
      alert('Geen perceel gevonden op dit punt.');
      return;
    }
    const feat = feats[0];

    // 7d) Highlight
    const layer = L.geoJSON(feat.geometry, {
      style: { color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);

    // 7e) Zoom naar alle geselecteerde
    const group = L.featureGroup(selected.map(o=>o.layer).concat(layer));
    map.fitBounds(group.getBounds(), { padding:[20,20] });

    // 7f) Eigenschappen
    const p    = feat.properties;
    const name = p.weergavenaam
               || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp  = p.kadastraleGrootteWaarde!=null
               ? (p.kadastraleGrootteWaarde/10000).toFixed(2)
               : '';
    const nv   = window.isNV ? 'Ja' : 'Nee';

    // 7g) Opslaan + render
    selected.push({ layer, name, opp, grond, nv });
    renderParcelList();

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// 8) Init lege lijst
renderParcelList();
