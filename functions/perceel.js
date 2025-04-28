export async function handler(event) {
  const { lon, lat } = event.queryStringParameters || {};
  if (!lon || !lat) {
    return { statusCode:400, body: JSON.stringify({error:'lon & lat zijn verplicht'}) };
  }

  // ±0.00005° is ca. 5 m
  const delta = 0.00005;
  const minX = parseFloat(lon) - delta;
  const maxX = parseFloat(lon) + delta;
  const minY = parseFloat(lat) - delta;
  const maxY = parseFloat(lat) + delta;

  const cql = `BBOX(geometry,${minX},${minY},${maxX},${maxY})`;
  // of: const cql = `INTERSECTS(geometry,POINT(${lon} ${lat}))`;

  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '10',         // retourneer even meerdere kandidaten
    CQL_FILTER:   cql
  });
  const url = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params}`;

  try {
    const resp = await fetch(url);
    const json = await resp.json();
    return {
      statusCode:200,
      headers:{'Access-Control-Allow-Origin':'*'},
      body: JSON.stringify(json)
    };
  } catch(err) {
    return {
      statusCode:502,
      headers:{'Access-Control-Allow-Origin':'*'},
      body: JSON.stringify({error: err.message})
    };
  }
}
