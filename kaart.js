// kaart.js — met soilMapping, RVO-categorieën en interactieve parcel-selectie via OGC API Features

// DEBUG en LIVE_ERRORS
const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil-mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
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

// 2) Leaflet-kaart init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// Houd de huidige parcel-laag bij zodat we die maar één keer tekenen
let parcelLayer = null;

map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 3) Bodemsoort ophalen via je bestaande Netlify-Function
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const p = await resp.json();
    if (!resp.ok) throw new Error(p.error || resp.status);
    const baseCat = getBaseCategory(p.grondsoort);
    document.getElementById('grondsoort').value = baseCat;
    window.huidigeGrond = baseCat;
    if (DEBUG) console.log('Bodemsoort:', p.grondsoort, '→', baseCat);
  } catch (err) {
    console.error('Bodem fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // 4) Vorige selectie resetten
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
  }

// 5) Perceel ophalen via onze Netlify-proxy
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('🔗 Proxy-perceel URL:', proxyUrl);

  try {
    const r    = await fetch(proxyUrl);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Status ${r.status}`);
    const feat = data.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden op deze locatie.');
      return;
    }

    // highlight én vullen van de form blijft exact zoals je had
    parcelLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(parcelLayer.getBounds());

    const p    = feat.properties;
    const opp  = p.kadastraleGrootteWaarde;
    const naam = p.weergavenaam ||
                 `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;

    alert(`Perceel: ${naam}\nOppervlakte: ${opp ?? 'n.v.t.'} m²`);
    if (opp) document.getElementById('hectare').value = (opp/10000).toFixed(2);
  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }

    // 6) Highlight het perceel
    parcelLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(parcelLayer.getBounds());

    // 7) Lees de properties uit en vul je form in
    const props = feat.properties;
    // Weergavenaam komt meestal als “Gemeente Sectie Nummer”
    const naam = props.weergavenaam 
                  || `${props.kadastraleGemeenteNaam} ${props.sectie} ${props.perceelnummer}`;
    // Probeer oppervlakte uit een van de mogelijke velden
    const areaKey = Object.keys(props)
      .find(k => /grootte|oppervlakte/i.test(k));
    const opp = areaKey ? props[areaKey] : undefined;

    alert(
      `Perceel: ${naam}\n` +
      `Oppervlakte: ${opp != null ? opp + ' m²' : 'n.v.t.'}`
    );
    if (opp != null) {
      document.getElementById('hectare').value = (opp / 10000).toFixed(2);
    }
  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
