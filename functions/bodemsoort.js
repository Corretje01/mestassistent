// netlify/functions/bodemsoort.js
export async function handler(event) {
  const { lon, lat } = event.queryStringParameters || {};
  if (!lon || !lat) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'lon en lat parameters zijn verplicht' }),
    };
  }

  // Maak een heel klein vierkant rond het klikpunt
  const delta = 0.0001;
  const minLon = Number(lon) - delta;
  const minLat = Number(lat) - delta;
  const maxLon = Number(lon) + delta;
  const maxLat = Number(lat) + delta;

  // Vraag een 3×3 tile om de middelste pixel (1,1)
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

    // Eerst soilarea_label, dan LABEL, dan fallback
    const match =
      xmlText.match(/<soilarea_label[^>]*>([^<]+)<\/soilarea_label>/i) ||
      xmlText.match(/<LABEL[^>]*>([^<]+)<\/LABEL>/i) ||
      xmlText.match(/<grondsoortnaam>([^<]+)<\/grondsoortnaam>/i);

    const grondsoort = match ? match[1] : 'Onbekend';

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ grondsoort }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
