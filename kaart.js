// kaart.js — met soil-mapping, RVO-categorieën en interactieve parcel-selectie

// Zet DEBUG op true om extra logs te zien
const DEBUG = false;
const LIVE_ERRORS = true;

// **1) Soil-mapping inladen**
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

/**
 * Haal de RVO-basis-categorie op uit de raw BRO-naam.
 * Retourneert 'Zand', 'Klei', 'Veen', 'Löss' of 'Onbekend'.
 */
function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// **2) Leaflet-kaart init**
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// Houd de huidige parcel-layer bij zodat we 'm kunnen verwijderen
let parcelLayer = null;

map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 3) Bodemsoort ophalen (exact zoals eerder)
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || resp.status);
    const baseCat = getBaseCategory(payload.grondsoort);
    document.getElementById('grondsoort').value = baseCat;
    window.huidigeGrond = baseCat;
    if (DEBUG) console.log('Bodemsoort:', payload.grondsoort, '→', baseCat);
  } catch (err) {
    console.error('Bodem fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // 4) Bestaande parcelLayer verwijderen
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
  }

  // 5) Perceel ophalen via WFS v1_0 (INSPIRE-geharmoniseerd)
  const wfsBase = 'https://service.pdok.nl/kadaster/cp/wfs/v1_0';
  const params = new URLSearchParams({
    service:  'WFS',
    version:  '1.1.0',
    request:  'GetFeature',
    typeNames:'Perceel',
    outputFormat:'application/json',
    srsName:  'EPSG:4326',
    count:    '1',
    CQL_FILTER:`INTERSECTS(geometry,POINT(${lon} ${lat}))`
  });
  const url = `${wfsBase}?${params.toString()}`;
  if (DEBUG) console.log('Parcel WFS URL:', url);

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(r.status);
    const feat = data.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden op deze locatie.');
      return;
    }

    // 6) Highlight het perceel op de kaart
    parcelLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(parcelLayer.getBounds());

    // 7) Lees properties uit én vul de form in
    const p = feat.properties;
    const opp    = p.kadastraleGrootteWaarde;
    const naam   = p.weergavenaam ||
                   `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    alert(`Perceel: ${naam}\nOppervlakte: ${opp ?? 'n.v.t.'} m²`);
    if (opp) document.getElementById('hectare').value = (opp/10000).toFixed(2);

  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
