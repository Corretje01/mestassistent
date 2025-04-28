// kaart.js — volledig herschreven

// 0) Lijst van geselecteerde percelen
const selectedParcels = [];

// 1) Kaart init
const map = L.map('map').setView([52.1, 5.1], 8);

// 2) Achtergrond (OSM)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 3) Kadastrale grenzen achtergrond (WMS PDOK)
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'perceelgrens',
  format: 'image/png',
  transparent: true,
  attribution: 'Kadaster via PDOK'
}).addTo(map);

// Helpers: maak URL's
function bodemsoortUrl(lon, lat) {
  return `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;
}
function perceelWfsUrl(lon, lat) {
  const pt = encodeURIComponent(`POINT(${lon} ${lat})`);
  const p = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count: '1',
    CQL_FILTER: `INTERSECTS(geometry,${pt})`
  });
  return `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${p}`;
}

// 4) Klik op kaart
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 4a) Deselec­t: klik binnen bestaand geselecteerd perceel?
  for (let p of selectedParcels) {
    if (p.layer.getBounds().contains(e.latlng)) {
      removeParcel(p.id);
      return;
    }
  }

  // 4b) Bodemsoort ophalen
  let grondsoort = 'Onbekend';
  try {
    const r1 = await fetch(bodemsoortUrl(lon, lat));
    const j1 = await r1.json();
    grondsoort = j1.grondsoort || grondsoort;
  } catch {
    console.warn('Bodemsoort mislukte');
  }

  // 4c) Perceel ophalen
  try {
    const r2 = await fetch(perceelWfsUrl(lon, lat));
    const j2 = await r2.json();
    const feat = j2.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden.');
      return;
    }

    // props lezen
    const pr = feat.properties;
    const naam =
      pr.weergavenaam ||
      `${pr.kadastraleGemeenteWaarde} ${pr.sectie} ${pr.perceelnummer}`;
    const oppHa = pr.kadastraleGrootteWaarde
      ? (pr.kadastraleGrootteWaarde / 10000).toFixed(2)
      : '';

    // 4d) Teken perceel
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(layer.getBounds());

    // 4e) Voeg toe
    const id = feat.id;
    selectedParcels.push({ id, layer, naam, oppHa, grondsoort });
    renderParcelList();
  } catch (err) {
    console.error('Perceel mislukte', err);
    alert('Fout bij perceel ophalen.');
  }
});

// Verwijder functie
function removeParcel(id) {
  const idx = selectedParcels.findIndex(p => p.id === id);
  if (idx < 0) return;
  map.removeLayer(selectedParcels[idx].layer);
  selectedParcels.splice(idx, 1);
  renderParcelList();
}

// Lijst renderen
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  selectedParcels.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'parcel-item';
    d.innerHTML = `
      <strong>${i + 1}. ${p.naam}</strong><br>
      Opp: ${p.oppHa} ha · Bodem: ${p.grondsoort}
      <button data-id="${p.id}" class="remove-btn">Verwijder</button>
    `;
    container.appendChild(d);
  });
  container
    .querySelectorAll('.remove-btn')
    .forEach(b => (b.onclick = () => removeParcel(b.dataset.id)));
}
