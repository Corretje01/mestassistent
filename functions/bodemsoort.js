// functions/bodemsoort.js

exports.handler = async function(event) {
  const { lon, lat } = event.queryStringParameters || {};
  if (!lon || !lat) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'lon en lat parameters zijn verplicht' }),
    };
  }

  // Bouw de WFS-URL met de correcte laag (bro:bodemvlakken) en CQL_FILTER
  const wfsUrl = 
    'https://service.pdok.nl/bzk/bro-bodemkaart/wfs/v1_0' +
    '?service=WFS' +
    '&version=2.0.0' +
    '&request=GetFeature' +
    '&typeNames=bro:bodemvlakken' +
    '&outputFormat=application/json' +
    '&srsName=EPSG:4326' +
    `&cql_filter=INTERSECTS(geometrie,POINT(${lon}%20${lat}))` +
    '&count=1';

  try {
    const resp = await fetch(wfsUrl);
    if (!resp.ok) throw new Error(`PDOK WFS returned status ${resp.status}`);
    const geojson = await resp.json();

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(geojson),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
