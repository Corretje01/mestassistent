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

  const wmsUrl =
    'https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0' +
    '?service=WMS&version=1.1.1&request=GetFeatureInfo' +
    '&layers=bodemvlakken&query_layers=bodemvlakken' +
    '&styles=&srs=EPSG:4326' +
    `&bbox=${lon},${lat},${lon},${lat}` +
    '&width=1&height=1&format=image/png' +
    '&info_format=text/xml' +
    '&x=0&y=0';

  try {
    const resp = await fetch(wmsUrl);
    if (!resp.ok) throw new Error(`PDOK WMS returned ${resp.status}`);
    const xmlText = await resp.text();

    // Probeer alvast een paar tags
    const match =
      xmlText.match(/<grondsoortnaam>([^<]+)<\/grondsoortnaam>/i) ||
      xmlText.match(/<LABEL[^>]*>([^<]+)<\/LABEL>/i) ||
      xmlText.match(/<Label[^>]*>([^<]+)<\/Label>/i);

    const grondsoort = match ? match[1] : 'Onbekend';

    // Stuur ook raw xml voor debugging
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ grondsoort, raw: xmlText }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
