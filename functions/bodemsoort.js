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

  const bbox = `${lat},${lon},${lat},${lon}`;
  const wmsUrl =
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
    '&info_format=text/xml' +
    '&i=0&j=0';

  try {
    const resp = await fetch(wmsUrl);
    if (!resp.ok) throw new Error(`PDOK WMS returned status ${resp.status}`);
    const xmlText = await resp.text();

    // Probeer alvast een paar varianten
    const match =
      xmlText.match(/<LABEL[^>]*>([^<]+)<\/LABEL>/i) ||
      xmlText.match(/<soilarea_label[^>]*>([^<]+)<\/soilarea_label>/i) ||
      xmlText.match(/<Label[^>]*>([^<]+)<\/Label>/i);

    const grondsoort = match ? match[1] : 'Onbekend';

    // Stuur zowel de vage grondsoort als de ruwe XML terug
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
};
