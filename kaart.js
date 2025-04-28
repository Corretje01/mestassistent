// kaart.js — volledig herschreven

// 0) Globals
const selectedParcels = []; // array van { id, layer, props }

// 1) Initialiseer Leaflet-kaart
const map = L.map('map').setView([52.1, 5.1], 8);

// 2) Achtergrond (OSM)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 3) Kadastrale grenzen als WMS-overlay
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'perceelgrens',
  format: 'image/png',
  transparent: true,
  attribution: 'Kadaster via PDOK'
}).addTo(map);

// Hulpfunctie: bouw Bodemsoort-URL
function bodemsoortUrl(lon, lat) {
  return `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;
}

// Hulpfunctie: bouw Perceel-WFS-URL met CQL_FILTER=INTERSECTS
function perceelWfsUrl(lon, lat) {
  const point = encodeURIComponent(`POINT(${lon} ${lat})`);
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count: '1',
    CQL_FILTER: `INTERSECTS(geometry,${point})`
  });
  return `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params}`;
}

// 4) Map-click handler
map.on('click', async e => {
  const [lon, lat] = [e.latlng.lng.toFixed(6), e.latlng.lat.toFixed(6)];

  // 4a) Kijk of we binnen een bestaand geselecteerd perceel klikken → deselect
  for (let i = 0; i < selectedParcels.length; i++) {
    const { layer } = selectedParcels[i];
    if (layer.getBounds().contains(e.latlng)) {
      removeParcel(selectedParcels[i].id);
      return;
    }
  }

  // 4b) Haal bodemsoort
  let grondsoort = 'Onbekend';
  try {
    const resp1 = await fetch(bodemsoortUrl(lon, lat));
    if (!resp1.ok) throw new Error();
    const j = await resp1.json();
    grondsoort = j.grondsoort || 'Onbekend';
  } catch {
    console.warn('Bodemsoort ophalen mislukt');
  }

  // 4c) Haal perceel via WFS
  try {
    const resp2 = await fetch(perceelWfsUrl(lon, lat));
    if (!resp2.ok) throw new Error();
    const j2 = await resp2.json();
    const feat = j2.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden onder deze klik.');
      return;
    }

    const props = feat.properties;
    // bepaal de naam (weergavenaam of gemeentecode+sectie+nummer)
    const naam = props.weergavenaam
               || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    // opp in m2 omrekenen naar ha
    const oppHa = props.kadastraleGrootteWaarde
                ? (props.kadastraleGrootteWaarde / 10000).toFixed(2)
                : '';

    // 4d) Teken perceel op de kaart
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(layer.getBounds());

    // 4e) Voeg toe aan selectedParcels
    const id = feat.id;
    selectedParcels.push({ id, layer, naam, oppHa, grondsoort });
    renderParcelList();

  } catch (err) {
    console.error('Perceel ophalen mislukt', err);
    alert('Fout bij ophalen perceel.');
  }
});

// 5) Verwijder percelen
function removeParcel(id) {
  const idx = selectedParcels.findIndex(p => p.id === id);
  if (idx === -1) return;
  map.removeLayer(selectedParcels[idx].layer);
  selectedParcels.splice(idx, 1);
  renderParcelList();
}

// 6) Render de lijst onder de kaart
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = ''; // leegmaken

  selectedParcels.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.innerHTML = `
      <strong>${i + 1}. ${p.naam}</strong><br>
      Opp: ${p.oppHa} ha · Bodem: ${p.grondsoort}
      <button data-id="${p.id}" class="remove-btn">Verwijder</button>
    `;
    container.appendChild(div);
  });

  // events op verwijderen-knoppen
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.onclick = () => removeParcel(btn.dataset.id);
  });
}
