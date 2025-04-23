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

  // Zet bbox steeds op exact jouw punt (1×1 pixel)
  const bbox = `${lat},${lon},${lat},${lon}`;
  const url =
    'https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0' +
    '?service=WMS' +
    '&version=1.3.0' +
    '&request=GetFeatureInfo' +
    '&layers=soilarea' +
    '&query_layers=soilarea' +
    '&styles=' +
    `&bbox=${bbox}` +
    '&width=1&height=1' +
    '&crs=EPSG:4326' +
    '&format=image/png' +
    '&info_format=application/json' +
    '&i=0&j=0';

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PDOK WMS returned status ${resp.status}`);
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
