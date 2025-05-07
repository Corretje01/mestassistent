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
  const delta = 0.00005;
  const minLon = parseFloat(lon) - delta;
  const minLat = parseFloat(lat) - delta;
  const maxLon = parseFloat(lon) + delta;
  const maxLat = parseFloat(lat) + delta;
  const bbox = `${minLat},${minLon},${maxLat},${maxLon},EPSG:4326`;

  // 1) Ophalen kadastraal perceel
  const base = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
  const params = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: 'kadastralekaart:Perceel', outputFormat: 'application/json',
    srsName: 'EPSG:4326', count: '1', bbox,
    CQL_FILTER: `CONTAINS(geometry,POINT(${lon} ${lat}))`
  });
  const url = `${base}?${params.toString()}`;

  const json = await fetch(url).then(r => r.json());
  const feat = json.features?.[0];
  if (!feat) {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(json) };
  }

  // 2) Ophalen gewasperceel via spatial filter
  try {
    const gewasParams = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: 'brpgewaspercelen:BrpGewas', outputFormat: 'application/json',
      srsName: 'EPSG:4326', count: '1', bbox,
      CQL_FILTER: `CONTAINS(geometry,POINT(${lon} ${lat}))`
    });
    const gewasUrl = `https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0?${gewasParams.toString()}`;
    const gjson = await fetch(gewasUrl).then(r => r.json());
    const gfeat = gjson.features?.[0];
    if (gfeat) {
      console.log('DEBUG rawGewaspercelenProperties:', gfeat.properties);
      const gp = gfeat.properties || {};
      const landgebruik = gp.category || 'Onbekend';
      const gewasCode = gp.gewascode?.toString() || '';
      const gewasNaam = gp.gewas || '';
      Object.assign(feat.properties, { landgebruik, gewasCode, gewasNaam });
    }
  } catch (err) {
    console.error('Fout bij ophalen gewasperceel:', err);
  }

  // 3) Ophalen provincie via spatial filter
  try {
    // Gebruik actuele PDOK CBS Gebiedsindelingen-service (Provincie gegeneraliseerd)
    const provParams = new URLSearchParams({
      service:      'WFS',
      version:      '2.0.0',
      request:      'GetFeature',
      typeNames:    'gebiedsindelingen:provincie_gegeneraliseerd',
      outputFormat: 'application/json',
      srsName:      'EPSG:4326',
      count:        '1',
      CQL_FILTER:   `CONTAINS(geometry,POINT(${lon} ${lat}))`
    });
    const provUrl = `https://service.pdok.nl/cbs/gebiedsindelingen/2025/wfs/v1_0?${provParams.toString()}`;
    const pjson = await fetch(provUrl).then(r => r.json());
    const pfeat = pjson.features?.[0];
    if (pfeat) {
      console.log('DEBUG province properties:', pfeat.properties);
      const pname = pfeat.properties.provincienaam || pfeat.properties.PROVINCIE || 'Onbekend';
      Object.assign(feat.properties, { provincie: pname });
    }
  } catch (err) {
    console.error('Fout bij ophalen provincie:', err);
  }

  // Return including updated properties
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(json)
  };;
    }
    console.log('DEBUG kaart properties:', feat.properties);

    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    const props = feat.properties;
    const name = props.weergavenaam || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp = props.kadastraleGrootteWaarde;
    const ha = opp != null ? (opp / 10000).toFixed(2) : '';

    let baseCat = window.huidigeGrond;
    if (!baseCat || baseCat === 'Onbekend') {
      try {
        const pj = await (await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`)).json();
        baseCat = getBaseCategory(pj.grondsoort);
      } catch {}
    }

    parcels.push({
      id: uuid(),
      layer,
      name,
      provincie: props.provincie,
      grondsoort: baseCat,
      nvgebied: window.isNV ? 'Ja' : 'Nee',
      ha,
      landgebruik: props.landgebruik || 'Onbekend',
      gewasCode: props.gewasCode || '',
      gewasNaam: props.gewasNaam || ''
    });
    renderParcelList();
  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
