// rvoImport.js — Excel-first RVO import (XLSX/XLS/CSV) met robuuste kolomdetectie en peildatumfilter
// - Geen breaking changes: zet window.__RVO_RAW en dispatcht 'rvo:imported' met {count}
// - Excel is leidend voor ha/gewas; BRP-koppeling gebeurt elders via kaart.js

// SheetJS via ESM CDN
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';

/**
 * Initialiseer de RVO-import.
 * @param {string} inputSelector - CSS selector voor <input type="file"> (default '#rvo-file')
 * @param {Object} [opts]
 * @param {string} [opts.addButtonSelector] - optionele "Toevoegen"-knop (bv. '#rvo-add'); zo niet aanwezig, import start direct bij bestand kiezen
 * @param {Date|string} [opts.peildatum] - default 15-05-huidig jaar; mag Date of 'YYYY-MM-DD'
 * @param {string} [opts.eligibilityUrl] - pad naar eligibility-config (default '/data/rvoGebruik-eligibility.json')
 * @param {function} [opts.onProgress] - callback({stage, info})
 */
export function setupRVOImport(inputSelector = '#rvo-file', opts = {}) {
  const input = document.querySelector(inputSelector);
  if (!input) {
    console.warn('[rvoImport] Input niet gevonden voor selector:', inputSelector);
    return;
  }

  const state = {
    peildatum: resolvePeildatum(opts.peildatum),
    eligibilityUrl: opts.eligibilityUrl || '/data/rvoGebruik-eligibility.json',
    eligibilityMap: null,
    onProgress: typeof opts.onProgress === 'function' ? opts.onProgress : () => {},
  };

  // Lazy-load eligibility-config (mag ontbreken)
  fetch(state.eligibilityUrl, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : [])
    .then(json => state.eligibilityMap = Array.isArray(json) ? json : [])
    .catch(() => state.eligibilityMap = []);

  // Bestanden direct bij selecteren óf via "Toevoegen"-knop verwerken
  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!opts.addButtonSelector) {
      await handleFile(file, state);
      input.value = ''; // opnieuw kunnen kiezen
    }
  });

  if (opts.addButtonSelector) {
    const addBtn = document.querySelector(opts.addButtonSelector);
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const file = input?.files?.[0];
        if (!file) { alert('Kies eerst een RVO-bestand.'); return; }
        await handleFile(file, state);
        input.value = '';
      });
    } else {
      console.warn('[rvoImport] addButtonSelector niet gevonden:', opts.addButtonSelector);
    }
  }
}

/* ===========================
   Hoofdverwerking
=========================== */
async function handleFile(file, state) {
  try {
    console.time('[rvoImport] totale import');
    state.onProgress({ stage: 'reading', info: file.name });

    const rows = await readAny(file);
    if (!rows.length) {
      alert('Geen rijen gevonden in dit bestand. Controleer of de eerste sheet/regel data bevat.');
      return;
    }
    console.info('[rvoImport] rijen gelezen:', rows.length);

    state.onProgress({ stage: 'normalize', info: rows.length });
    const normalized = normalizeRows(rows, state.eligibilityMap);
    console.info('[rvoImport] genormaliseerd (voor peildatum):', normalized.length);

    state.onProgress({ stage: 'filter-peildatum', info: state.peildatum.toISOString().slice(0,10) });
    const filtered = filterByPeildatum(normalized, state.peildatum);
    console.info('[rvoImport] na peildatumfilter:', filtered.length);

    if (!filtered.length) {
      const headers = Object.keys(rows[0] || {});
      alert([
        'Kon geen percelen importeren na peildatumfilter.',
        '',
        'Mogelijke oorzaken:',
        '• Kolomnamen wijken af (Sector ID / Gewascode / Oppervlakte).',
        '• Alle rijen vallen buiten de peildatum.',
        '• Oppervlakte (ha) is 0 of leeg.',
        '',
        'Headers gevonden: ' + headers.join(', ')
      ].join('\n'));
      return;
    }

    // Markeer tijdelijk grasland
    for (const r of filtered) r.isTijdelijkGrasland = (Number(r.gewasCode) === 266);

    // Zet globale buffer en dispatch event
    window.__RVO_RAW = filtered;
    window.dispatchEvent(new CustomEvent('rvo:imported', { detail: { count: filtered.length } }));
    console.timeEnd('[rvoImport] totale import');

  } catch (err) {
    console.error('[rvoImport] Fout bij import:', err);
    alert('Kon het RVO-bestand niet verwerken. Controleer het formaat en probeer opnieuw.');
  }
}

/* ===========================
   Readers (XLSX/XLS/CSV) met AUTO-HEADER detectie
   - We lezen als 2D-rows (arrays), zoeken de juiste header-rij (bv. rij 6),
     en mappen daarna terug naar objecten met de echte kolomnamen.
=========================== */
async function readAny(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (ext === 'csv') {
    const text = await file.text();
    const rows2D = csvToRows2D(text);
    return rows2DToObjects(rows2D); // -> [{ "Oppervlakte (ha)": "...", "Gewas code": "...", ... }]
  }

  if (ext === 'xlsx' || ext === 'xls') {
    // Probeer modern pad (ArrayBuffer)
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const sh  = wb.Sheets[wb.SheetNames[0]];
      const rows2D = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
      return rows2DToObjects(rows2D);
    } catch (e1) {
      console.warn('[rvoImport] XLSX-array parse faalde, probeer binary fallback:', e1);
      // Fallback voor oude .xls (binary string)
      const binary = await readAsBinaryString(file);
      const wb  = XLSX.read(binary, { type: 'binary' });
      const sh  = wb.Sheets[wb.SheetNames[0]];
      const rows2D = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
      return rows2DToObjects(rows2D);
    }
  }

  throw new Error('Onbekend bestandsformaat: ' + ext);
}

function readAsBinaryString(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    // deprecated, maar nog prima voor oude .xls
    fr.readAsBinaryString(file);
  });
}

/* ---- 2D -> Objects met header-autodetect ---- */
function rows2DToObjects(rows2D) {
  if (!Array.isArray(rows2D) || rows2D.length === 0) return [];

  const headerRowIdx = detectHeaderRowIndex(rows2D);
  const headers = (rows2D[headerRowIdx] || []).map(h => String(h ?? '').trim());

  // Pak alle datarijen ná de header, en filter lege regels eruit
  const dataRows = rows2D.slice(headerRowIdx + 1)
    .filter(r => Array.isArray(r) && r.some(v => String(v ?? '').trim() !== ''));

  const out = [];
  for (const row of dataRows) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] ?? '';
    }
    out.push(obj);
  }
  return out;
}

/* ---- Header-rij vinden
   We scannen de eerste ~30 rijen en zoeken een rij die >=3 van deze
   kolommen bevat: Sector ID, Gewas code, Gewas omschrijving, Oppervlakte (ha), Gebruik omschrijving, Ingangsdatum.
---- */
function detectHeaderRowIndex(rows2D) {
  const mustHaveGroups = [
    VARS.sectorId,     // bv. ["sectorid","identificatie","sector id",...]
    VARS.gewasCode,    // bv. ["gewascode","gewas code",...]
    VARS.gewasNaam,    // bv. ["gewasomschrijving","gewas omschrijving",...]
    VARS.ha,           // bv. ["oppervlakte(ha)","oppervlakte (ha)",...]
    VARS.gebruikOms,   // bv. ["gebruik omschrijving",...]
    VARS.ingangsdatum  // bv. ["ingangsdatum","ingangs datum",...]
  ];

  const scanUntil = Math.min(30, rows2D.length);
  for (let i = 0; i < scanUntil; i++) {
    const cells = rows2D[i] || [];
    const canonCells = cells.map(canon);
    let hits = 0;

    for (const variants of mustHaveGroups) {
      if (!Array.isArray(variants)) continue;
      const found = variants.some(v => canonCells.includes(canon(v)));
      if (found) hits++;
    }

    // Genoeg signalen dat dit een header is (3+ kolommen matchen)
    if (hits >= 3) return i;
  }
  // Fallback: eerste rij
  return 0;
}

/* ===========================
   CSV → 2D rows (met delimiter-detectie)
=========================== */
function csvToRows2D(text) {
  const first = (text.split(/\r?\n/)[0] || '');
  const semi  = (first.match(/;/g) || []).length;
  const comma = (first.match(/,/g) || []).length;
  const delim = semi > comma ? ';' : ',';

  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  const out = [];
  for (const line of lines) out.push(splitCsvLine(line, delim));
  return out;
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = '', inQ = false;
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

/* ===========================
   Normalisatie & filters
=========================== */
function resolvePeildatum(d) {
  if (d instanceof Date && !isNaN(d)) return d;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [Y,M,D] = d.split('-').map(Number);
    return new Date(Y, M - 1, D);
  }
  const y = new Date().getFullYear();
  return new Date(y, 4, 15); // 15 mei
}

const VARS = {
  ha: ['oppervlakte(ha)','oppervlakte','opp(ha)','oppervlakte (ha)','opp','ha'],
  gewasCode: ['gewascode','gewas code','code gewas','code'],
  gewasNaam: ['gewasomschrijving','gewas omschrijving','gewas omschr.','gewas'],
  sectorId: ['sectorid','identificatie','sector id','brp id','brp identificatie','identificatie (sector)'],
  sectorVersie: ['sectorversie','sector versie','versie'],
  gebruikCode: ['gebruikcode','gebruik code'],
  gebruikOms: ['gebruikomschrijving','gebruik omschrijving','gebruik'],
  ingangsdatum: ['ingangsdatum','ingangs datum','ingang'],
  einddatum: ['einddatum','einddatum tot','eind'],
  melding: ['melding','signalering']
};

function canon(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s|\(|\)|\[|\]|\.|,|:|;|\/|\\/g, '');
}

function buildHeaderMap(sampleRow) {
  const map = {};
  for (const k of Object.keys(sampleRow || {})) {
    map[canon(k)] = k;
  }
  const out = {};
  for (const [target, variants] of Object.entries(VARS)) {
    out[target] = null;
    for (const v of variants) {
      const nk = canon(v);
      if (map[nk]) { out[target] = map[nk]; break; }
    }
  }
  return out;
}

function toFloatNL(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.')); // 1.234,56 → 1234.56
  return Number.isFinite(n) ? n : null;
}
function toInt(v) {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}
function parseDateSmart(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[-/\.](\d{1,2})[-/\.](\d{4})$/); // dd-mm-yyyy
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const ymd = s.match(/^(\d{4})[-/\.](\d{1,2})[-/\.](\d{1,2})$/); // yyyy-mm-dd
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function normalizeRows(rows, eligibilityList) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const headerMap = buildHeaderMap(rows[0]);

  const eligByOms = {};
  for (const e of (eligibilityList || [])) {
    if (e && e.omschrijving) {
      const k = canon(e.omschrijving);
      eligByOms[k] = (e.eligible === true ? 'true' :
                      e.eligible === false ? 'false' : 'unknown');
    }
  }

  const out = [];
  for (const raw of rows) {
    const get = key => headerMap[key] ? raw[headerMap[key]] : '';

    const sectorId  = String(get('sectorId') || '').trim();
    const ha        = toFloatNL(get('ha'));
    const gewasCode = toInt(get('gewasCode'));

    if (!sectorId) continue;          // zonder ID kunnen we niet koppelen
    if (!(ha > 0)) continue;          // 0/lege opp → overslaan
    if (gewasCode == null) continue;  // verplicht voor norm-lookup

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
      einddatum:    parseDateSmart(get('einddatum')),
      melding:      String(get('melding') || '').trim(),
      reviewNeeded
    });
  }
  return out;
}

function filterByPeildatum(list, peildatum) {
  return list.filter(r => {
    const startOk = !r.ingangsdatum || r.ingangsdatum <= peildatum;
    const endOk   = !r.einddatum   || r.einddatum   >= peildatum;
    return startOk && endOk;
  });
}
