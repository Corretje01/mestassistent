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

  // Bouw de CQL_FILTER-string zonder URLSearchParams,
  // zodat we zeker weten dat spaties als %20 (en niet +) worden gecodeerd.
  const cql       = `CONTAINS(geometry,POINT(${lon} ${lat}))`;
  const filterEnc = encodeURIComponent(cql);

  const wfsBase = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
  const url = 
    `${wfsBase}` +
    `?service=WFS` +
    `&version=2.0.0` +
    `&request=GetFeature` +
    `&typeNames=kadastralekaart:Perceel` +
    `&outputFormat=application/json` +
    `&srsName=EPSG:4326` +
    `&count=1` +
    `&CQL_FILTER=${filterEnc}`;

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
