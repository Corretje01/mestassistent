// netlify/functions/wettelijkeGrondsoort.js
// Haalt de wettelijke grondsoort (zand/klei/veen/löss) op via een ArcGIS FeatureServer/MapServer 'query' endpoint.
// Config: LEGAL_SOIL_URL = https://.../FeatureServer/0/query   (of MapServer/0/query)
// Fallback: DEFAULT_SERVICE_URL hieronder (handig als de env-var nog niet is gezet).

// Vast ingestelde service-URL (env-var niet meer nodig)
const SERVICE_URL =
  "https://services.arcgis.com/kE0BiyvJHb5SwQv7/arcgis/rest/services/Grondsoortenkaart/FeatureServer/0/query";

// 2) Public handler
export async function handler(event) {
  try {
    const qs = event.queryStringParameters || {};
    let x = parseFloat(qs.lon);
    let y = parseFloat(qs.lat);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return resp(400, { error: "lon/lat verplicht", hint: { lon: qs.lon, lat: qs.lat } });
    }

    // Spatial reference bepalen:
    // - default 4326 (WGS84, lon/lat)
    // - ?sr=28992 ondersteunt RD New direct
    // - auto-detect: waarden in RD-range → 28992
    let inSR = 4326;
    if (qs.sr) {
      const sr = parseInt(qs.sr, 10);
      if (Number.isFinite(sr)) inSR = sr;
    } else {
      // simpele RD-detectie (geldig bereik RD: x≈0–300k, y≈300k–650k)
      if (x > 1000 && x < 300000 && y > 300000 && y < 650000) inSR = 28992;
    }

    // ArcGIS query parameters
    const params = new URLSearchParams({
      f: "json",
      geometry: JSON.stringify({ x, y, spatialReference: { wkid: inSR } }),
      geometryType: "esriGeometryPoint",
      inSR: String(inSR),
      spatialRel: "esriSpatialRelIntersects",
      returnGeometry: "false",
      // outFields: vraag meerdere opties op zodat we minder afhankelijk zijn van exact veldlabel
      outFields: "HOOFDGRS,GS_CODE,WET_GRSRT,GROND,GRONDTYPE,KLASSE,CATEGORIE,CODE",
      resultRecordCount: "1",
      // maxRecordCountFactor kan helpen bij services met limieten (hier meestal niet nodig)
      // maxRecordCountFactor: "1"
    });

    const url = `${SERVICE_URL}?${params.toString()}`;
    const data = await fetchJsonWithRetry(url, { timeoutMs: 8000, retries: 2 });

    const feat = data?.features?.[0];
    const attrs = feat?.attributes || {};

    // Mogelijke velden die de wettelijke categorie bevatten:
    // - HOOFDGRS: "KLEI|ZAND|VEEN|LOSS"  (laag die jij gebruikt)
    // - GS_CODE / WET_GRSRT / CODE: codes of tekst
    // - KLASSE / CATEGORIE / GROND / GRONDTYPE: tekstvarianten
    const raw =
      pickFirstNonEmpty([
        attrs.HOOFDGRS,
        attrs.GS_CODE,
        attrs.WET_GRSRT,
        attrs.CODE,
        attrs.KLASSE,
        attrs.CATEGORIE,
        attrs.GROND,
        attrs.GRONDTYPE
      ]) || "";

    const bodemsoortNaam = normalizeLegalSoil(raw);

    // Altijd 200 teruggeven met resultaat (leeg = onbekend) → frontend kan doorselecteren
    return resp(200, {
      bodemsoortNaam,          // "zand" | "klei" | "veen" | "löss" | ""
      raw: String(raw || ""),  // ter debugging
      srUsed: inSR,            // 4326 of 28992
      wkid: data?.spatialReference?.wkid, // vaak 28992 voor deze laag
      bron: "wettelijke-grondsoortenkaart"
    });
  } catch (e) {
    return resp(502, { error: e?.message || "Onbekende fout", service: SERVICE_URL });
  }
}

/* ----------------- Helpers ----------------- */

function pickFirstNonEmpty(list) {
  for (const v of list) {
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}

function normalizeLegalSoil(value) {
  const s = String(value || "").trim();

  // Eerst directe codes mappen (bovenkast/no-diacritics)
  const u = s.toUpperCase();
  if (u === "Z" || u === "ZAND") return "zand";
  if (u === "K" || u === "KLEI") return "klei";
  if (u === "V" || u === "VEEN") return "veen";
  if (u === "L" || u === "LOSS" || u === "LÖSS" || u === "LOESS") return "löss";

  // Dan tekstuele varianten (case-insensitive), met diacritics-normalisatie
  const t = s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (t.includes("zand")) return "zand";
  if (t.includes("klei") || t.includes("zavel")) return "klei"; // wettelijk zit zavel onder klei
  if (t.includes("veen")) return "veen";
  if (t.includes("loss") || t.includes("loess") || t.includes("lss")) return "löss";

  return ""; // onbekend
}

async function fetchJsonWithRetry(url, { timeoutMs = 8000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "mestassistent/1.0" } });
      clearTimeout(t);

      if (!res.ok) {
        // Probeer debug-info uit de body te halen
        const body = await safeText(res);
        throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
      }
      // ArcGIS geeft altijd JSON terug
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await sleep(500 * Math.pow(2, attempt)); // 500ms, 1000ms backoff
        continue;
      }
    }
  }
  throw lastErr || new Error("Fetch faalde");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function resp(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}
