// upload.js — mestsoort + defaults + optioneel bestand + cards UI + inline saves
import { supabase } from './supabaseClient.js';
import {
  isValidPostcode, formatPostcode,
  parsePrice2dec, parseSignedPrice2dec, parseIntStrict,
  isFileAllowed, showInlineError, clearInlineError, disable, toast, extractAnalysis
} from './utils.js';

const form = document.getElementById('uploadForm');
const elNaam = document.getElementById('naam');
const elFile = document.getElementById('file');
const elPrijs= document.getElementById('inkoopprijs');
const elTon  = document.getElementById('aantalTon');
const elPriceSign = document.getElementById('priceSign'); // 'pos' | 'neg'

const listContainer = document.getElementById('mestChoiceList');

const cbUseProfile = document.getElementById('useProfilePostcode');
const wrapPostcode = document.getElementById('postcodeWrap');
const elPostcode   = document.getElementById('postcode');
const btnSubmit    = document.getElementById('btnSubmit');
const myUploads    = document.getElementById('myUploads');

// Analyse fields (read-only)
const elDS  = document.getElementById('DS_percent');
const elN   = document.getElementById('N_kg_per_ton');
const elP   = document.getElementById('P_kg_per_ton');
const elK   = document.getElementById('K_kg_per_ton');
const elOS  = document.getElementById('OS_percent');
const elBio = document.getElementById('Biogas');

let session, profile, userId;
let mestsoortenObj = {};    // { drijfmest:{ koe:{...} }, vaste_mest:{...}, ... }
let selectedCat = null;
let selectedType = null;

/* ========================
   INIT
======================== */
(async function init(){
  ({ data: { session } } = await supabase.auth.getSession());
  if (!session) {
    toast('Log eerst in om te kunnen uploaden.', 'info');
    window.location.href = 'account.html';
    return;
  }
  userId = session.user.id;

  // profiel (voor postcode)
  const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
  profile = prof || {};

  // postcode toggle
  const profilePostcode = getProfilePostcode();
  cbUseProfile.checked = !!profilePostcode;
  wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';
  cbUseProfile.addEventListener('change', () => {
    wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';
    if (!cbUseProfile.checked) elPostcode?.focus();
  });

  // vraagprijs-teken STANDAARD NEGATIEF
  initPriceSignToggle('neg');

  // mestsoorten laden + UI bouwen
  await renderMestChoices();

  // events
  elFile.addEventListener('change', handleFileChange);
  form.addEventListener('submit', onSubmit);

  // overzicht
  await loadMyUploads();
})();

function getProfilePostcode() {
  return session?.user?.user_metadata?.postcode || profile?.postcode || null;
}

/* ========================
   PRICE SIGN TOGGLE
======================== */
function initPriceSignToggle(defaultMode='neg'){
  if (elPriceSign) elPriceSign.value = defaultMode;
  const wrap = document.querySelector('[data-role="price-sign"]');
  if (!wrap) return;
  const bPos = wrap.querySelector('button[data-sign="pos"]');
  const bNeg = wrap.querySelector('button[data-sign="neg"]');

  const setSign = (mode) => {
    if (elPriceSign) elPriceSign.value = mode;
    bPos?.setAttribute('aria-pressed', String(mode === 'pos'));
    bNeg?.setAttribute('aria-pressed', String(mode === 'neg'));
  };

  bPos?.addEventListener('click', () => setSign('pos'));
  bNeg?.addEventListener('click', () => setSign('neg'));

  setSign(defaultMode);
}

/* ========================
   MEST KEUZE (single-select + toggle-deselect)
======================== */
function labelCategorie(c){
  const map = { drijfmest:'Drijfmest', vaste_mest:'Vaste mest', dikke_fractie:'Dikke fractie', overig:'Overig' };
  return map[c] || (c?.replace(/_/g,' ') || '');
}
function labelType(t){ return t ? t.charAt(0).toUpperCase()+t.slice(1) : ''; }

async function renderMestChoices(){
  try {
    const resp = await fetch('data/mestsoorten.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();

    mestsoortenObj = toObjectShapedMest(raw);

    const order = ['drijfmest', 'vaste_mest', 'dikke_fractie', 'overig'];
    const cats = Object.keys(mestsoortenObj);
    const orderedCats = order.filter(c => cats.includes(c)).concat(cats.filter(c => !order.includes(c)));

    listContainer.innerHTML = orderedCats.map(cat => {
      const animals = Object.keys(mestsoortenObj[cat] || {});
      if (!animals.length) return '';
      const buttons = animals.map(an => {
        const id = `mest_${cat}_${an}`.replace(/\s+/g,'_');
        return `
          <input type="radio" id="${id}" name="mest_one" value="${an}" data-cat="${cat}" data-type="${an}">
          <label for="${id}" class="btn mest-btn">${labelType(an)}</label>
        `;
      }).join('');
      return `
        <div class="category">
          <div class="category__label">${labelCategorie(cat)}</div>
          <div class="category__choices">${buttons}</div>
        </div>
      `;
    }).join('') || `<div class="muted">Geen mestsoorten gevonden.</div>`;

    // Handlers na render: change + label-click voor deselect
    attachMestToggleHandlers('#mestChoiceList');
  } catch (e) {
    console.error(e);
    listContainer.innerHTML = `<div class="message error">Kon mestsoorten niet laden.</div>`;
  }
}

function toObjectShapedMest(raw){
  // Ondersteunt zowel object-structuur als array-structuur
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (Array.isArray(raw)) {
    const obj = {};
    for (const m of raw) {
      const cat = m?.categorie; const typ = m?.type;
      if (!cat || !typ) continue;
      (obj[cat] ||= {})[typ] = m; // sla hele object op (met waardes)
    }
    return obj;
  }
  return {};
}

// === Toggle helper: radio opnieuw klikken => deselect ===
function attachMestToggleHandlers(containerSel = '#mestChoiceList'){
  const root = document.querySelector(containerSel);
  if (!root) return;

  // change → set/unset selectie
  root.querySelectorAll('input[type="radio"][name="mest_one"]').forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) {
        selectedCat  = r.dataset.cat || null;
        selectedType = r.dataset.type || null;
        clearInlineError(listContainer);
        if (selectedCat && selectedType) applyDefaultsFromSelection(selectedCat, selectedType);
      } else {
        selectedCat  = null;
        selectedType = null;
      }
    });
  });

  // klik op label van al-geselecteerde radio ⇒ deselect (terug naar geen keuze)
  root.querySelectorAll('input[type="radio"][name="mest_one"]').forEach(r => {
    const lbl = root.querySelector(`label[for="${r.id}"]`);
    if (!lbl) return;
    lbl.addEventListener('click', (ev) => {
      if (r.checked) {
        ev.preventDefault();                 // voorkom directe her-selectie
        r.checked = false;                   // echt uitzetten
        r.dispatchEvent(new Event('change', { bubbles:true }));
      }
    });
  });
}

/* ========================
   DEFAULTS op basis van keuze (analyse)
======================== */
function applyDefaultsFromSelection(cat, type){
  if (!cat || !type) return;
  const node = mestsoortenObj?.[cat]?.[type];
  if (!node || typeof node !== 'object') return;

  const ds   = pickNum(node, ['ds_percent','DS_percent']);
  const n    = pickNum(node, ['n_kg_per_ton','N_kg_per_ton']);
  const p    = pickNum(node, ['p_kg_per_ton','P_kg_per_ton']);
  const k    = pickNum(node, ['k_kg_per_ton','K_kg_per_ton']);
  const os   = pickNum(node, ['os_percent','OS_percent']);
  const bio  = pickNum(node, ['biogaspotentieel_m3_per_ton','Biogaspotentieel_m3_per_ton']);

  elDS.value  = numToRO(ds);
  elN.value   = numToRO(n);
  elP.value   = numToRO(p);
  elK.value   = numToRO(k);
  elOS.value  = numToRO(os);
  elBio.value = numToRO(bio);

  // bewust GEEN prijs/ton en aantal ton invullen
}

function pickNum(obj, keys){
  for (const k of keys) {
    if (obj[k] === 0 || (obj[k] != null && typeof obj[k] !== 'undefined')) {
      const n = Number(String(obj[k]).replace(',','.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}
function numToRO(v){
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n).replace(/\.00$/,'') : '';
}

/* ========================
   BESTANDSANALYSE (optioneel)
======================== */
async function handleFileChange() {
  clearInlineError(elFile);
  const file = elFile.files?.[0];
  if (!file) return;
  if (!isFileAllowed(file)) { showInlineError(elFile, 'Alleen PDF/JPG/PNG en max 10MB.'); return; }
  disable(btnSubmit, true);
  try {
    const parsed = await extractAnalysis(file);
    elDS.value = toFixedOrEmpty(parsed.DS_percent);
    elN.value  = toFixedOrEmpty(parsed.N_kg_per_ton);
    elP.value  = toFixedOrEmpty(parsed.P_kg_per_ton);
    elK.value  = toFixedOrEmpty(parsed.K_kg_per_ton);
    elOS.value = toFixedOrEmpty(parsed.OS_percent);
    elBio.value= toFixedOrEmpty(parsed.Biogaspotentieel_m3_per_ton);
  } catch (e) {
    console.error(e);
    toast('Analyse uitlezen mislukt. Je kunt wel opslaan; beheer kan corrigeren.', 'warning');
  } finally {
    disable(btnSubmit, false);
  }
}
function toFixedOrEmpty(v){
  return (v===null || v===undefined || v==='') ? '' : Number(v).toFixed(2).replace(/\.00$/,'');
}

/* ========================
   PRIJS & TON helpers
======================== */
function getSignedPriceFromUI() {
  if (elPriceSign) {
    const raw = parsePrice2dec(elPrijs.value);
    if (raw === null) return null;
    return (elPriceSign.value === 'neg') ? -raw : raw;
  }
  const signed = parseSignedPrice2dec(elPrijs.value);
  return signed === null ? null : signed;
}

/* ========================
   SUBMIT (bestand optioneel)
======================== */
async function onSubmit(e){
  e.preventDefault();
  let ok = true;
  [elNaam, elFile, elPrijs, elTon, elPostcode, listContainer].forEach(clearInlineError);

  const naam = (elNaam.value || '').trim();
  if (naam.length < 2 || naam.length > 25) {
    showInlineError(elNaam, '2–25 tekens.'); ok = false;
  }
  if (!selectedCat || !selectedType) { showInlineError(listContainer, 'Kies een mestsoort.'); ok = false; }

  const file = elFile.files?.[0];
  if (file && !isFileAllowed(file)) { showInlineError(elFile, 'Ongeldig bestand.'); ok = false; }

  const signedPrice = getSignedPriceFromUI();
  if (signedPrice === null || !Number.isFinite(signedPrice)) {
    showInlineError(elPrijs, 'Bedrag (max 2 dec).'); ok = false;
  }

  const tonInt = parseIntStrict(elTon.value);
  if (tonInt === null || tonInt <= 24) { showInlineError(elTon, 'Alleen hele aantallen > 24.'); ok = false; }

  let postcodeVal = null;
  const profilePostcodeNow = getProfilePostcode();
  if (cbUseProfile.checked) {
    if (profilePostcodeNow) postcodeVal = formatPostcode(profilePostcodeNow);
    else { wrapPostcode.style.display = 'block'; cbUseProfile.checked = false; showInlineError(elPostcode, 'Geen postcode in profiel.'); ok = false; }
  } else {
    if (!isValidPostcode(elPostcode.value)) { showInlineError(elPostcode,'Ongeldige NL postcode.'); ok=false; }
    else postcodeVal = formatPostcode(elPostcode.value);
  }

  if (!ok) return;
  disable(btnSubmit, true);

  try {
    // 1) Optioneel bestand uploaden
    let path = null, mime = null;
    if (file) {
      const now = new Date();
      const fileExt = (file.name?.split('.').pop() || 'bin').toLowerCase();
      const uuid = makeUUID();
      path = `${userId}/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${uuid}.${fileExt}`;
      mime = file.type || 'application/octet-stream';
      const { error: upErr } = await supabase.storage.from('mest-analyses').upload(path, file, { contentType: mime, upsert: false });
      if (upErr) throw upErr;
    }

    // 2) Insert
    const payload = {
      user_id: userId,
      naam: naam,
      mest_categorie: selectedCat,
      mest_type: selectedType,
      file_path: path,
      file_mime: mime,
      postcode: postcodeVal,
      inkoopprijs_per_ton: signedPrice,
      aantal_ton: tonInt,
      ds_percent: toNumOrNull(elDS.value),
      n_kg_per_ton: toNumOrNull(elN.value),
      p_kg_per_ton: toNumOrNull(elP.value),
      k_kg_per_ton: toNumOrNull(elK.value),
      os_percent: toNumOrNull(elOS.value),
      biogaspotentieel_m3_per_ton: toNumOrNull(elBio.value),
      status: 'in_behandeling'
    };

    const { error: insErr } = await supabase.from('mest_uploads').insert(payload);
    if (insErr) throw insErr;

    toast('Upload opgeslagen. Status: In behandeling.', 'success');

    // Reset UI
    form.reset();
    [elDS, elN, elP, elK, elOS, elBio].forEach(i => i.value = '');
    selectedCat = null; selectedType = null;
    await renderMestChoices();

    cbUseProfile.checked = !!profilePostcodeNow;
    wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';
    initPriceSignToggle('neg'); // zet ook de segmented UI terug

    await loadMyUploads();
  } catch (e) {
    console.error(e);
    toast('Opslaan mislukt: ' + (e?.message || e), 'error');
  } finally {
    disable(btnSubmit, false);
  }
}

function toNumOrNull(v){
  if (v===null || v===undefined || String(v).trim()==='') return null;
  const n = Number(String(v).replace(',','.'));
  return Number.isFinite(n) ? n : null;
}
function makeUUID(){
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2,'')).join('');
    return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20)}`;
  }
  return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

/* ========================
   Overzicht "Mijn uploads" — kaartjes + inline save
======================== */
async function loadMyUploads(){
  myUploads.innerHTML = 'Laden…';
  try {
    const { data, error } = await supabase
      .from('mest_uploads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || !data.length){
      myUploads.innerHTML = `<div class="muted">Nog geen uploads. Voeg hierboven je eerste upload toe.</div>`;
      return;
    }

    myUploads.innerHTML = '';
    myUploads.appendChild(renderUploadsGrid(data));
    bindUploadActions(data);
  } catch (e) {
    console.error(e);
    myUploads.textContent = 'Kon jouw uploads niet ophalen.';
  }
}

function renderUploadsGrid(rows){
  const wrap = document.createElement('div');
  wrap.className = 'uploads-grid uploads-grid--airy';
  rows.forEach(r => wrap.appendChild(renderUploadCard(r)));
  return wrap;
}

function renderUploadCard(r){
  const tpl = document.getElementById('tpl-upload-card');
  const frag = tpl.content.cloneNode(true);
  const article = frag.querySelector('article');
  article.dataset.id = r.id;

  // Titel + status
  const titleEl = frag.querySelector('.title');
  titleEl.textContent = r.naam || 'mest';
  titleEl.title = r.naam || 'mest';
  frag.querySelector('.status').innerHTML = renderBadge(r.status);

  // Meta
  frag.querySelector('.js-kind').innerHTML = prettyKind(r.mest_categorie, r.mest_type);
  frag.querySelector('.js-analysis').innerHTML = renderAnalysisChips(r);
  frag.querySelector('.js-filechip').innerHTML = renderFileChip(!!r.file_path);

  // Velden
  const prijs = frag.querySelector('.e-prijs');
  const ton   = frag.querySelector('.e-ton');
  const pc    = frag.querySelector('.e-postcode');
  const naamI = frag.querySelector('.e-naam'); // optioneel (alleen als je 'Naam' in kaart-template hebt gezet)

  const prijsVal = fmtEditSigned(r.inkoopprijs_per_ton);
  const tonVal   = fmtInt(r.aantal_ton);
  const pcVal    = r.postcode || '';
  const naamVal  = r.naam || '';

  if (prijs){ prijs.value = prijsVal; prijs.setAttribute('value', prijsVal); }
  if (ton){   ton.value   = tonVal;   ton.setAttribute('value', tonVal); }
  if (pc){    pc.value    = pcVal;    pc.setAttribute('value', pcVal); }
  if (naamI){ naamI.value = naamVal;  naamI.setAttribute('value',  naamVal); }

  return article; // geef de echte node terug
}

/* --- helpers voor kaartjes --- */
function renderAnalysisChips(r){
  const chips = [];
  if (isNum(r.ds_percent)) chips.push(pill('DS', r.ds_percent, '%'));
  if (isNum(r.n_kg_per_ton)) chips.push(pill('N', r.n_kg_per_ton, ' kg/t'));
  if (isNum(r.p_kg_per_ton)) chips.push(pill('P', r.p_kg_per_ton, ' kg/t'));
  if (isNum(r.k_kg_per_ton)) chips.push(pill('K', r.k_kg_per_ton, ' kg/t'));
  if (isNum(r.os_percent))   chips.push(pill('OS', r.os_percent, '%'));
  if (isNum(r.biogaspotentieel_m3_per_ton)) chips.push(pill('Biogas', r.biogaspotentieel_m3_per_ton, ' m³/t'));
  return chips.join('') || '<span class="muted">—</span>';
}
function pill(label, val, suf){
  const v = Number(val);
  const t = Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
  return `<span class="pill"><span class="pill-k">${label}</span><span class="pill-v">${t}${suf||''}</span></span>`;
}
function isNum(x){ const n = Number(x); return Number.isFinite(n); }

function prettyKind(cat, type){
  const nice = String(cat || '').replace(/_/g, ' ');
  return `${escapeHtml(cap(nice))} / ${escapeHtml(cap(type || ''))}`;
}
function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }

function fmtEditSigned(v){
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n).toFixed(2).replace('.', ',');
  return (n < 0 ? '-' : '') + abs;
}
function fmtInt(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n));
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function renderBadge(status){
  const map = { in_behandeling:'gray', gepubliceerd:'green', afgewezen:'red' };
  const cls = map[status] || 'gray';
  const label = String(status || '').replace(/_/g, ' ');
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}
function renderFileChip(hasFile){
  return hasFile
    ? `<span class="chip ok"><span class="dot"></span> aanwezig</span>`
    : `<span class="chip none"><span class="dot"></span> geen bestand</span>`;
}

/* === INLINE EDITS (cards) — autosave + strikte validatie === */

const SAVE_DEBOUNCE_MS = 450;
const saveTimers = new Map(); // per card-id

// UI-format voor prijs: ± en altijd 2 dec, komma
function formatPriceDisplay(val) {
  const n = (typeof val === 'number') ? val : parseSignedPrice2dec(String(val));
  if (n === null) return '';
  const abs = Math.abs(n).toFixed(2).replace('.', ',');
  return (n < 0 ? '-' : '') + abs;
}

// Live input-masks (prijs/ton/postcode)
function attachMasks(elPrice, elTon, elPC) {
  // prijs
  elPrice?.addEventListener('input', () => {
    let s = (elPrice.value || '')
      .replace(/\./g, ',')          // punt -> komma
      .replace(/[^0-9,\-]/g, '');   // alleen -, cijfers, komma
    s = s.replace(/(?!^)-/g, '');   // '-' alleen vooraan
    const i = s.indexOf(',');
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, ''); // max 1 komma
    elPrice.value = s;
  });
  elPrice?.addEventListener('blur', () => {
    const n = parseSignedPrice2dec(elPrice.value);
    if (n !== null) elPrice.value = formatPriceDisplay(n);
  });

  // ton
  elTon?.addEventListener('input', () => {
    elTon.value = (elTon.value || '').replace(/\D/g, '');
  });

  // postcode
  elPC?.addEventListener('input', () => {
    const raw = elPC.value || '';
    const digits  = raw.replace(/\D/g, '').slice(0, 4);
    const letters = raw.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
    elPC.value = digits + (letters ? ' ' + letters : '');
  });
  elPC?.addEventListener('blur', () => {
    if (isValidPostcode(elPC.value)) elPC.value = formatPostcode(elPC.value);
  });
}

// Debounced autosave om DB-spam te voorkomen (niet gebruikt door ✓-save, maar beschikbaar)
function scheduleSave(id, elPrice, elTon, elPC, btnDel) {
  if (saveTimers.has(id)) clearTimeout(saveTimers.get(id));
  const t = setTimeout(async () => {
    const { ok, priceSigned, tonInt, pcFmt } = validateCardFields(elPrice, elTon, elPC);
    if (!ok) return;
    if (btnDel) btnDel.disabled = true;
    const { error } = await supabase
      .from('mest_uploads')
      .update({ inkoopprijs_per_ton: priceSigned, aantal_ton: tonInt, postcode: pcFmt })
      .eq('id', id);
    if (btnDel) btnDel.disabled = false;
    if (error) toast('Opslaan mislukt: ' + error.message, 'error');
  }, SAVE_DEBOUNCE_MS);
  saveTimers.set(id, t);
}

function validateCardFields(elPrice, elTon, elPC) {
  let ok = true;
  [elPrice, elTon, elPC].forEach(clearInlineError);

  const priceSigned = parseSignedPrice2dec(elPrice.value);
  if (priceSigned === null || !Number.isFinite(priceSigned)) {
    showInlineError(elPrice, 'Bedrag ongeldig. Gebruik een komma en max. 2 decimalen.');
    ok = false;
  } else {
    elPrice.value = formatPriceDisplay(priceSigned);
  }

  const tonInt = parseIntStrict(elTon.value);
  if (tonInt === null || tonInt <= 24) {
    showInlineError(elTon, 'Alleen hele aantallen > 24.');
    ok = false;
  } else {
    elTon.value = String(tonInt);
  }

  let pcFmt = null;
  if (!isValidPostcode(elPC.value)) {
    showInlineError(elPC, 'Ongeldige NL postcode.');
    ok = false;
  } else {
    pcFmt = formatPostcode(elPC.value);
    elPC.value = pcFmt;
  }

  return { ok, priceSigned, tonInt, pcFmt };
}

// Verwijderen via X linksboven
async function deleteRow(id) {
  if (!confirm('Weet je zeker dat je dit item wilt verwijderen?')) return;
  const { error } = await supabase.from('mest_uploads').delete().eq('id', id);
  if (error) toast('Verwijderen mislukt: ' + error.message, 'error');
  else {
    const card = myUploads.querySelector(`.upload-card[data-id="${id}"]`);
    if (card) card.remove();
    toast('Verwijderd', 'success');
  }
}

// === BINDER ===
/* --- inline acties (autosave op blur + delete-linksboven) --- */
function bindUploadActions(rows){
  rows.forEach(r => {
    const card  = myUploads.querySelector(`.upload-card[data-id="${r.id}"]`);
    if (!card) return;

    const elP    = card.querySelector('.e-prijs');
    const elT    = card.querySelector('.e-ton');
    const elPC   = card.querySelector('.e-postcode');
    const elName = card.querySelector('.e-naam');  // optioneel
    const btnDel = card.querySelector('.a-del');
    const btnSave= card.querySelector('.a-save');

    attachMasks(elP, elT, elPC);

    // helpers
    const markDirty = () => {
      card.classList.add('is-dirty');
      card.classList.remove('is-saved');
      clearInlineError(elP); clearInlineError(elT); clearInlineError(elPC);
      if (elName) clearInlineError(elName);
    };
    const beginSave = () => { card.classList.add('is-saving'); btnSave?.setAttribute('disabled',''); };
    const endSave   = () => { card.classList.remove('is-saving'); btnSave?.removeAttribute('disabled'); };

    // elke wijziging -> toon ✓
    ['input','change'].forEach(ev => {
      elP?.addEventListener(ev, markDirty);
      elT?.addEventListener(ev, markDirty);
      elPC?.addEventListener(ev, markDirty);
      elName?.addEventListener(ev, markDirty);
    });

    // nette formatting op blur (geen save!)
    elP?.addEventListener('blur', () => {
      const n = parseSignedPrice2dec(elP.value);
      if (n == null) return; // foutmelding pas bij save
      const abs = Math.abs(n).toFixed(2).replace('.', ',');
      elP.value = (n < 0 ? '-' : '') + abs;
    });
    elT?.addEventListener('blur', () => {
      const t = parseIntStrict(elT.value);
      if (t == null) return;
      elT.value = String(t);
    });
    elPC?.addEventListener('blur', () => {
      if (!isValidPostcode(elPC.value)) return;
      elPC.value = formatPostcode(elPC.value);
    });
    elName?.addEventListener('blur', () => { elName.value = (elName.value || '').trim(); });

    // SAVE via ✓
    btnSave?.addEventListener('click', async () => {
      let ok = true;
      clearInlineError(elP); clearInlineError(elT); clearInlineError(elPC);
      if (elName) clearInlineError(elName);

      // prijs
      const priceSigned = parseSignedPrice2dec(elP.value);
      if (priceSigned === null || !Number.isFinite(priceSigned)) {
        showInlineError(elP,'Bedrag (±) met max 2 decimalen.');
        ok = false;
      } else {
        const abs = Math.abs(priceSigned).toFixed(2).replace('.', ',');
        elP.value = (priceSigned < 0 ? '-' : '') + abs;
      }

      // ton
      const tonInt = parseIntStrict(elT.value);
      if (tonInt === null || tonInt <= 24) {
        showInlineError(elT,'Alleen hele aantallen > 24.');
        ok = false;
      } else {
        elT.value = String(tonInt);
      }

      // postcode
      if (!isValidPostcode(elPC.value)) {
        showInlineError(elPC,'Ongeldige NL postcode.');
        ok = false;
      } else {
        elPC.value = formatPostcode(elPC.value);
      }

      // (optioneel) naam
      let nameTrim = null;
      if (elName) {
        nameTrim = (elName.value || '').trim();
        if (nameTrim.length < 2 || nameTrim.length > 25) {
          showInlineError(elName,'2–25 tekens.');
          ok = false;
        } else {
          elName.value = nameTrim;
        }
      }

      if (!ok) {
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 300);
        return;
      }

      beginSave();
      const patch = {
        inkoopprijs_per_ton: priceSigned,
        aantal_ton: tonInt,
        postcode: elPC.value,
        ...(elName ? { naam: nameTrim } : {})
      };
      const okSave = await patchRow(r.id, patch, { silent:true });
      endSave();

      if (okSave) {
        // titel live bijwerken als naam gewijzigd is
        if (elName) {
          const tEl = card.querySelector('.title');
          if (tEl) { tEl.textContent = elName.value || 'mest'; tEl.title = tEl.textContent; }
        }
        card.classList.remove('is-dirty');
        card.classList.add('is-saved');
        setTimeout(() => card.classList.remove('is-saved'), 1200);
      }
    });

    // VERWIJDER (X)
    btnDel?.addEventListener('click', async () => {
      if (!confirm('Dit item verwijderen?')) return;
      const { error } = await supabase.from('mest_uploads').delete().eq('id', r.id);
      if (error) toast('Verwijderen mislukt: ' + error.message, 'error');
      else { await loadMyUploads(); }
    });
  });
}

/** Patch helper */
async function patchRow(id, patch, { silent=false } = {}){
  const { error } = await supabase.from('mest_uploads').update(patch).eq('id', id);
  if (error) {
    toast('Opslaan mislukt: ' + error.message, 'error');
    return false;
  }
  if (!silent) { /* optionele feedback */ }
  return true;
}
