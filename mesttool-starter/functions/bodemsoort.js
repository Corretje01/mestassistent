// netlify/functions/bodemsoort.js

// We gebruiken de ingebouwde fetch van Node18-runtime in Netlify
exports.handler = async function(event, context) {
  const lon = event.queryStringParameters?.lon;
  const lat = event.queryStringParameters?.lat;
  if (!lon || !lat) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'lon en lat parameters zijn verplicht' })
    };
  }

  // Bouw de WFS-URL voor PDOK BRO bodemkaart
  const wfsUrl =
    'https://service.pdok.nl/bzk/bro-bodemkaart/wfs/v1_0' +
    '?service=WFS&version=2.0.0&request=GetFeature' +
    '&typeNames=bro:bodemvlakken' +
    '&outputFormat=application/json' +
    '&srsName=EPSG:4326' +
    `&cql_filter=INTERSECTS(geometrie,POINT(${lon}%20${lat}))` +
    '&count=1';

  try {
    const resp = await fetch(wfsUrl);
    if (!resp.ok) throw new Error(`PDOK WFS returned status ${resp.status}`);
    const json = await resp.json();

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(json),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
