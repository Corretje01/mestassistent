// rvoImport.js — Excel-first RVO import (XLSX/CSV) met robuuste kolomdetectie
// Gebruik: import { setupRVOImport } from './rvoImport.js'; setupRVOImport('#rvo-file');
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';

export function setupRVOImport(inputSelector = '#rvo-file', opts = {}) {
  const input = document.querySelector(inputSelector);
  if (!input) {
    console.warn('[rvoImport] Input niet gevonden voor selector:', inputSelector);
    return;
  }

  const state = {
    eligibilityMap: null,
    peildatum: opts.peildatum instanceof Date ? opts.peildatum : defaultPeildatum(),
  };

  // Lazy-load eligibility-config
  fetch('/data/rvoGebruik-eligibility.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.resolve([]))
    .then(json => state.eligibilityMap = Array.isArray(json) ? json : [])
    .catch(() => state.eligibilityMap = []);

  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rows = await readAny(file);
      const normalized = normalizeRows(rows, state.eligibilityMap);

      // Filterlaag 1: peildatum
      const filtered = filterByPeildatum(normalized, state.peildatum);

      // NB: Filterlaag 2 (niet-bemestbare gewascodes) SLA JE OVER (zoals afgesproken)

      // Mark 266 tijdelijk grasland
      for (const r of filtered) {
        r.isTijdelijkGrasland = (Number(r.gewasCode) === 266);
      }

      // Zet op window en dispatch event
      window.__RVO_RAW = filtered;
      window.dispatchEvent(new CustomEvent('rvo:imported', {
        detail: { count: filtered.length }
      }));

    } catch (err) {
      console.error('[rvoImport] Fout bij import:', err);
      alert('Kon het RVO-bestand niet verwerken. Controleer het formaat en probeer opnieuw.');
    } finally {
      // laat her-upload toe
      input.value = '';
    }
  });
}

/* ----------------- Helpers ----------------- */

function defaultPeildatum() {
  const y = new Date().getFullYear();
  // 15 mei van huidig jaar
  return new Date(y, 4, 15);
}

async function readAny(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (['xlsx', 'xls'].includes(ext)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  }
  if (ext === 'csv') {
    const text = await file.text();
    return csvToObjects(text);
  }
  throw new Error('Onbekend bestandsformaat: ' + ext);
}

function csvToObjects(text) {
  // Delimiter-detectie: als ; vaker dan , voorkomt → ; gebruiken
  const firstLine = text.split(/\r?\n/)[0] || '';
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delim = semiCount > commaCount ? ';' : ',';

  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0], delim).map(h => h.trim());
  const normHeaders = headers.map(canon);

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? '';
    }
    out.push(row);
  }
  return out;
}

function splitCsvLine(line, delim) {
  // simpeler parser (aanhalingstekens, escaped quotes)
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function canon(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s|\(|\)|\[|\]|\.|,|:|;|\/|\\/g, '');
}

// Varianten → canonical target keys
const VARS = {
  ha: ['oppervlakte(ha)', 'oppervlakte', 'opp(ha)'],
  gewasCode: ['gewascode', 'gewas code'],
  gewasNaam: ['gewasomschrijving', 'gewas omschrijving'],
  sectorId: ['sectorid', 'identificatie'],
  sectorVersie: ['sectorversie'],
  gebruikCode: ['gebruikcode'],
  gebruikOms: ['gebruikomschrijving', 'gebruik omschrijving'],
  ingangsdatum: ['ingangsdatum', 'ingangs datum'],
  einddatum: ['einddatum', 'einddatumtot'],
  melding: ['melding'],
};

function buildHeaderMap(row) {
  const map = {};
  const keys = Object.keys(row);
  for (const k of keys) {
    map[canon(k)] = k;
  }
  const pick = (variants) => {
    for (const v of variants) {
      const nk = canon(v);
      if (map[nk]) return map[nk];
    }
    return null;
  };
  const res = {};
  for (const [target, variants] of Object.entries(VARS)) {
    res[target] = pick(variants);
  }
  return res;
}

function toFloatNL(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // verwijder thousands-dots, vervang komma door punt
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateSmart(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  // dd-mm-yyyy of yyyy-mm-dd
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function normalizeRows(rows, eligibilityMap) {
  if (!Array.isArray(rows)) return [];
  if (rows.length === 0) return [];
  const headerMap = buildHeaderMap(rows[0]);

  const eligByOms = {};
  for (const e of (eligibilityMap || [])) {
    if (e && e.omschrijving) {
      eligByOms[canon(e.omschrijving)] = (e.eligible === true ? 'true' :
        e.eligible === false ? 'false' : 'unknown');
    }
  }

  const out = [];
  for (const raw of rows) {
    const get = key => headerMap[key] ? raw[headerMap[key]] : '';
    const ha = toFloatNL(get('ha'));
    const gewasCode = toInt(get('gewasCode'));
    const sectorId = String(get('sectorId') || '').trim();

    if (!sectorId) continue;         // Edge: geen ID → overslaan
    if (!(ha > 0)) continue;         // Edge: geen/0 opp → overslaan
    if (gewasCode == null) continue; // Edge: geen gewascode → overslaan

    const gebruikOms = String(get('gebruikOms') || '').trim();
    const omsKey = canon(gebruikOms);
    const elig = eligByOms[omsKey]; // 'true'|'false'|'unknown'|undefined
    const reviewNeeded = (elig == null || elig === 'unknown');

    out.push({
      sectorId,
      sectorVersie: get('sectorVersie') ? String(get('sectorVersie')).trim() : undefined,
      gewasCode,
      gewasNaam: String(get('gewasNaam') || '').trim(),
      ha,
      gebruikCode: get('gebruikCode') ? String(get('gebruikCode')).trim() : undefined,
      gebruikOms,
      ingangsdatum: parseDateSmart(get('ingangsdatum')),
      einddatum: parseDateSmart(get('einddatum')),
      melding: String(get('melding') || '').trim(),
      reviewNeeded
    });
  }
  return out;
}

function filterByPeildatum(list, peildatum) {
  return list.filter(r => {
    const startOk = !r.ingangsdatum || r.ingangsdatum <= peildatum;
    const endOk = !r.einddatum || r.einddatum >= peildatum;
    return startOk && endOk;
  });
}
