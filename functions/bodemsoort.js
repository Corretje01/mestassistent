// netlify/functions/bodemsoort.js
export async function handler(event) {
  const { lon, lat, debug } = event.queryStringParameters || {};
  if (!lon || !lat) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'lon en lat parameters zijn verplicht' }),
    };
  }

  // Klein vierkantje van ±0.0001° rond je punt
  const delta = 0.0001;
  const minLon = Number(lon) - delta;
  const minLat = Number(lat) - delta;
  const maxLon = Number(lon) + delta;
  const maxLat = Number(lat) + delta;

  // 3×3 tile, we pakken pixel (1,1)
  const wmsUrl =
    'https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0' +
    '?service=WMS&version=1.1.1&request=GetFeatureInfo' +
    '&layers=soilarea&query_layers=soilarea' +
    '&styles=' +
    '&srs=EPSG:4326' +
    `&bbox=${minLon},${minLat},${maxLon},${maxLat}` +
    '&width=3&height=3' +
    '&format=image/png' +
    '&info_format=text/xml' +
    '&x=1&y=1';

  try {
    const resp = await fetch(wmsUrl);
    if (!resp.ok) throw new Error(`PDOK WMS returned status ${resp.status}`);
    const xmlText = await resp.text();

    // Zoek eerst de human‐friendly bodemsoortnaam
    const match =
      xmlText.match(/<[^:>]+:first_soilname>([^<]+)<\/[^:>]+:first_soilname>/i) ||
      xmlText.match(/<[^:>]+:normal_soilprofile_name>([^<]+)<\/[^:>]+:normal_soilprofile_name>/i) ||
      xmlText.match(/<LABEL[^>]*>([^<]+)<\/LABEL>/i);

    const grondsoort = match ? match[1] : 'Onbekend';

    // Bouw de JSON‐response, raw XML alleen bij debug=true
    const body = { grondsoort };
    if (debug === 'true') body.raw = xmlText;

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(body),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
