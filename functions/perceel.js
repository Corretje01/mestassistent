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

  // ±5 m BBOX rond het klikpunt (axis-order lat,lon voor WFS 2.0)
  const delta  = 0.00005;
  const minLon = parseFloat(lon) - delta;
  const minLat = parseFloat(lat) - delta;
  const maxLon = parseFloat(lon) + delta;
  const maxLat = parseFloat(lat) + delta;
  const bbox   = `${minLat},${minLon},${maxLat},${maxLon},EPSG:4326`;

  // 1) Ophalen kadastraal perceel
  const base1  = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
  const params1 = new URLSearchParams({
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
  const url1 = `${base1}?${params1.toString()}`;
  const json1 = await fetch(url1).then(r => r.json());
  const feat  = json1.features?.[0];
  if (!feat) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(json1)
    };
  }

  // 2) Ophalen gewasperceel via spatial filter
  try {
    const base2  = 'https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0';
    const params2 = new URLSearchParams({
      service:      'WFS',
      version:      '2.0.0',
      request:      'GetFeature',
      typeNames:    'brpgewaspercelen:BrpGewas',
      outputFormat: 'application/json',
      srsName:      'EPSG:4326',
      count:        '1',
      bbox,
      CQL_FILTER:   `CONTAINS(geometry,POINT(${lon} ${lat}))`
    });
    const url2   = `${base2}?${params2.toString()}`;
    const gjson  = await fetch(url2).then(r => r.json());
    const gfeat  = gjson.features?.[0];
    if (gfeat) {
      console.log('DEBUG gewas properties:', gfeat.properties);
      const gp = gfeat.properties || {};
      const landgebruik = gp.category       || 'Onbekend';
      const gewasCode   = gp.gewascode?.toString() || '';
      const gewasNaam   = gp.gewas            || '';
      Object.assign(feat.properties, { landgebruik, gewasCode, gewasNaam });
    }
  } catch (e) {
    console.error('Fout bij ophalen gewasperceel:', e);
  }

  // 3) Ophalen provincie via spatial filter
  try {
    const base3  = 'https://service.pdok.nl/cbs/gebiedsindelingen/2023/wfs/v1_0';
    const params3 = new URLSearchParams({
      service:      'WFS',
      version:      '2.0.0',
      request:      'GetFeature',
      typeNames:    'gebiedsindelingen:provincie_gegeneraliseerd',
      outputFormat: 'application/json',
      srsName:      'EPSG:4326',
      count:        '1',
      CQL_FILTER:   `CONTAINS(geometry,POINT(${lon} ${lat}))`
    });
    const url3   = `${base3}?${params3.toString()}`;
    const pjson  = await fetch(url3).then(r => r.json());
    const pfeat  = pjson.features?.[0];
    if (pfeat) {
      console.log('DEBUG province properties:', pfeat.properties);
      const pp = pfeat.properties;
      const pname = pp.provincienaam || pp.PROVINCIE || pp.statnaam || 'Onbekend';
      Object.assign(feat.properties, { provincie: pname });
    }
  } catch (e) {
    console.error('Fout bij ophalen provincie:', e);
  }

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(json1)
  };
}
