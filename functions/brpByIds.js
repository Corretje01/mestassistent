// netlify/functions/brpByIds.js
const BASE = 'https://service.pdok.nl/rvo/brpgewaspercelen/wfs/v1_0';
const TYPENAME = 'brpgewaspercelen:BrpGewas';
const SRS = 'EPSG:4326';

export async function handler(event) {
  try {
    const q = event.queryStringParameters || {};
    const ids = (q.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    const versies = (q.versies || '').split(',').map(s => s.trim()).filter(Boolean);
    const jaar = q.jaar ? String(q.jaar).trim() : null;

    if (!ids.length) {
      return reply(400, { error: 'ids param verplicht (comma-separated Sector IDs)' });
    }

    const chunkSize = 50;
    const features = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const cql = buildCql(slice, versies, jaar);
      const url = buildUrl(cql);
      const json = await fetchWithRetry(url);
      const feats = json?.features || [];
      features.push(...feats);
    }

    // Als er niets gevonden is en er stond een jaar-filter, probeer dan nog 1x zonder jaar.
    if (features.length === 0 && jaar) {
      for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const cql = buildCql(slice, versies, null);
        const url = buildUrl(cql);
        const json = await fetchWithRetry(url);
        const feats = json?.features || [];
        features.push(...feats);
      }
    }

    // Map op identificatie
    const byId = {};
    for (const f of features) {
      const id = f?.properties?.identificatie;
      if (id) byId[id] = f;
    }

    return reply(200, { features, byId });
  } catch (err) {
    console.error('[brpByIds] error:', err);
    return reply(502, { error: String(err?.message || err) });
  }
}

function buildCql(ids, versies, jaar) {
  const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
  let cql = `identificatie IN (${ids.map(esc).join(',')})`;
  if (versies && versies.length) cql += ` AND versie IN (${versies.map(esc).join(',')})`;
  if (jaar) cql += ` AND jaar=${encodeURIComponent(jaar)}`;
  return cql;
}

function buildUrl(cql) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: TYPENAME,
    outputFormat: 'application/json',
    srsName: SRS,
    CQL_FILTER: cql
  });
  return `${BASE}?${params.toString()}`;
}

async function fetchWithRetry(url, tries = 4) {
  let wait = 400;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (![429, 500, 502, 503, 504].includes(r.status)) {
      throw new Error(`HTTP ${r.status}`);
    }
    await new Promise(res => setTimeout(res, wait));
    wait *= 2;
  }
  throw new Error('Max retries op PDOK WFS');
}

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
