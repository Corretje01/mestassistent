// utils.js
// Gemeenschappelijke helpers: validatie, normalisatie, UI, en (optioneel) analyse-extractie.

export const USE_AI = false; // feature flag; schakel naar true voor AI OCR pipeline
export const MAX_FILE_SIZE_MB = 10;
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];
export const ALLOWED_EXT  = ['pdf', 'png', 'jpg', 'jpeg'];

/* =========================================
   POSTCODE (NL) – validatie & normalisatie
========================================= */

/** Loose check: staat zowel "1234AB" als "1234 AB" toe. */
export function isValidPostcode(raw) {
  if (!raw) return false;
  const s = String(raw).trim().toUpperCase();
  return /^[1-9][0-9]{3}\s?[A-Z]{2}$/.test(s);
}

/** Exacte check: vereist spatie: "1234 AB" (alleen dit formaat). */
export function isExactPostcodeFormat(raw) {
  if (!raw) return false;
  const s = String(raw).trim().toUpperCase();
  return /^[1-9][0-9]{3}\s[A-Z]{2}$/.test(s);
}

/** Format naar weergave: "1234 AB" (uppercase, enkele spatie). */
export function formatPostcode(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (/^[1-9][0-9]{3}[A-Z]{2}$/.test(s)) return `${s.slice(0, 4)} ${s.slice(4)}`;
  return String(raw).trim().toUpperCase();
}

/**
 * Live-normalisatie voor invoerveld: forceert "1234 " tijdens typen en daarna "1234 AB".
 * - Neemt alleen de eerste 4 cijfers en eerste 2 letters.
 * - Letters worden uppercase.
 * - Retourneert een PARTIËLE string tijdens invoer (bijv. "1234 ").
 */
export function normalizePostcodeLive(raw) {
  const text = String(raw ?? '');
  const digits  = (text.match(/\d/g) || []).join('').slice(0, 4);
  const letters = (text.match(/[A-Za-z]/g) || []).join('').toUpperCase().slice(0, 2);
  if (!digits) return '';
  if (digits.length < 4) return digits;             // nog cijfers aan het typen
  if (!letters) return `${digits} `;                // spatie na 4 cijfers
  return `${digits} ${letters}`;
}

/* =========================================
   NUMBERS – decimalen & integers
========================================= */

/** Parseert NL/EU decimalen ("12,3") naar Number (12.3); geeft NaN bij ongeldige input. */
export function parseDecimal(str) {
  if (str === null || str === undefined) return NaN;
  const s = String(str).trim().replace(',', '.');
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Accepteert "12", "12.3", "12,30"; max 2 decimalen; > 0. */
export function isPositiveNumberMax2Dec(val) {
  if (val === '' || val === null || val === undefined) return false;
  const str = String(val).trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(str)) return false;
  const n = parseDecimal(str);
  return Number.isFinite(n) && n > 0;
}

/** 0 of meer, met max 2 decimalen. */
export function isNonNegativeNumberMax2Dec(val) {
  if (val === '' || val === null || val === undefined) return false;
  const str = String(val).trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(str)) return false;
  const n = parseDecimal(str);
  return Number.isFinite(n) && n >= 0;
}

/** Optioneel negatief (±), max 2 decimalen. Voor vraagprijs met teken. */
export function isSignedNumberMax2Dec(val) {
  if (val === '' || val === null || val === undefined) return false;
  const str = String(val).trim().replace(',', '.');
  return /^-?\d+(?:\.\d{1,2})?$/.test(str);
}

/** Parse zonder teken (max 2 dec) → Number of null. */
export function parsePrice2dec(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.');
  const m = s.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1] + (m[2] ? '.' + m[2] : ''));
}

/** Parse met optioneel teken (max 2 dec) → Number of null. */
export function parseSignedPrice2dec(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Strict integer (alleen cijfers) → Number of null. */
export function parseIntStrict(str) {
  if (str == null) return null;
  const n = parseInt(String(str).replace(/\D/g, ''), 10);
  return Number.isInteger(n) ? n : null;
}

/** Houd alleen cijfers over in een string (voor input-masking). */
export function sanitizeIntegerString(str) {
  return String(str ?? '').replace(/\D/g, '');
}

/** Format getal naar max 2 decimalen (string). */
export function formatNumber2dec(n) {
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2).replace(/\.00$/, '');
}

/* =========================================
   BESTANDEN – validatie
========================================= */

export function getFileExt(filename) {
  if (!filename) return '';
  const parts = String(filename).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function isFileAllowed(file) {
  if (!file) return false;
  const ext  = getFileExt(file.name);
  const sizeOk = typeof file.size === 'number' && file.size <= MAX_FILE_SIZE_MB * 1024 * 1024;

  // MIME fallback: sommige browsers geven application/octet-stream.
  const mime = file.type || '';
  const mimeOk = ALLOWED_MIME.includes(mime)
    || (/^image\//.test(mime) && ['png', 'jpg', 'jpeg'].includes(ext))
    || (mime === 'application/octet-stream' && ext === 'pdf');

  const extOk  = ALLOWED_EXT.includes(ext);

  return sizeOk && mimeOk && extOk;
}

/* =========================================
   UI – inline errors & toasts
========================================= */

export function showInlineError(el, msg) {
  if (!el) return;
  el.setAttribute('data-error', msg || '');
  el.classList.add('input-error');
  el.setAttribute('aria-invalid', 'true');
  if (msg) el.setAttribute('title', msg); // minimale SR hint
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
 * Toast:
 * 1) dispatch event (voor eigen UI),
 * 2) aria-live,
 * 3) fallback alert().
 */
export function toast(msg, type = 'info') {
  try {
    document.dispatchEvent(new CustomEvent('app:toast', { detail: { message: msg, type } }));
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
    if (!document.body.classList.contains('has-toast-ui')) {
      alert(`${type.toUpperCase()}: ${msg}`);
    }
  } catch {
    alert(`${type.toUpperCase()}: ${msg}`);
  }
}

/* =========================================
   TEKST – normalisatie
========================================= */

export function normalizeLabels(text) {
  if (!text) return '';
  return String(text)
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/* =========================================
   ANALYSE – OCR/AI (stub & fallback)
========================================= */

/**
 * @returns {Promise<{DS_percent?:number,N_kg_per_ton?:number,P_kg_per_ton?:number,K_kg_per_ton?:number,OS_percent?:number,Biogaspotentieel_m3_per_ton?:number, raw?:any}>}
 */
export async function extractAnalysis(file) {
  if (USE_AI) {
    // TODO: roep je AI endpoint (edge function) aan die:
    // - PDF/image OCR doet
    // - labels DS, N, P, K, OS, biogas herkent
    // - units normaliseert (kg/ton, %, etc.)
    return aiStub();
  } else {
    // Fallback: client-side (pdf.js + Tesseract) -> hier vervangen door demo-stub
    return bestEffortRegexStub(file);
  }
}

// --- Stubs (vervang later door echte pipeline) ---
async function aiStub() {
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
  return {
    DS_percent: 25,
    N_kg_per_ton: 5.5,
    P_kg_per_ton: 2.0,
    K_kg_per_ton: 5.0,
    raw: { source: 'regex_stub', fileName: file?.name || null }
  };
}
