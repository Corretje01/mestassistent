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

  // Bouw de WMS GetFeatureInfo URL voor BRO Bodemkaart (laag soilarea)
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
    const xmlText = await resp.text();

    // Pak de bodemsoort uit de XML (LABEL of label of SOILAREA_LABEL)
    const match =
      xmlText.match(/<LABEL[^>]*>([^<]+)<\/LABEL>/i) ||
      xmlText.match(/<soilarea_label[^>]*>([^<]+)<\/soilarea_label>/i) ||
      xmlText.match(/<Label[^>]*>([^<]+)<\/Label>/i);

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
};
