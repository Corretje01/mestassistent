// utils.js
export const USE_AI = false; // feature flag; schakel naar true voor AI OCR pipeline
export const MAX_FILE_SIZE_MB = 10;
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];
export const ALLOWED_EXT  = ['pdf', 'png', 'jpg', 'jpeg'];

// --- Validatie helpers ---
export function isValidPostcode(raw) {
  if (!raw) return false;
  const s = String(raw).trim().toUpperCase();
  return /^[1-9][0-9]{3}\s?[A-Z]{2}$/.test(s);
}

export function formatPostcode(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (/^[1-9][0-9]{3}[A-Z]{2}$/.test(s)) return `${s.slice(0, 4)} ${s.slice(4)}`;
  return String(raw).trim().toUpperCase();
}

/** Accepteert "12", "12.3", "12,30"; max 2 decimalen; > 0 */
export function isPositiveNumberMax2Dec(val) {
  if (val === '' || val === null || val === undefined) return false;
  const str = String(val).trim();
  // Sta , of . toe
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(str)) return false;
  const n = parseDecimal(str);
  return Number.isFinite(n) && n > 0;
}

/** Parseert NL/EU decimalen ("12,3") naar Number (12.3); geeft NaN bij ongeldige input */
export function parseDecimal(str) {
  if (str === null || str === undefined) return NaN;
  const s = String(str).trim().replace(',', '.');
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function getFileExt(filename) {
  if (!filename) return '';
  const parts = String(filename).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function isFileAllowed(file) {
  if (!file) return false;
  const ext  = getFileExt(file.name);
  const sizeOk = typeof file.size === 'number' && file.size <= MAX_FILE_SIZE_MB * 1024 * 1024;

  // MIME kan bij sommige browsers "application/octet-stream" zijn; val dan terug op extensie
  const mime = file.type || '';
  const mimeOk = ALLOWED_MIME.includes(mime)
    || (/^image\//.test(mime) && ['png', 'jpg', 'jpeg'].includes(ext))
    || (mime === 'application/octet-stream' && ext === 'pdf');

  const extOk  = ALLOWED_EXT.includes(ext);

  return sizeOk && mimeOk && extOk;
}

export function showInlineError(el, msg) {
  if (!el) return;
  el.setAttribute('data-error', msg || '');
  el.classList.add('input-error');
  el.setAttribute('aria-invalid', 'true');
  // hint voor SR's zonder extra markup
  if (msg) el.setAttribute('title', msg);
}

export function clearInlineError(el) {
  if (!el) return;
  el.removeAttribute('data-error');
  el.classList.remove('input-error');
  el.removeAttribute('aria-invalid');
  el.removeAttribute('title');
}

export function disable(el, disabled = true) {
  if (el) el.disabled = !!disabled;
}

/**
 * Toont een toast. Werkt als:
 * 1) custom event (voor eigen UI-listener),
 * 2) aria-live region #toast-live,
 * 3) fallback: alert().
 */
export function toast(msg, type = 'info') {
  try {
    // 1) Custom event (je UI kan hierop subscriben om eigen toasts te renderen)
    document.dispatchEvent(new CustomEvent('app:toast', { detail: { message: msg, type } }));
    // 2) aria-live area
    let live = document.getElementById('toast-live');
    if (!live) {
      live = document.createElement('div');
      live.id = 'toast-live';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      live.style.position = 'fixed';
      live.style.left = '-9999px';
      live.style.top = '0';
      document.body.appendChild(live);
    }
    live.textContent = `${type.toUpperCase()}: ${msg}`;
    // 3) minimale visuele fallback
    if (!document.body.classList.contains('has-toast-ui')) {
      // Als je een eigen toast-UI hebt, zet class 'has-toast-ui' op body en deze alert wordt niet gebruikt.
      alert(`${type.toUpperCase()}: ${msg}`);
    }
  } catch {
    alert(`${type.toUpperCase()}: ${msg}`);
  }
}

// --- Tekst normalisatie helper ---
export function normalizeLabels(text) {
  if (!text) return '';
  // Maak labels uniform (DS, N, P, K…) – simpele heuristiek + non-breaking spaces fix
  return String(text)
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
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
    raw: { source: 'regex_stub', fileName: file?.name || null }
  };
}
