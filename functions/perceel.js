// functions/perceel.js
import fetch from 'node-fetch';

export async function handler(event) {
  const { lon, lat } = event.queryStringParameters || {};
  if (!lon || !lat) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'lon & lat parameters zijn verplicht' })
    };
  }

  // Bouw een heel klein BBOX rond je punt (±2 m)
  const delta  = 0.00002;
  const minLon = parseFloat(lon) - delta;
  const minLat = parseFloat(lat) - delta;
  const maxLon = parseFloat(lon) + delta;
  const maxLat = parseFloat(lat) + delta;
  const bbox   = `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`;

  // WFS v5_0 endpoint
  const wfsBase = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '1',
    bbox
  });
  const url = `${wfsBase}?${params.toString()}`;

  try {
    const res = await fetch(url);
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
