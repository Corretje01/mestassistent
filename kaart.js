// kaart.js — met soilMapping + kadastrale perceelinformatie (v5) via PDOK, met RD-projectie via proj4

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

let marker;
map.on('click', async e => {
  // Verwijder oude marker en zet een nieuwe neer
  if (marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);

  const lon = parseFloat(e.latlng.lng);
  const lat = parseFloat(e.latlng.lat);

  // **3) Bodemsoort opvragen**
  const bodemUrl = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;
  try {
    const resp = await fetch(bodemUrl);
    const payload = await resp.json();
    if (!resp.ok) {
      console.error(`Function returned status ${resp.status}`, payload);
      if (LIVE_ERRORS) console.error('Raw payload:', payload.raw ?? payload);
      document.getElementById('grondsoort').value = 'Fout bij ophalen';
      window.huidigeGrond = 'Onbekend';
      return;
    }
    const rawName = payload.grondsoort;
    const baseCat = getBaseCategory(rawName);
    if (DEBUG) console.log('RAW bodem response:', payload.raw ?? payload);
    console.log(`Grondsoort: ${rawName} → Basis-categorie: ${baseCat}`);
    document.getElementById('grondsoort').value = baseCat;
    window.huidigeGrond = baseCat;
  } catch (err) {
    console.error('Fetch of bodem JSON failed:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'Onbekend';
  }

  // **4) RD-projectie (EPSG:28992) met proj4**
  // Definieer EPSG:28992 als het nog niet bekend is
  if (!proj4.defs['EPSG:28992']) {
    proj4.defs('EPSG:28992',
      '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 '
     +'+k=0.9999079 +x_0=155000 +y_0=463000 '
     +'+ellps=bessel +towgs84=565.417,50.3319,465.552,'
     +'-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs'
    );
  }
  let rdX, rdY;
  try {
    [rdX, rdY] = proj4('EPSG:4326', 'EPSG:28992', [lon, lat]);
  } catch (err) {
    console.error('Proj4 transform failed:', err.message);
    rdX = lon;
    rdY = lat;
  }
  if (DEBUG) console.log(`RD-coördinaten: x=${rdX.toFixed(2)}, y=${rdY.toFixed(2)}`);

  // **5) Perceelinformatie opvragen via WFS v5**
  const wfsBase = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName: 'urn:ogc:def:crs:EPSG::28992',
    count: '1',
    CQL_FILTER: `INTERSECTS(geometrie,POINT(${rdX} ${rdY}))`
  });
  const perceelUrl = `${wfsBase}?${params.toString()}`;
  if (DEBUG) console.log('Perceel WFS URL:', perceelUrl);

  try {
    const perceelResp = await fetch(perceelUrl);
    const perceelData = await perceelResp.json();
    if (!perceelResp.ok) {
      console.error(`Perceel-service returned status ${perceelResp.status}`, perceelData);
      if (LIVE_ERRORS) console.error('Raw perceel payload:', perceelData);
      return;
    }
    const features = perceelData.features;
    if (!features || features.length === 0) {
      alert('Geen perceel gevonden op deze locatie.');
      return;
    }
    const p = features[0].properties;
    // Dynamische veldnamen
    const oppField = ['kadastraleGrootteWaarde','oppervlakte','area'].find(f => p[f] !== undefined);
    const nummerField = ['perceelnummer','identificatie'].find(f => p[f] !== undefined);
    const sectieField = ['sectie'].find(f => p[f] !== undefined);
    const gemeenteField = ['kadastraleGemeentenaam','kadastraleGemeente','gemeentenaam','gemeente']
                         .find(f => p[f] !== undefined);

    const opp = p[oppField];
    const perceelNummer = p[nummerField];
    const sectie = p[sectieField];
    const gemeente = p[gemeenteField] || '';

    if (DEBUG) {
      console.log('Perceel properties:', p);
      console.log(`Perceel gevonden: ${gemeente} ${sectie} ${perceelNummer}`);
      console.log(`Oppervlakte: ${opp} m²`);
    }

    alert(`Perceel: ${gemeente} ${sectie} ${perceelNummer}\nOppervlakte: ${opp} m²`);
    document.getElementById('hectare').value = (opp / 10000).toFixed(2);
  } catch (err) {
    console.error('Fout bij ophalen perceelinformatie:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceelinformatie.');
  }
});
