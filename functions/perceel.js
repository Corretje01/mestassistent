// ===== functions/perceel.js =====
export async function handler(event) {
  const { lon, lat } = event.queryStringParameters || {};
  if (!lon || !lat) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'lon & lat parameters zijn verplicht' })
    };
  }

  // ±5 m BBOX rond je punt (axis-order lat,lon voor WFS 2.0)
  const delta  = 0.00005;
  const minLon = parseFloat(lon) - delta;
  const minLat = parseFloat(lat) - delta;
  const maxLon = parseFloat(lon) + delta;
  const maxLat = parseFloat(lat) + delta;
  const bbox   = `${minLat},${minLon},${maxLat},${maxLon},EPSG:4326`;

  // 1) Ophalen kadastraal perceel
  const base = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '1',
    bbox,
    CQL_FILTER:   `CONTAINS(geometry,POINT(${lon} ${lat}))`
  });
  const url = `${base}?${params.toString()}`;

  try {
    const res  = await fetch(url);
    const json = await res.json();
    const feat = json.features?.[0];

    if (feat) {
      // Haal perceelId uit kadastraal perceel properties
      const props     = feat.properties || {};
      const perceelId = `${props.kadastraleGemeenteWaarde}${props.sectie}${props.perceelnummer}`;

      // 2) Ophalen gewasperceel op basis van perceelnummer
      try {
        const gewasParams = new URLSearchParams({
          service:      'WFS',
          version:      '2.0.0',
          request:      'GetFeature',
          typeNames:    'brpgewaspercelen:BrpGewas',
          outputFormat: 'application/json',
          srsName:      'EPSG:4326',
          count:        '1',
          CQL_FILTER:   `KAD_PERCEEL='${perceelId}'`
        });
        const gewasUrl = `https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0?${gewasParams.toString()}`;
        const gres    = await fetch(gewasUrl);
        if (gres.ok) {
          const gjson = await gres.json();
          const gfeat = gjson.features?.[0];
          if (gfeat) {
            // DEBUG: toon alle properties
            console.log('DEBUG gewaspercelen properties:', gfeat.properties);

            // Robuuste extractie van landgebruik, gewascode en gewasnaam
            const gp = gfeat.properties || {};
            const landgebruik = gp.CAT_GEWASCATEGORIE
                              || gp.cat_gewascategorie
                              || gp['brpgewaspercelen:CAT_GEWASCATEGORIE']
                              || gp['brpgewaspercelen:cat_gewascategorie']
                              || 'Onbekend';
            const gewasCode   = gp.GWS_GEWASCODE
                              || gp.gws_gewascode
                              || gp['brpgewaspercelen:GWS_GEWASCODE']
                              || gp['brpgewaspercelen:gws_gewascode']
                              || '';
            const gewasNaam   = gp.GWS_GEWAS
                              || gp.gws_gewas
                              || gp['brpgewaspercelen:GWS_GEWAS']
                              || gp['brpgewaspercelen:gws_gewas']
                              || '';

            feat.properties = {
              ...feat.properties,
              landgebruik,
              gewasCode,
              gewasNaam
            };
          }
        }
      } catch (gErr) {
        console.error('Fout bij ophalen gewasperceel:', gErr);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(json)
    };

  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
}


// ===== kaart.js =====
const DEBUG = false;
const LIVE_ERRORS = true;

// Soil-mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(name) {
  const e = soilMapping.find(x => x.name === name);
  return e?.category || 'Onbekend';
}

// Leaflet init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{  
  attribution: '© OSM contributors'
}).addTo(map);

// Data-structuur voor geselecteerde percelen
let parcels = [];

// Hulpfunctie: unieke ID
function uuid() {
  return 'p_' + Math.random().toString(36).slice(2);
}

// Helper: render UI-lijst
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  parcels.forEach(p => {
    const div = document.createElement('div');
    div.classList.add('parcel-item');
    div.dataset.id = p.id;
    div.innerHTML = `
      <div class="form-group"><label>Perceel</label><input readonly value="${p.name}"></div>
      <div class="form-group"><label>Grondsoort</label><input readonly value="${p.grondsoort}"></div>
      <div class="form-group"><label>NV-gebied?</label><input readonly value="${p.nvgebied}"></div>
      <div class="form-group"><label>Ha (ha)</label><input readonly value="${p.ha}"></div>
      <div class="form-group"><label>Landgebruik</label><input readonly value="${p.landgebruik}"></div>
      <div class="form-group"><label>Gewascode</label><input readonly value="${p.gewasCode}"></div>
      <div class="form-group"><label>Gewas naam</label><input readonly value="${p.gewasNaam}"></div>
      <div class="form-group"><label>Teelt</label>
        <select class="teelt">
          <option value="mais"${p.gewas==='mais'?' selected':''}>Maïs</option>
          <option value="tarwe"${p.gewas==='tarwe'?' selected':''}>Tarwe</option>
          <option value="suikerbieten"${p.gewas==='suikerbieten'?' selected':''}>Suikerbieten</option>
        </select>
      </div>
      <div class="form-group"><label>Derogatie</label>
        <select class="derogatie">
          <option value="nee"${p.derogatie==='nee'?' selected':''}>Nee</option>
          <option value="ja"${p.derogatie==='ja'?' selected':''}>Ja</option>
        </select>
      </div>
      <button class="remove-btn">Verwijder</button>
    `;
    div.querySelector('.remove-btn').onclick = () => removeParcel(p.id);
    div.querySelector('.teelt').onchange = e => { p.gewas = e.target.value; };
    div.querySelector('.derogatie').onchange = e => { p.derogatie = e.target.value; };
    container.append(div);
  });
}

// Helper: verwijder perceel van kaart en uit lijst
function removeParcel(id) {
  const idx = parcels.findIndex(p => p.id === id);
  if (idx < 0) return;
  map.removeLayer(parcels[idx].layer);
  parcels.splice(idx, 1);
  renderParcelList();
}

// Click-handler
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // Deselecteer als opnieuw op hetzelfde perceel geklikt
  for (const p of parcels) {
    if (p.layer.getBounds().contains(e.latlng)) {
      removeParcel(p.id);
      return;
    }
  }

  // Ophalen via proxy
  const url = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Proxy-perceel URL →', url);

  try {
    const res = await fetch(url);
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) {
      if (LIVE_ERRORS) alert('Geen perceel gevonden.');
      return;
    }

    // Highlight perceel op kaart
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // Lees eigenschappen
    const props = feat.properties;
    const name = props.weergavenaam || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp  = props.kadastraleGrootteWaarde;
    const ha   = opp != null ? (opp/10000).toFixed(2) : '';

    // Bodemsoort ophalen indien nodig
    let baseCat = window.huidigeGrond;
    if (!baseCat || baseCat === 'Onbekend') {
      try {
        const br = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
        const pj = await br.json();
        if (br.ok) baseCat = getBaseCategory(pj.grondsoort);
      } catch {}
    }

    // Perceel toevoegen aan lijst
    const id = uuid();
    parcels.push({
      id,
      layer,
      name,
      grondsoort: baseCat,
      nvgebied:   window.isNV ? 'Ja' : 'Nee',
      ha,
      landgebruik: props.landgebruik || 'Onbekend',
      gewasCode:   props.gewasCode   || '',
      gewasNaam:   props.gewasNaam   || '',
      gewas:       'mais',
      derogatie:   'nee'
    });
    renderParcelList();

  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
