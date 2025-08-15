// utils.js
export const USE_AI = false; // feature flag; schakel naar true voor AI OCR pipeline

// --- Validatie helpers ---
export function isValidPostcode(raw) {
  if (!raw) return false;
  const s = raw.toString().trim().toUpperCase();
  return /^[1-9][0-9]{3}\s?[A-Z]{2}$/.test(s);
}
export function formatPostcode(raw) {
  if (!raw) return '';
  const s = raw.toString().trim().toUpperCase().replace(/\s+/g,'');
  if (/^[1-9][0-9]{3}[A-Z]{2}$/.test(s)) return `${s.slice(0,4)} ${s.slice(4)}`;
  return raw.toString().trim().toUpperCase();
}
export function isPositiveNumberMax2Dec(val) {
  if (val === '' || val === null || val === undefined) return false;
  const str = String(val);
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return false;
  return parseFloat(str) > 0;
}
export function isFileAllowed(file) {
  if (!file) return false;
  const allowed = ['application/pdf','image/png','image/jpeg'];
  const okType = allowed.includes(file.type);
  const okSize = file.size <= 10 * 1024 * 1024; // 10MB
  return okType && okSize;
}
export function showInlineError(el, msg) {
  if (!el) return;
  el.setAttribute('data-error', msg || '');
  el.classList.add('input-error');
}
export function clearInlineError(el) {
  if (!el) return;
  el.removeAttribute('data-error');
  el.classList.remove('input-error');
}
export function disable(el, disabled=true) {
  if (el) el.disabled = !!disabled;
}
export function toast(msg, type='info') {
  // minimale toast; vervang door jouw eigen UI
  alert(`${type.toUpperCase()}: ${msg}`);
}

// --- Nutrient normalisatie helper ---
export function normalizeLabels(text) {
  // maak labels uniform (DS, N, P, K…) – simpele heuristiek
  const t = text.replace(/\r/g,'\n').replace(/\u00A0/g,' ');
  return t;
}

// --- EXTRACTIE (AI / pdf.js + Tesseract fallback) ---
/**
 * @returns {Promise<{DS_percent?:number,N_kg_per_ton?:number,P_kg_per_ton?:number,K_kg_per_ton?:number,OS_percent?:number,Biogaspotentieel_m3_per_ton?:number, raw?:any}>}
 */
export async function extractAnalysis(file) {
  // Placeholder pipeline structuur
  if (USE_AI) {
    // TODO: roep jouw AI endpoint aan (serverless function) die:
    // - PDF/image ocr’t
    // - labels herkent (DS, N, P, K, OS, biogas)
    // - units normaliseert (kg/ton, %, etc.)
    // return { DS_percent, N_kg_per_ton, ... , raw }
    return aiStub();
  } else {
    // Fallback: client-side. Voor PDF -> pdf.js render naar canvassen; voor images -> direct Tesseract.
    // i.v.m. performance en CSP kun je dit later naar edge function verplaatsen.
    // Hier leveren we een veilige "best effort": gebruiker/manager ziet "in behandeling" als niet alles gevonden is.
    return bestEffortRegexStub(file);
  }
}

// --- Stubs zodat je direct kunt testen (vervang later) ---
async function aiStub() {
  // simuleer succesvolle parse
  return {
    DS_percent: 28.5,
    N_kg_per_ton: 6.2,
    P_kg_per_ton: 2.1,
    K_kg_per_ton: 5.8,
    OS_percent: null,
    Biogaspotentieel_m3_per_ton: null,
    raw: { source: 'ai_stub' }
  };
}
async function bestEffortRegexStub(file) {
  // Simuleer dat niet alle velden altijd gevonden worden.
  return {
    DS_percent: 25,
    N_kg_per_ton: 5.5,
    P_kg_per_ton: 2.0,
    K_kg_per_ton: 5.0,
    raw: { source: 'regex_stub', fileName: file.name }
  };
}
