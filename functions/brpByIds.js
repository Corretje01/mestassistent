// netlify/functions/brpByIds.js
export async function handler(event) {
  try {
    const params = event.queryStringParameters || {};
    const idsStr = params.ids || '';
    const jaar = params.jaar ? String(params.jaar).trim() : null;
    const versiesStr = params.versies ? String(params.versies).trim() : null;

    const ids = idsStr.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return ok({ features: [], byId: {} });
    }

    const versies = versiesStr ? versiesStr.split(',').map(s => s.trim()).filter(Boolean) : null;
    const chunks = chunk(ids, 50);
    const features = [];

    for (const group of chunks) {
      const cqlParts = [];
      // identificatie IN (...)
      const quoted = group.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
      cqlParts.push(`identificatie IN (${quoted})`);
      if (jaar) cqlParts.push(`jaar = ${encodeURIComponent(jaar)}`);
      if (versies && versies.length) {
        const qv = versies.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
        cqlParts.push(`versie IN (${qv})`);
      }
      const CQL_FILTER = cqlParts.join(' AND ');

      const url = makeWfsUrl({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: 'brpgewaspercelen:BrpGewas',
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        CQL_FILTER
      });

      const gj = await fetchWithRetry(url, { timeoutMs: 10_000, retries: 3, backoffMs: 600 });
      if (gj?.features?.length) features.push(...gj.features);
    }

    const byId = {};
    for (const f of features) {
      const id = f?.properties?.identificatie;
      if (id) byId[id] = f;
    }
    return ok({ features, byId });

  } catch (err) {
    return fail(err.message || String(err));
  }
}

function makeWfsUrl(params) {
  const base = 'https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0';
  const sp = new URLSearchParams(params);
  return `${base}?${sp.toString()}`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function fetchWithRetry(url, { timeoutMs = 10000, retries = 2, backoffMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        if ([429, 502, 503, 504].includes(res.status)) throw new Error('HTTP ' + res.status);
        // Niet-retrybare fout
        throw new Error('HTTP ' + res.status);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await sleep(backoffMs * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw lastErr || new Error('Onbekende fetch-fout');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  };
}
function fail(msg) {
  return {
    statusCode: 502,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: msg })
  };
}
