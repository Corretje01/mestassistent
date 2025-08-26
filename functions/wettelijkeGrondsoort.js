// netlify/functions/wettelijkeGrondsoort.js
// Queryt de "wettelijke grondsoortenkaart" (ArcGIS FeatureServer/MapServer) met een punt.
// Verwacht ?lon=...&lat=... (EPSG:4326). Antwoord: { bodemsoortNaam: "zand|klei|veen|löss" }

const SERVICE_URL = process.env.LEGAL_SOIL_URL
  // Voorbeeld: FeatureServer layer 0 (invullen!)
  // "https://services.arcgis.com/<orgId>/ArcGIS/rest/services/Grondsoortenkaart/FeatureServer/0/query"
  || "";

export async function handler(event) {
  try {
    const { lon, lat } = event.queryStringParameters || {};
    const x = Number(lon), y = Number(lat);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return bad(400, "lon/lat verplicht");

    if (!SERVICE_URL) return bad(500, "LEGAL_SOIL_URL niet geconfigureerd");

    // ArcGIS FeatureServer "query" met point
    const params = new URLSearchParams({
      f: "json",
      geometry: JSON.stringify({ x, y, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      returnGeometry: "false",
      outFields: "*",
      resultRecordCount: "1"
    });

    const url = `${SERVICE_URL}?${params.toString()}`;
    const json = await fetchJsonWithRetry(url, { timeoutMs: 8000, retries: 2 });

    const feat = json?.features?.[0];
    if (!feat?.attributes) return ok({ bodemsoortNaam: "" });

    // Bepaal attribuutnaam met de wettelijke categorie (verschilt per service)
    // Probeer gangbare velden:
    const attrs = feat.attributes;
    let value = attrs.grondsoort || attrs.WETTELIJK || attrs.wettelijke || attrs.Wettelijke || attrs.klasse || "";

    // Normaliseren naar zand/klei/veen/löss
    value = String(value || "").toLowerCase();
    if (value.includes("zand")) value = "zand";
    else if (value.includes("klei") || value.includes("zavel")) value = "klei";
    else if (value.includes("veen")) value = "veen";
    else if (value.includes("löss") || value.includes("loess") || value.includes("loss")) value = "löss";
    else value = ""; // onbekend

    return ok({ bodemsoortNaam: value, bron: "wettelijke-grondsoortenkaart" });
  } catch (e) {
    return bad(502, e.message || "Fout");
  }
}

async function fetchJsonWithRetry(url, { timeoutMs = 8000, retries = 2 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      last = e;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw last || new Error("Onbekende fout");
}

const ok = (body) => ({ statusCode: 200, headers: cors(), body: JSON.stringify(body) });
const bad = (code, msg) => ({ statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) });
const cors = () => ({ "Access-Control-Allow-Origin": "*" });
