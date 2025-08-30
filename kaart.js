// kaart.js — Percelen via KMZ upload plotten + filter + zoeken + highlight + opslaan/laden

/* ---------------------------------
   1) Map init
--------------------------------- */
const mapEl = document.getElementById('map');
if (!window.L) console.error('Leaflet (L) niet geladen.');
if (!mapEl) console.error('#map element niet gevonden in de DOM.');

const MAP_CENTER = [52.1, 5.1];
const MAP_ZOOM   = 7;

const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
   attribution: '© OSM contributors'
}).addTo(map);

setTimeout(() => map.invalidateSize(), 0);
window.addEventListener('resize', () => {
   clearTimeout(window.__leafletResizeTO);
   window.__leafletResizeTO = setTimeout(() => map.invalidateSize(), 120);
});

/* ---------------------------------
   2) State + events
--------------------------------- */
export let parcels = [];
let currentFilter = 'all';   // 'all' | 'bemestbaar' | 'niet'
let currentSearch = '';      // zoekterm (highlight & filteren)

// Enkelvoudige selectie
let selectedParcelId = null;
let suppressNextGlobalDeselect = false; // negeer eerstvolgende document-click
let suppressNextMapDeselect    = false; // negeer eerstvolgende map-click (na layer-click)

// Kleuren
const COLOR_DEFAULT  = '#1e90ff';
const COLOR_SELECTED = '#f1c40f'; // geel (huisstijl)

function uuid() {
   return 'p_' + Math.random().toString(36).slice(2);
}

function dispatchParcelsChanged() {
   try {
      window.dispatchEvent(new CustomEvent('parcels:changed', { detail: { parcels: [...parcels] } }));
   } catch (e) {
      console.warn('Kon parcels:changed niet dispatchen:', e);
   }
}

/* ---------------------------------
   3) Helpers
--------------------------------- */
async function fetchJson(url) {
   const res = await fetch(url);
   if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
   return res.json();
}

// Centroid voor Polygon/MultiPolygon (EPSG:4326)
function polygonCentroid(geom) {
   const polys = (geom?.type === 'Polygon') ? [geom.coordinates]
      : (geom?.type === 'MultiPolygon') ? geom.coordinates
      : [];
   let areaSum = 0, xSum = 0, ySum = 0;

   for (const poly of polys) {
      const ring = poly[0] || [];
      let a = 0, cx = 0, cy = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
         const [x1, y1] = ring[j];
         const [x2, y2] = ring[i];
         const cross = x1 * y2 - x2 * y1;
         a += cross;
         cx += (x1 + x2) * cross;
         cy += (y1 + y2) * cross;
      }
      a = a / 2;
      if (a !== 0) {
         cx = cx / (6 * a);
         cy = cy / (6 * a);
         const w = Math.abs(a);
         areaSum += w;
         xSum += w * cx;
         ySum += w * cy;
      }
   }

   if (areaSum === 0) return null;
   return { lon: xSum / areaSum, lat: ySum / areaSum };
}

// Opp. parser uit KMZ → altijd ha
function toHaFromKmz(v) {
   const raw = String(v ?? '').trim().toLowerCase();
   if (!raw) return 0;
   const s = raw.replace(/\s+/g, ' ').replace(',', '.');

   if (s.includes('ha')) {
      const num = parseFloat(s.replace('ha', '').trim());
      return Number.isFinite(num) ? num : 0;
   }

   const numeric = parseFloat(s.replace(/[^\d.+-eE]/g, ''));
   if (!Number.isFinite(numeric)) return 0;
   return numeric / 10_000;
}

// Tijdelijk grasland labels
let __tgLabelsCache = null;
async function loadTijdelijkGrasLabels() {
   if (__tgLabelsCache) return __tgLabelsCache;
   try {
      const norms = await fetchJson('/data/stikstofnormen_tabel2.json');
      const keys = Object.keys(norms || {});
      const tg = keys.filter(k => k.toLowerCase().startsWith('tijdelijk grasland'));
      __tgLabelsCache = tg;
      return tg;
   } catch {
      __tgLabelsCache = [];
      return __tgLabelsCache;
   }
}

// "Geen norm" set
let __geenNormSet = null;
async function loadGeenNormSet() {
   if (__geenNormSet) return __geenNormSet;
   try {
      const norms = await fetchJson('/data/stikstofnormen_tabel2.json');
      const geen = norms?.['Geen norm']?.Gewascodes || [];
      __geenNormSet = new Set(geen.map(String));
   } catch {
      __geenNormSet = new Set();
   }
   return __geenNormSet;
}
async function isBemestbaar(gewasCode) {
   const set = await loadGeenNormSet();
   const codeStr = String(gewasCode ?? '');
   if (!codeStr) return true;
   return !set.has(codeStr);
}

// Alle gewascodes (voor "review nodig")
let __allGewasCodesSet = null;
async function loadAllGewasCodesSet() {
   if (__allGewasCodesSet) return __allGewasCodesSet;
   try {
      const norms = await fetchJson('/data/stikstofnormen_tabel2.json');
      const set = new Set();
      for (const entry of Object.values(norms || {})) {
         const codes = entry?.Gewascodes;
         if (Array.isArray(codes)) for (const c of codes) set.add(String(c));
      }
      __allGewasCodesSet = set;
   } catch {
      __allGewasCodesSet = new Set();
   }
   return __allGewasCodesSet;
}
async function codeKnownInNormen(gewasCode) {
   const set = await loadAllGewasCodesSet();
   const codeStr = String(gewasCode ?? '');
   if (!codeStr) return false;
   return set.has(codeStr);
}

// Escaping + highlight helpers
function escapeHtml(s) {
   return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}
function escapeRegex(s) {
   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlight(text, term) {
   const raw = String(text ?? '');
   const q = String(term ?? '').trim();
   if (!q) return escapeHtml(raw);
   const re = new RegExp(escapeRegex(q), 'gi');
   let out = '', last = 0, m;
   while ((m = re.exec(raw)) !== null) {
      out += escapeHtml(raw.slice(last, m.index));
      out += `<mark class="hl">${escapeHtml(m[0])}</mark>`;
      last = m.index + m[0].length;
   }
   out += escapeHtml(raw.slice(last));
   return out;
}

// Badges HTML
function renderBadges(b) {
   if (!b) return '';
   const pill = (txt, cls) =>
      `<span class="badge ${cls}" style="padding:.15rem .5rem;border-radius:999px;font-size:.75rem;">${txt}</span>`;
   const out = [];
   if (typeof b.bemestbaar === 'boolean') {
      out.push(b.bemestbaar ? pill('bemestbaar', 'badge-info') : pill('niet-bemestbaar', 'badge-warn'));
   }
   if (b.reviewNeeded) {
      const extra = b.missingCode ? ` (code ${String(b.missingCode)})` : '';
      out.push(pill(`review nodig${extra}`, 'badge-warn'));
   }
   return out.join('');
}
function formatHa(v) {
   const n = Number(v);
   if (!Number.isFinite(n)) return '';
   return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Kaartstijl (incl. selectie)
function updateParcelLayerStyle(p, show) {
   if (!p?.layer) return;
   if (p.id === selectedParcelId) {
      p.layer.setStyle({
         color: COLOR_SELECTED,
         fillColor: COLOR_SELECTED,
         weight: 3,
         opacity: 1,
         fillOpacity: 0.30
      });
      try { if (p.layer.bringToFront) p.layer.bringToFront(); } catch {}
   } else if (show) {
      p.layer.setStyle({
         color: COLOR_DEFAULT,
         fillColor: COLOR_DEFAULT,
         weight: 2,
         opacity: 1,
         fillOpacity: 0.25
      });
   } else {
      p.layer.setStyle({
         color: COLOR_DEFAULT,
         fillColor: COLOR_DEFAULT,
         weight: 1,
         opacity: 0.15,
         fillOpacity: 0.04
      });
   }
}

function focusMapOnParcel(p) {
   try {
      const b = p?.layer?.getBounds?.();
      if (b && b.isValid && b.isValid()) {
         map.fitBounds(b.pad(0.15), { animate: true });
      } else if (p?.centroid) {
         map.setView([p.centroid.lat, p.centroid.lon], Math.max(map.getZoom(), 16), { animate: true });
      }
   } catch {}
}

function scrollItemIntoView(id) {
   const list = document.getElementById('parcelList');
   if (!list) return;
   const el = list.querySelector(`.parcel-item[data-id="${id}"]`);
   if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function scrollMapIntoView() {
  try {
    if (mapEl && mapEl.scrollIntoView) {
      mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch {}
}

function deselectParcel({ repaint = true } = {}) {
   if (!selectedParcelId) return;
   const prev = parcels.find(x => x.id === selectedParcelId);
   if (prev) prev.isSelected = false;
   selectedParcelId = null;
   if (repaint) renderParcelList(); // (roept applyVisibility aan → styles)
}

function selectParcel(id, { center = true, scroll = true, scrollMap = false } = {}) {
  if (selectedParcelId && selectedParcelId !== id) {
    const prev = parcels.find(x => x.id === selectedParcelId);
    if (prev) prev.isSelected = false;
  }
  if (selectedParcelId === id) {
    // toggle: zelfde perceel → deselect
    deselectParcel({ repaint: true });
    return;
  }
  selectedParcelId = id;
  const curr = parcels.find(x => x.id === id);
  if (!curr) return;
  curr.isSelected = true;

  // Klik die select veroorzaakt negeer van eerstvolgende globale klik
  suppressNextGlobalDeselect = true;
  setTimeout(() => { suppressNextGlobalDeselect = false; }, 0);

  renderParcelList();
  if (scroll)  scrollItemIntoView(id);
  if (center)  focusMapOnParcel(curr);
  if (scrollMap) scrollMapIntoView(); // <<— NIEUW: lijst ⇒ terug naar de kaart
}

/* ---------------------------------
   4) Spinner overlay + knop-busy
--------------------------------- */
let mapSpinnerEl = null;
function ensureMapSpinner() {
   if (mapSpinnerEl) return mapSpinnerEl;
   const wrap = document.createElement('div');
   wrap.style.cssText = `
      position:absolute; inset:0; display:none; align-items:center; justify-content:center;
      background:rgba(255,255,255,.55); backdrop-filter:saturate(120%) blur(1px); z-index:500;
   `;
   const inner = document.createElement('div');
   inner.style.cssText = 'display:flex; flex-direction:column; gap:.5rem; align-items:center; font-size:.95rem; color:#333;';
   inner.innerHTML = `
      <div class="spinner" style="
         width:28px;height:28px;border:3px solid rgba(0,0,0,.15);
         border-top-color:${COLOR_DEFAULT};border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <div class="msg">Koppelen van percelen…</div>
   `;
   wrap.appendChild(inner);
   const style = document.createElement('style');
   style.textContent = `@keyframes spin{to{transform:rotate(360deg)}}`;
   document.head.appendChild(style);
   mapEl.style.position = 'relative';
   mapEl.appendChild(wrap);
   mapSpinnerEl = wrap;
   return wrap;
}
function setMapSpinner(visible, text) {
   const el = ensureMapSpinner();
   el.style.display = visible ? 'flex' : 'none';
   const msg = el.querySelector('.msg');
   if (msg && text) msg.textContent = text;
}
function setAddButtonLoading(isLoading, progressText) {
   const btn = document.querySelector('#kmz-add, #rvo-add');
   if (!btn) return;
   const labelEl = btn.querySelector('#kmz-label') || document.getElementById('kmz-label');

   btn.style.border = '';
   btn.style.background = '';
   btn.style.color = '';
   btn.style.boxShadow = '';
   btn.style.padding = '';
   btn.style.borderRadius = '';
   btn.style.opacity = '';
   btn.removeAttribute('aria-busy');
   const sp = btn.querySelector('.btnspin'); if (sp) sp.remove();

   if (isLoading) {
      btn.disabled = true; btn.setAttribute('aria-busy','true');
      if (labelEl) labelEl.textContent = progressText || 'Koppelen…';
   } else {
      btn.disabled = false; btn.removeAttribute('aria-busy');
      if (labelEl) labelEl.textContent = 'Koppel percelen';
   }
}

/* ---------------------------------
   5) UI-lijst + filter + zoek (met highlight)
--------------------------------- */
function ensureFilterUI() {
   const section = document.querySelector('.parcel-list-section');
   if (!section) return;

   let wrap =
      document.getElementById('parcelFilterBar') ||
      section.querySelector('.parcel-toolbar') ||
      section.querySelector('.parcel-filter');

   if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'parcelFilterBar';
      wrap.className = 'parcel-toolbar';
      section.insertBefore(wrap, section.querySelector('.parcel-panel')?.firstChild || section.firstChild);
   }

   // Filter select
   let filterSel = wrap.querySelector('#parcelFilter');
   if (!filterSel) {
      const label = document.createElement('label');
      label.className = 'sr-only'; label.setAttribute('for','parcelFilter'); label.textContent = 'Filter percelen';

      filterSel = document.createElement('select');
      filterSel.id = 'parcelFilter'; filterSel.className = 'pf-select'; filterSel.setAttribute('aria-label','Toon percelen');
      filterSel.innerHTML = `
         <option value="all">Alle percelen</option>
         <option value="bemestbaar">Bemestbaar</option>
         <option value="niet">Niet-bemestbaar</option>
      `;
      wrap.appendChild(label); wrap.appendChild(filterSel);
   }
   if (!filterSel.dataset.bound) {
      filterSel.addEventListener('change', () => {
         currentFilter = filterSel.value; renderParcelList();
      });
      filterSel.dataset.bound = '1';
   }
   filterSel.value = currentFilter;

   // Zoekveld
   let searchInp = wrap.querySelector('#parcelSearch');
   if (!searchInp) {
      const sl = document.createElement('label');
      sl.className = 'sr-only'; sl.setAttribute('for','parcelSearch'); sl.textContent = 'Zoek in percelen';

      searchInp = document.createElement('input');
      searchInp.id = 'parcelSearch'; searchInp.className = 'pf-search'; searchInp.type = 'search';
      searchInp.placeholder = 'Zoeken in percelen…'; searchInp.setAttribute('inputmode','search'); searchInp.setAttribute('autocomplete','off');

      wrap.appendChild(sl); wrap.appendChild(searchInp);
   }
   if (!searchInp.dataset.bound) {
      let to = null;
      searchInp.addEventListener('input', () => {
         clearTimeout(to);
         to = setTimeout(() => { currentSearch = searchInp.value || ''; renderParcelList(); }, 120);
      });
      searchInp.dataset.bound = '1';
   }
   searchInp.value = currentSearch;

   wrap.hidden = false;
}

function matchesFilter(p, filterKey) {
   const bem = !!p?.badges?.bemestbaar;
   if (filterKey === 'bemestbaar') return bem;
   if (filterKey === 'niet')       return !bem;
   return true;
}
function matchesSearch(p, termRaw) {
   const term = (termRaw || '').trim().toLowerCase();
   if (!term) return true;
   const hay = [p.name, p.gewasNaam, String(p.gewasCode ?? '')]
      .map(x => String(x || '').toLowerCase());
   return hay.some(s => s.includes(term));
}

function renderParcelList() {
   ensureFilterUI();

   const container = document.getElementById('parcelList');
   if (!container) return;

   container.innerHTML = '';

   // Sorteer percelen op opp. (ha) aflopend
   const sorted = [...parcels].sort((a, b) => {
      const ah = Number(a?.ha) || 0;
      const bh = Number(b?.ha) || 0;
      if (bh !== ah) return bh - ah;
      const an = String(a?.name || '');
      const bn = String(b?.name || '');
      return an.localeCompare(bn, 'nl', { numeric: true, sensitivity: 'base' });
   });

   // Render lijst
   sorted.forEach(p => {
      const div = document.createElement('div');
      div.className = 'parcel-item';
      div.dataset.id = p.id;

      if (p.id === selectedParcelId || p.isSelected) {
         div.classList.add('is-selected');
         div.setAttribute('aria-selected', 'true');
      }

      div.style.cssText = `
         border:1px solid #eceff3; border-radius:12px; padding:.65rem .8rem; margin:.5rem 0;
         box-shadow: 0 1px 1px rgba(16,24,40,.04);
      `;

      const isTG = Number(p.gewasCode) === 266;

      // highlight naam/gewas/code/grondsoort
      const hName  = highlight(p.name, currentSearch);
      const hCode  = highlight(String(p.gewasCode ?? ''), currentSearch);
      const hGewas = highlight(p.gewasNaam ?? '', currentSearch);

      div.innerHTML = `
         <div class="title-row">
            <h3 class="parcel-title">${hName}</h3>
            <div class="badge-row">${renderBadges(p.badges)}</div>
         </div>

         <div class="meta-list">
            <span class="meta-item">Opp: <strong>${formatHa(p.ha)} ha</strong></span>
            <span class="meta-item">Code: <strong>${hCode}</strong></span>
            <span class="meta-item">Gewas: <strong>${hGewas}</strong></span>
         </div>

         ${isTG ? `
            <div class="field-group" style="margin:.5rem 0 0 0;">
               <label style="font-size:.85rem; opacity:.8; display:block; margin:.15rem 0;">Variant tijdelijk grasland (266):</label>
               <select class="tg-variant" style="padding:.35rem .5rem; border-radius:8px; border:1px solid #e3e6ea;"></select>
            </div>
         ` : ``}
      `;

      if (isTG) {
         const sel = div.querySelector('.tg-variant');
         loadTijdelijkGrasLabels().then(labels => {
            sel.innerHTML = labels.map(l => {
               const selAttr = (String(p.gewasNaam).toLowerCase() === String(l).toLowerCase()) ? 'selected' : '';
               return `<option ${selAttr} value="${escapeHtml(l)}">${escapeHtml(l)}</option>`;
            }).join('');
         });
         sel.addEventListener('change', () => {
            p.gewasNaam = sel.value;
            dispatchParcelsChanged();
            renderParcelList(); // update highlight mogelijk
         });
      }

      // Klik op lijst-item: selecteer/deselecteer + zoom + scroll
      div.tabIndex = 0;
      div.addEventListener('click', () => {
         if (selectedParcelId === p.id) {
            deselectParcel({ repaint: true });
         } else {
            selectParcel(p.id, { center: true, scroll: true });
         }
      });
      div.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (selectedParcelId === p.id) {
               deselectParcel({ repaint: true });
            } else {
               selectParcel(p.id, { center: true, scroll: true });
            }
         }
      });

      container.append(div);
   });

   // Zichtbaarheid + kaart-dim/highlight
   applyVisibility(currentFilter, currentSearch);
}

// Lijst tonen/verbergen + kaart dimmen/highlighten
function applyVisibility(filterKey = 'all', search = '') {
   const container = document.getElementById('parcelList');
   let visibleCount = 0;

   if (container) {
      const items = container.querySelectorAll('.parcel-item');
      items.forEach(el => {
         const id = el.dataset.id;
         const p  = parcels.find(x => x.id === id);
         const show = p && matchesFilter(p, filterKey) && matchesSearch(p, search);
         el.style.display = show ? '' : 'none';
         if (show) visibleCount++;
      });

      let empty = container.querySelector('.parcel-empty');
      if (!empty) {
         empty = document.createElement('div');
         empty.className = 'parcel-empty';
         empty.innerHTML = `
            <div>
               <div class="empty-title">Geen zoekresultaten</div>
               <div class="empty-hint">Pas je filter of zoekopdracht aan.</div>
            </div>
         `;
         container.appendChild(empty);
      }
      empty.style.display = visibleCount === 0 ? '' : 'none';
   }

   for (const p of parcels) {
      const show = matchesFilter(p, filterKey) && matchesSearch(p, search);
      updateParcelLayerStyle(p, show);
   }
}

/* ---------------------------------
   6) Globale klik = deselect (tweede klik)
--------------------------------- */
document.addEventListener('click', () => {
   if (!selectedParcelId) return;
   if (suppressNextGlobalDeselect) { suppressNextGlobalDeselect = false; return; }
   deselectParcel({ repaint: true });
});

/* ---------------------------------
   7) Kaart interactie
--------------------------------- */
// Klik op lege kaart = deselect (na layer-click 1x negeren)
map.on('click', () => {
   if (suppressNextMapDeselect) { suppressNextMapDeselect = false; return; }
   if (selectedParcelId) deselectParcel({ repaint: true });
});

/* ---------------------------------
   8) KMZ-only koppeling
--------------------------------- */
window.addEventListener('rvo:imported', async () => {
   try {
      const rows = Array.isArray(window.__KMZ_RAW) ? window.__KMZ_RAW : [];
      const geo  = window.__KMZ_GEO && window.__KMZ_GEO.byId ? window.__KMZ_GEO.byId : null;
      if (!rows.length || !geo) return;

      setMapSpinner(true, 'Koppelen van percelen…');
      setAddButtonLoading(true, 'Koppelen…');
      window.dispatchEvent(new CustomEvent('kmz:linking:start', { detail: { total: rows.length } }));

      try {
         for (const p of parcels) { if (p.layer) map.removeLayer(p.layer); }
         parcels.length = 0;
      } catch {}

      const tgLabels = await loadTijdelijkGrasLabels();
      let done = 0, added = 0;

      for (const row of rows) {
         const feat = geo[row.sectorId];
         if (!feat) {
            done++;
            window.dispatchEvent(new CustomEvent('kmz:linking:progress', { detail: { done, total: rows.length } }));
            continue;
         }

         let bodem = {};
         const c = polygonCentroid(feat.geometry);
         if (c) {
            try {
               const b = await fetch(`/.netlify/functions/wettelijkeGrondsoort?lon=${c.lon}&lat=${c.lat}`);
               bodem = b.ok ? await b.json() : {};
            } catch {}
         }

         let gewasNaam = row.gewasNaam || '';
         if (Number(row.gewasCode) === 266) {
            const fallback = tgLabels.find(k => /1 januari.*15 oktober/i.test(k)) || tgLabels[0] || 'Tijdelijk grasland';
            gewasNaam = fallback;
         }

         const bem   = await isBemestbaar(row.gewasCode);
         const known = await codeKnownInNormen(row.gewasCode);
         const reviewNeeded = !known;

         const layer = L.geoJSON(feat.geometry, {
            style: { color: COLOR_DEFAULT, fillColor: COLOR_DEFAULT, weight: 2, fillOpacity: 0.25 }
         }).addTo(map);

         const id = uuid();
         const haNum = toHaFromKmz(row.ha);

         parcels.push({
            id,
            layer,
            name: feat.properties?.weergavenaam || feat.properties?.identificatie || row.sectorId,
            ha: haNum,
            gewasCode: row.gewasCode,
            gewasNaam,
            provincie: '',
            grondsoort: (bodem?.bodemsoortNaam || bodem?.grondsoort || ''),
            landgebruik: (String(gewasNaam).toLowerCase().includes('gras') ? 'Grasland' : 'Bouwland'),
            badges: {
               bemestbaar: bem,
               reviewNeeded,
               missingCode: reviewNeeded ? String(row.gewasCode ?? '') : null,
               isTG: Number(row.gewasCode) === 266
            },
            centroid: c || null,
            geometry: feat.geometry || null,
            _meta:  { sectorId: row.sectorId },
            _source:'upload-kmz',
            isSelected: false
         });

         try {
            layer.on('click', (evt) => {
               // Stop bubbling zodat map.click/doc.click niet meteen deselecteren
               try { if (evt?.originalEvent && L?.DomEvent) L.DomEvent.stop(evt.originalEvent); } catch {}
               suppressNextMapDeselect = true;
               setTimeout(() => { suppressNextMapDeselect = false; }, 0);

               if (selectedParcelId === id) {
                  deselectParcel({ repaint: true });
               } else {
                  selectParcel(id, { center: true, scroll: true });
               }
            });
         } catch {}

         added++; done++;
         if (done % 5 === 0 || done === rows.length) {
            window.dispatchEvent(new CustomEvent('kmz:linking:progress', { detail: { done, total: rows.length } }));
            setMapSpinner(true, `Koppelen… ${done}/${rows.length}`);
            setAddButtonLoading(true, `Koppelen… ${done}/${rows.length}`);
         }
      }

      renderParcelList();
      dispatchParcelsChanged();

      try {
         const group = L.featureGroup(parcels.map(p => p.layer).filter(Boolean));
         if (group.getLayers().length) map.fitBounds(group.getBounds().pad(0.1));
      } catch {}

      window.dispatchEvent(new CustomEvent('kmz:linking:end', { detail: { added } }));
      setMapSpinner(false);
      setAddButtonLoading(false);

   } catch (err) {
      console.error('[kaart] rvo:imported (KMZ) fout:', err);
      window.dispatchEvent(new CustomEvent('kmz:linking:end', { detail: { added: 0 } }));
      setMapSpinner(false);
      setAddButtonLoading(false);
      alert('Er ging iets mis bij het plotten van de geüploade percelen.');
   }
});

/* ---------------------------------
   9) Opgeslagen percelen hydrateren
--------------------------------- */
window.addEventListener('parcels:loadSaved', (e) => {
   const items = Array.isArray(e.detail?.parcels) ? e.detail.parcels : [];

   const toNum = (v) => (typeof v === 'string' ? parseFloat(v) : v);
   const normCoords = (coords) => {
      if (!Array.isArray(coords)) return coords;
      if (coords.length === 2 && coords.every(n => typeof n === 'number' || typeof n === 'string')) {
         const x = toNum(coords[0]); const y = toNum(coords[1]);
         return [Number.isFinite(x) ? x : coords[0], Number.isFinite(y) ? y : coords[1]];
      }
      return coords.map(normCoords);
   };
   const asFeature = (row) => {
      if (row?.type === 'Feature' && row.geometry) {
         return { type: 'Feature', geometry: { ...row.geometry, coordinates: normCoords(row.geometry.coordinates) }, properties: {} };
      }
      if (row?.type === 'FeatureCollection' && Array.isArray(row.features)) {
         return {
            type: 'FeatureCollection',
            features: row.features.map(f =>
               (f?.type === 'Feature' && f.geometry)
                  ? { ...f, geometry: { ...f.geometry, coordinates: normCoords(f.geometry.coordinates) } }
                  : f
            )
         };
      }
      if (row?.geometry?.type && row.geometry?.coordinates) {
         return { type: 'Feature', geometry: { ...row.geometry, coordinates: normCoords(row.geometry.coordinates) }, properties: {} };
      }
      return null;
   };

   try { for (const p of parcels) { if (p.layer) map.removeLayer(p.layer); } } catch {}
   parcels.length = 0;

   for (const row of items) {
      let layer = null;
      try {
         const featureOrFC = asFeature(row) || asFeature({ geometry: row?.geometry });
         if (featureOrFC) {
            layer = L.geoJSON(featureOrFC, { style: { color: COLOR_DEFAULT, fillColor: COLOR_DEFAULT, weight: 2, fillOpacity: 0.25 } }).addTo(map);
         }
      } catch (err) { console.warn('Kon opgeslagen geometry niet tekenen:', err, row); }

      const id = row.id || uuid();

      parcels.push({
         id,
         layer,
         name: row.name ?? '',
         ha: Number(row.ha) || 0,
         gewasCode: row.gewasCode ?? null,
         gewasNaam: row.gewasNaam ?? '',
         provincie: row.provincie ?? '',
         grondsoort: row.grondsoort ?? '',
         landgebruik: row.landgebruik ?? (String(row.gewasNaam||'').toLowerCase().includes('gras') ? 'Grasland' : 'Bouwland'),
         badges: row.badges ?? {},
         centroid: row.centroid ?? null,
         geometry: row.geometry ?? null,
         _meta: row._meta ?? {},
         _source: 'saved',
         isSelected: false
      });

      try {
         if (layer) layer.on('click', (evt) => {
            try { if (evt?.originalEvent && L?.DomEvent) L.DomEvent.stop(evt.originalEvent); } catch {}
            suppressNextMapDeselect = true;
            setTimeout(() => { suppressNextMapDeselect = false; }, 0);

            if (selectedParcelId === id) {
               deselectParcel({ repaint: true });
            } else {
               selectParcel(id, { center: true, scroll: true });
            }
         });
      } catch {}
   }

   renderParcelList();
   dispatchParcelsChanged();

   try {
      const group = L.featureGroup(
         parcels.map(p => p.layer).filter(Boolean).flatMap(l => (l.getLayers ? l.getLayers() : [l]))
      );
      if (group.getLayers().length) map.fitBounds(group.getBounds().pad(0.1));
   } catch (err) { console.warn('fitBounds fout:', err); }

   try { map.invalidateSize(); } catch {}
});

/* ---------------------------------
   10) Clear API
--------------------------------- */
export function clearAllParcels() {
   try {
      for (const p of parcels) {
         try { if (p.layer && map && map.removeLayer) map.removeLayer(p.layer); } catch {}
      }
      parcels.length = 0;
      selectedParcelId = null;
      renderParcelList();
      dispatchParcelsChanged();
   } catch (e) {
      console.warn('clearAllParcels():', e);
   }
}

/* ---------------------------------
   11) Init
--------------------------------- */
renderParcelList();
dispatchParcelsChanged();
