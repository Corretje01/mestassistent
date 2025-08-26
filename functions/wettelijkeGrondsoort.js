// netlify/functions/wettelijkeGrondsoort.js
// Haalt de wettelijke grondsoort (zand/klei/veen/löss) op via ArcGIS FeatureServer query.
// Config: LEGAL_SOIL_URL = https://.../FeatureServer/0/query

const SERVICE_URL = process.env.LEGAL_SOIL_URL || "";

export async function handler(event) {
  try {
    const { lon, lat } = event.queryStringParameters || {};
    const x = Number(lon), y = Number(lat);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return resp(400, { error: "lon/lat verplicht" });
    }
    if (!SERVICE_URL) {
      return resp(500, { error: "LEGAL_SOIL_URL niet geconfigureerd" });
    }

    const params = new URLSearchParams({
      f: "json",
      geometry: JSON.stringify({ x, y, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      returnGeometry: "false",
      outFields: "HOOFDGRS",
      resultRecordCount: "1"
    });

    const url = `${SERVICE_URL}?${params.toString()}`;
    const data = await fetchJsonWithRetry(url, { timeoutMs: 8000, retries: 2 });

    const raw = String(data?.features?.[0]?.attributes?.HOOFDGRS || "").toUpperCase(); // KLEI|ZAND|VEEN|LOSS
    const cat =
      raw === "ZAND" ? "zand" :
      raw === "KLEI" ? "klei" :
      raw === "VEEN" ? "veen" :
      raw === "LOSS" ? "löss" : "";

    return resp(200, { bodemsoortNaam: cat, bron: "wettelijke-grondsoortenkaart" });
  } catch (e) {
    return resp(502, { error: e.message || "Fout" });
  }
}

async function fetchJsonWithRetry(url, { timeoutMs = 8000, retries = 2 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      last = e;
      if (i < retries) await new Promise(res => setTimeout(res, 500 * (2 ** i)));
    }
  }
  throw last || new Error("Onbekende fout");
}

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body)
  };
}
