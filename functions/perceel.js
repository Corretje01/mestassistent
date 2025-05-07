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

  // Haal kadastraal perceel op
  const json = await fetch(url).then(r => r.json());
  const feat = json.features?.[0];
  if (!feat) {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(json) };
  }

  // Perceelnummer samenstellen uit Kadaster-velden
  const p = feat.properties || {};
  const perceelId = `${p.kadastraleGemeenteWaarde}${p.sectie}${p.perceelnummer}`;
  console.log('DEBUG perceelId:', perceelId);
  feat.properties.perceelId = perceelId;

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
    const gjson    = await fetch(gewasUrl).then(r => r.json());
    const gfeat    = gjson.features?.[0];
    if (gfeat) {
      // Voeg raw gewaspercelen properties toe voor debugging in browser
      feat.properties.rawGewaspercelenProperties = gfeat.properties;
      console.log('DEBUG rawGewaspercelenProperties:', gfeat.properties);

      const gp = gfeat.properties || {};
      const landgebruik = gp.CAT_GEWASCATEGORIE || gp.cat_gewascategorie || '';
      const gewasCode   = gp.GWS_GEWASCODE    || gp.gws_gewascode    || '';
      const gewasNaam   = gp.GWS_GEWAS        || gp.gws_gewas        || '';
      Object.assign(feat.properties, { landgebruik, gewasCode, gewasNaam });
    }
  } catch (err) {
    console.error('Fout bij ophalen gewasperceel:', err);
  }

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(json)
  };
}
