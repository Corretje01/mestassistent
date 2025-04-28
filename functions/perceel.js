// functions/perceel.js
export async function handler(event) {
  const { lon, lat } = event.queryStringParameters || {};
  if (!lon || !lat) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'lon & lat parameters zijn verplicht' })
    };
  }

  // 1) Maak een kleine BBOX rond je punt (hier ±0,0005° ≈ ±55 m)
  const d = 0.0005;
  const minX = parseFloat(lon) - d;
  const maxX = parseFloat(lon) + d;
  const minY = parseFloat(lat) - d;
  const maxY = parseFloat(lat) + d;

  // 2) Combineer BBOX en CONTAINS in één CQL_FILTER
  const cql = [
    `BBOX(geometry,${minX},${minY},${maxX},${maxY})`,
    `CONTAINS(geometry,POINT(${lon} ${lat}))`
  ].join(' AND ');

  // 3) Bouw de WFS-URL
  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '1',
    CQL_FILTER:   cql
  });
  const url = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params}`;

  try {
    const res  = await fetch(url);
    const json = await res.json();
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
