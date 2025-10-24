// pages/plaatsingsruimte/kmzImport.js
// KMZ-only import voor “Mijn Percelen”
// - Leest .kmz (KML in ZIP), haalt velden uit <description>-tabel
// - Normaliseert naar rows (sectorId, gewasCode, gewasNaam, ha, geldigheid, gebruik, melding)
// - Zet geometry index: window.__KMZ_GEO = { byId: { sectorId: Feature } }
// - Zet data-rows:      window.__KMZ_RAW = [ ... ]
// - Dispatcht 'rvo:imported' zodat plaatsingsruimte.js percelen tekent

import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

export function setupKMZImport(
  inputSelector = '#kmz-file',
  addButtonSelector = '#kmz-add',
  opts = {}
) {
  const $input = document.querySelector(inputSelector);
  const $btn   = document.querySelector(addButtonSelector);
  if (!$input || !$btn) {
    console.warn('[kmzImport] input of button niet gevonden', { inputSelector, addButtonSelector });
    return;
  }

  let kmzFile = null;

  $input.addEventListener('change', e => {
    const f = e.target.files?.[0] || null;
    if (f && !/\.kmz$/i.test(f.name)) {
      alert('Kies een .kmz bestand (export uit Mijn Percelen).');
      e.target.value = '';
      kmzFile = null;
      return;
    }
    kmzFile = f || null;
  });

  $btn.addEventListener('click', async () => {
    if (!kmzFile) { alert('Kies eerst een .kmz bestand.'); return; }

    setBusy(true, 'Bestand lezen…');
    try {
      const rowsAndGeo = await parseKMZ(kmzFile, {
        peildatum: resolvePeildatum(opts.peildatum),
        eligibilityUrl: opts.eligibilityUrl || './core/domain/data/rvoGebruik-eligibility.json',
      });

      if (!rowsAndGeo || !rowsAndGeo.rows?.length) {
        alert('Geen geldige percelen gevonden (na peildatum/validatie).');
        return;
      }

      window.__KMZ_RAW = rowsAndGeo.rows;
      window.__KMZ_GEO = rowsAndGeo.geo;

      window.dispatchEvent(new CustomEvent('rvo:imported', {
        detail: { count: rowsAndGeo.rows.length, via: 'kmz' }
      }));
    } catch (e) {
      console.error('[kmzImport] parse fout:', e);
      alert(e?.message?.includes('Geen .kml')
        ? 'Het KMZ-bestand bevat geen .kml. Controleer of je de juiste export hebt gedownload.'
        : 'Kon KMZ niet verwerken. Controleer het bestand en probeer opnieuw.'
      );
    } finally {
      setBusy(false);
    }
  });

  function setBusy(on, text) {
    try {
      if (on) {
        $btn.disabled = true;
        $btn.setAttribute('aria-busy', 'true');
        const label = document.getElementById('kmz-label');
        if (label && text) label.textContent = text;
      } else {
        $btn.disabled = false;
        $btn.removeAttribute('aria-busy');
        const label = document.getElementById('kmz-label');
        if (label) label.textContent = 'Koppel percelen';
      }
    } catch {}
  }
}

/* ---------------- Helpers ---------------- */
function resolvePeildatum(d) {
  if (d instanceof Date && !isNaN(d)) return d;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [Y,M,D] = d.split('-').map(Number);
    return new Date(Y, M-1, D);
  }
  const y = new Date().getFullYear();
  return new Date(y, 4, 15); // 15 mei
}

async function parseKMZ(file, { peildatum, eligibilityUrl }) {
  const eligList = await fetchEligibility(eligibilityUrl);

  const zip = await JSZip.loadAsync(file);
  let kmlEntry = null;
  zip.forEach((path, entry) => {
    if (!entry.dir && path.toLowerCase().endsWith('.kml') && !kmlEntry) kmlEntry = entry;
  });
  if (!kmlEntry) throw new Error('Geen .kml in KMZ gevonden');

  const kmlText = await kmlEntry.async('text');
  const kdoc = new DOMParser().parseFromString(kmlText, 'application/xml');
  const placemarks = Array.from(kdoc.getElementsByTagName('Placemark'));
  if (!placemarks.length) throw new Error('KMZ bevat geen perceel-polygonen (Placemark).');

  const byId = {};
  const rawRows = [];

  for (const pm of placemarks) {
    const props = extractPropsFromPlacemark(pm);
    const geo   = kmlPolygonsToGeoJSON(pm);

    const sectorId = String(
      props['Sector ID'] || props['Identificatie'] || props['SectorID'] || props['ID'] || ''
    ).trim();
    if (!sectorId) continue;
    if (!geo || geo.length === 0) continue;

    const geometry = geo.length === 1
      ? geo[0]
      : { type: 'MultiPolygon', coordinates: geo.map(g => g.coordinates) };

    byId[sectorId] = {
      type: 'Feature',
      geometry,
      properties: {
        identificatie: sectorId,
        versie: String(props['Sector versie'] || props['Versie'] || '').trim(),
        weergavenaam: sectorId
      }
    };

    const row = kmzPropsToRow(props);
    row.sectorId = sectorId;
    rawRows.push(row);
  }

  // eligibility & peildatum
  const eligByOms = indexEligibility(eligList);
  for (const r of rawRows) {
    r.reviewNeeded = reviewFlag(eligByOms, r.gebruikOms);
    r.isTijdelijkGrasland = (Number(r.gewasCode) === 266);
  }
  const filtered = rawRows.filter(r => {
    const startOk = !r.ingangsdatum || r.ingangsdatum <= peildatum;
    const endOk   = !r.einddatum   || r.einddatum   >= peildatum;
    const hasMin  = r.sectorId && (r.ha > 0) && (r.gewasCode != null);
    return hasMin && startOk && endOk;
  });

  return { rows: filtered, geo: { byId, count: Object.keys(byId).length } };
}

async function fetchEligibility(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const j = r.ok ? await r.json() : [];
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}
function indexEligibility(list) {
  const idx = {};
  for (const e of (list||[])) {
    if (e?.omschrijving) {
      const key = canon(String(e.omschrijving));
      idx[key] = (e.eligible === true ? 'true' : e.eligible === false ? 'false' : 'unknown');
    }
  }
  return idx;
}
function reviewFlag(idx, oms) {
  const key = canon(String(oms||''));
  const v = idx[key];
  return (v == null || v === 'unknown');
}

/* ---- KML helpers ---- */
function textContent(el, sel) {
  const n = el.querySelector(sel);
  return n ? (n.textContent || '').trim() : '';
}
function extractPropsFromPlacemark(pm) {
  const props = {};
  const desc = textContent(pm, 'description');
  if (desc) {
    try {
      const html = new DOMParser().parseFromString(desc, 'text/html');
      const rows = html.querySelectorAll('tr');
      for (const tr of rows) {
        const th = tr.querySelector('th,td');
        const td = th ? th.nextElementSibling : null;
        const k = (th?.textContent || '').trim();
        const v = (td?.textContent || '').trim();
        if (k) props[k] = v;
      }
    } catch {}
  }
  const name = textContent(pm, 'name');
  if (name && !props['Naam']) props['Naam'] = name;
  return props;
}
function kmlPolygonsToGeoJSON(pm) {
  const polys = [];
  const polyEls = pm.querySelectorAll('Polygon');
  for (const poly of polyEls) {
    const outer = poly.querySelector('outerBoundaryIs coordinates');
    if (!outer) continue;
    const outerCoords = parseKmlCoords(outer.textContent);
    const innerRings = [];
    const inners = poly.querySelectorAll('innerBoundaryIs coordinates');
    for (const inn of inners) innerRings.push(parseKmlCoords(inn.textContent));
    polys.push({ type:'Polygon', coordinates:[outerCoords, ...innerRings] });
  }
  return polys;
}
function parseKmlCoords(text) {
  const coords = [];
  const parts = String(text||'').trim().split(/\s+/);
  for (const p of parts) {
    const [lon,lat] = p.split(',').map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) coords.push([lon,lat]);
  }
  if (coords.length) {
    const [x0,y0] = coords[0];
    const [xn,yn] = coords[coords.length-1];
    if (x0 !== xn || y0 !== yn) coords.push(coords[0]); // sluit ring
  }
  return coords;
}

/* ---- Normalisatie uit props-tabel ---- */
function kmzPropsToRow(p) {
  const gewasCode = toInt(p['Gewascode'] || p['Gewas code']);
  const gewasNaam = String(p['Gewas'] || p['Gewas omschrijving'] || '').trim();
  const ha        = parseHa(String(p['Oppervlakte'] || p['Oppervlakte (ha)'] || '').trim());
  const gebruikOms= String(p['Gebruikstitel'] || p['Gebruik omschrijving'] || '').trim();
  const melding   = String(p['Fouten'] || p['Melding'] || '').trim(); // "Ja"/"Nee"
  const ingangs   = parseDateSmart(p['Begingeldigheid'] || p['Ingangsdatum']);
  const eind      = parseDateSmart(p['Eindgeldigheid'] || p['Einddatum']);
  const versie    = String(p['Sector versie'] || p['Versie'] || '').trim();

  return {
    sectorId: '',
    sectorVersie: versie || undefined,
    gewasCode,
    gewasNaam,
    ha,
    gebruikCode: undefined,
    gebruikOms,
    ingangsdatum: ingangs,
    einddatum: eind,
    melding
  };
}

/* ---- utils ---- */
function parseHa(s) {
  s = s.replace(/\s*ha$/i,'').trim();
  const n = parseFloat(s.replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n) ? n : 0;
}
function toInt(v) {
  const n = parseInt(String(v||'').trim(),10);
  return Number.isFinite(n) ? n : null;
}
function parseDateSmart(v) {
  const s = String(v||'').trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return new Date(+dmy[3], +dmy[2]-1, +dmy[1]);
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) return new Date(+ymd[1], +ymd[2]-1, +ymd[3]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function canon(s) {
  return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/\s|\(|\)|\[|\]|\.|,|:|;|\/|\\/g,'');
}
