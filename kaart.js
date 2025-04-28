// kaart.js — met eigen pane voor kadastrale lijnen

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) SoilMapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('Kan soilMapping.json niet laden:', err));

function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet init
const map = L.map('map').setView([52.1, 5.1], 12);

// 3) OSM-basetiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 4) Maak een nieuwe pane voor kadastrale lijnen, z-index net boven de OSM maar onder GeoJSON
map.createPane('kadastralPane');
map.getPane('kadastralPane').style.zIndex = 200;  // OSM heeft pane 200, overlayPane 400, markerPane 600

// 5) Laad PDOK WMS in die pane
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  pane: 'kadastralPane',
  layers: 'kadastralekaart:Perceel',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',        // wms versie die EPSG:3857 ondersteunt
  attribution: 'Kadaster via PDOK'
}).addTo(map);

let parcelLayer = null;

// 6) Klik-logica (select / deselect + highlight)
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // a) deselect als binnen huidig highlight
  if (parcelLayer && parcelLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
    ['perceel','hectare','grondsoort','nvgebied'].forEach(id => {
      document.getElementById(id).value = '';
    });
    return;
  }

  // b) haal bodemsoort op
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error||resp.status);
    const base = getBaseCategory(body.grondsoort);
    document.getElementById('grondsoort').value = base;
    window.huidigeGrond = base;
  } catch (err) {
    console.error('Bodemsoort fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // c) oude highlight verwijderen
  if (parcelLayer) map.removeLayer(parcelLayer);

  // d) perceel via proxy
  const url = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Proxy-perceel URL →', url);

  try {
    const r    = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error||r.status);
    const feat = data.features?.[0];
    if (!feat) {
      alert('Klik viel net buiten de perceelgrens. Probeer binnen te klikken.');
      return;
    }

    // e) highlight
    parcelLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(parcelLayer.getBounds());

    // f) vul velden
    const p = feat.properties;
    const naam = p.weergavenaam
      || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp = p.kadastraleGrootteWaarde;
    document.getElementById('perceel').value  = naam;
    document.getElementById('hectare').value  = opp
      ? (opp/10000).toFixed(2) : '';
    document.getElementById('nvgebied').value = window.isNV ? 'Ja' : 'Nee';

  } catch (err) {
    console.error('Perceel fout bij ophalen:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
// kaart.js — met eigen pane voor kadastrale lijnen

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) SoilMapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('Kan soilMapping.json niet laden:', err));

function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet init
const map = L.map('map').setView([52.1, 5.1], 12);

// 3) OSM-basetiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 4) Maak een nieuwe pane voor kadastrale lijnen, z-index net boven de OSM maar onder GeoJSON
map.createPane('kadastralPane');
map.getPane('kadastralPane').style.zIndex = 200;  // OSM heeft pane 200, overlayPane 400, markerPane 600

// 5) Laad PDOK WMS in die pane
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  pane: 'kadastralPane',
  layers: 'kadastralekaart:Perceel',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',        // wms versie die EPSG:3857 ondersteunt
  attribution: 'Kadaster via PDOK'
}).addTo(map);

let parcelLayer = null;

// 6) Klik-logica (select / deselect + highlight)
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // a) deselect als binnen huidig highlight
  if (parcelLayer && parcelLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
    ['perceel','hectare','grondsoort','nvgebied'].forEach(id => {
      document.getElementById(id).value = '';
    });
    return;
  }

  // b) haal bodemsoort op
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error||resp.status);
    const base = getBaseCategory(body.grondsoort);
    document.getElementById('grondsoort').value = base;
    window.huidigeGrond = base;
  } catch (err) {
    console.error('Bodemsoort fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // c) oude highlight verwijderen
  if (parcelLayer) map.removeLayer(parcelLayer);

  // d) perceel via proxy
  const url = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Proxy-perceel URL →', url);

  try {
    const r    = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error||r.status);
    const feat = data.features?.[0];
    if (!feat) {
      alert('Klik viel net buiten de perceelgrens. Probeer binnen te klikken.');
      return;
    }

    // e) highlight
    parcelLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(parcelLayer.getBounds());

    // f) vul velden
    const p = feat.properties;
    const naam = p.weergavenaam
      || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp = p.kadastraleGrootteWaarde;
    document.getElementById('perceel').value  = naam;
    document.getElementById('hectare').value  = opp
      ? (opp/10000).toFixed(2) : '';
    document.getElementById('nvgebied').value = window.isNV ? 'Ja' : 'Nee';

  } catch (err) {
    console.error('Perceel fout bij ophalen:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
