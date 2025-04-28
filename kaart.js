// kaart.js

// 0) Optioneel voor debug-logjes
const DEBUG = false;

// 1) Kaart init
const map = L.map('map')
  .setView([52.1, 5.1], 8);

// 2) OSM-achtergrond
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 3) PDOK WMS-laag kadastrale grenzen
L.tileLayer.wms(
  'https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
    layers: 'kadastralekaart:Perceel',
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    SRS: 'EPSG:3857',
    attribution: '&copy; Kadaster via PDOK'
  }
).addTo(map);

// 4) State: array met geselecteerde percelen
const selected = [];

/**
 * Vraagt via Netlify-proxy het perceel op rond (lon, lat).
 * Geeft de GeoJSON-features terug.
 */
async function fetchPerceel(lon, lat) {
  const resp = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
  if (!resp.ok) throw new Error(`Perceel fout: ${resp.status}`);
  const json = await resp.json();
  return json.features || [];
}

/**
 * (Re)render de lijst met formulieren onder de kaart
 */
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = ''; // leegmaken
  selected.forEach(({ naam, opp, grond, nv, layer }, idx) => {
    const div = document.createElement('div');
    div.className = 'parcel-entry';
    div.innerHTML = `
      <strong>${idx + 1}. ${naam}</strong>
      <p>Opp: ${opp} ha &middot; Grond: ${grond} &middot; NV: ${nv}</p>
      <button data-idx="${idx}">🗑️ Verwijder</button>
    `;
    // op delete klikken ->
    div.querySelector('button').addEventListener('click', () => {
      map.removeLayer(layer);
      selected.splice(idx, 1);
      renderParcelList();
    });
    container.appendChild(div);
  });
}

// 5) Click-handler kaart
map.on('click', async e => {
  const [lon, lat] = [
    e.latlng.lng.toFixed(6),
    e.latlng.lat.toFixed(6)
  ];

  try {
    // 5a) Eerst: zit klik binnen een al geselecteerd perceel?
    const turfPoint = turf.point([parseFloat(lon), parseFloat(lat)]);
    const hitIndex = selected.findIndex(({ feat }) =>
      turf.booleanPointInPolygon(turfPoint, feat.geometry)
    );
    if (hitIndex !== -1) {
      // deselect that one
      map.removeLayer(selected[hitIndex].layer);
      selected.splice(hitIndex, 1);
      renderParcelList();
      return;
    }

    // 5b) Anders: laad perceel via proxy
    const feats = await fetchPerceel(lon, lat);
    if (feats.length === 0) {
      alert('Geen perceel gevonden op deze plek.');
      return;
    }
    const feat = feats[0];

    // 5c) Highlight nieuw perceel
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // zoom naar alle geselecteerde in beeld
    const allLayers = selected.map(o => o.layer).concat(layer);
    const group = L.featureGroup(allLayers);
    map.fitBounds(group.getBounds());

    // 5d) properties uitlezen
    const p = feat.properties;
    const naam = p.weergavenaam
               || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp  = p.kadastraleGrootteWaarde != null
               ? (p.kadastraleGrootteWaarde / 10000).toFixed(2)
               : '';
    const grond = window.huidigeGrond || 'Onbekend';
    const nv    = window.isNV ? 'Ja' : 'Nee';

    // 5e) toevoegen aan state + render lijst
    selected.push({ feat, layer, naam, opp, grond, nv });
    renderParcelList();

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// 6) Init lege lijst
renderParcelList();
