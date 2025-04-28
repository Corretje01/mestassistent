// kaart.js — met check op dubbele selectie

// 0) State: lijst van geselecteerde percelen
const parcels = []; // elk element: { featureId, layer, naam, ha, grondsoort, nvgebied }

// Hulpfunctie om de UI-lijst te renderen (ongewijzigd)
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  parcels.forEach((p,i) => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.innerHTML = `
      <strong>${i+1}. ${p.naam}</strong><br>
      Opp: ${p.ha} ha · Bodem: ${p.grondsoort}<br>
      <button data-id="${p.featureId}" class="remove-btn">Verwijder</button>
    `;
    div.querySelector('.remove-btn')
       .addEventListener('click', () => removeParcel(p.featureId));
    container.append(div);
  });
}

function removeParcel(featureId) {
  const idx = parcels.findIndex(p => p.featureId === featureId);
  if (idx === -1) return;
  map.removeLayer(parcels[idx].layer);
  parcels.splice(idx, 1);
  renderParcelList();
}

// 1) Init kaart
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

// 2) Kadastrale achtergrond (WMS)
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'kadastralekaart:Perceel',
  format: 'image/png',
  transparent: true,
  attribution: 'Kadaster via PDOK'
}).addTo(map);

// 3) Soil‐mapping helper (ongewijzigd)
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(() => {});
function getBaseCategory(raw) {
  const e = soilMapping.find(x => x.name === raw);
  return e?.category || 'Onbekend';
}

// 4) Klik‐handler: selecteer / deselecteer
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6),
        lat = e.latlng.lat.toFixed(6);

  // 4a) Check dubbele selectie: haal bestaande featureId's op
  // → eerst de proxy-url
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  let feat;
  try {
    const resp = await fetch(proxyUrl);
    const data = await resp.json();
    feat = data.features?.[0];
    if (!feat) return; // geen perceel hier
  } catch {
    return;
  }

  // 4b) Als dit featureId al in parcels zit, negeren we de klik
  if (parcels.some(p => p.featureId === feat.id)) {
    return; // al geselecteerd, niet opnieuw toevoegen
  }

  // 4c) Highlight en UI toevoegen
  const layer = L.geoJSON(feat.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);
  map.fitBounds(layer.getBounds());

  // Lees properties
  const props = feat.properties;
  const naam = props.weergavenaam
             || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
  const opp  = props.kadastraleGrootteWaarde;
  const ha   = opp!=null ? (opp/10000).toFixed(2) : '';

  // NV‐gebied en bodemsoort
  const nvgebied = window.isNV ? 'Ja' : 'Nee';
  let grondsoort = 'Onbekend';
  try {
    const r = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const j = await r.json();
    if (r.ok) grondsoort = getBaseCategory(j.grondsoort);
  } catch {}

  // Push naar onze state en render opnieuw
  parcels.push({
    featureId: feat.id,
    layer,
    naam,
    ha,
    grondsoort,
    nvgebied
  });
  renderParcelList();
});
