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
      // 2) Ophalen gewasperceel (BRP Gewaspercelen WFS)
      try {
        const gewasParams = new URLSearchParams({
          service:      'WFS',
          version:      '2.0.0',
          request:      'GetFeature',
          typeNames:    'brpgewaspercelen:gewaspercelen',
          outputFormat: 'application/json',
          srsName:      'EPSG:4326',
          count:        '1',
          CQL_FILTER:   `CONTAINS(geometry,POINT(${lon} ${lat}))`
        });
        const gewasUrl = `https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0?${gewasParams.toString()}`;
        const gres = await fetch(gewasUrl);
        if (gres.ok) {
          const gjson = await gres.json();
          const gfeat = gjson.features?.[0];
          if (gfeat) {
            // Voeg landgebruik en gewascode toe aan properties
            feat.properties = {
              ...feat.properties,
              landgebruik: gfeat.properties.CAT_GEWASCATEGORIE,
              gewasCode:   gfeat.properties.GWS_GEWASCODE,
              gewasNaam:   gfeat.properties.GWS_GEWAS
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
