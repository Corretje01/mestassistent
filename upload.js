// upload.js — autosave, inline titel-edit, analyse vervangen, reden-popover + status reset
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
const elPriceSign = document.getElementById('priceSign');

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
let mestsoortenObj = {};
let selectedCat = null;
let selectedType = null;

/* ========================
   WIZARD: stappen tonen/verbergen
======================== */
const stepSections = Array.from(document.querySelectorAll('#uploadForm .form-section'));
const actionsRow   = document.querySelector('#uploadForm .actions');

// Alles na Stap 1 (dus 2..5) + actierij (= submit-knop) verbergen/toonbaar maken
const advancedBlocks = stepSections.slice(1);
if (actionsRow) advancedBlocks.push(actionsRow);

function setDisabledWithin(el, disabled){
  if (!el) return;
  el.querySelectorAll('input, select, textarea, button').forEach(n => {
    n.disabled = disabled;
  });
}

function toggleAdvancedSteps(show){
  advancedBlocks.forEach(block => {
    if (!block) return;
    block.hidden = !show;             // verbergt/tonen hele sectie
    setDisabledWithin(block, !show);  // geen focus/validatie/tabben zolang verborgen
  });
}

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

  // vraagprijs-teken standaard NEGATIEF
  initPriceSignToggle('neg');

  // mestsoorten + UI
  await renderMestChoices();

  // wizard init: verberg stappen 2..5 + submit
  toggleAdvancedSteps(false);

  // formulier events
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

    attachMestToggleHandlers('#mestChoiceList');
  } catch (e) {
    console.error(e);
    listContainer.innerHTML = `<div class="message error">Kon mestsoorten niet laden.</div>`;
  }
}

function toObjectShapedMest(raw){
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (Array.isArray(raw)) {
    const obj = {};
    for (const m of raw) {
      const cat = m?.categorie; const typ = m?.type;
      if (!cat || !typ) continue;
      (obj[cat] ||= {})[typ] = m;
    }
    return obj;
  }
  return {};
}

function attachMestToggleHandlers(containerSel = '#mestChoiceList'){
  const root = document.querySelector(containerSel);
  if (!root) return;

  root.querySelectorAll('input[type="radio"][name="mest_one"]').forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) {
        selectedCat  = r.dataset.cat || null;
        selectedType = r.dataset.type || null;
        clearInlineError(listContainer);

        if (selectedCat && selectedType) {
          applyDefaultsFromSelection(selectedCat, selectedType);
          toggleAdvancedSteps(true);  // ✅ toon stappen 2..5 + submit
        }
      } else {
        // deselect → alles weer dichtklappen
        selectedCat  = null;
        selectedType = null;
        toggleAdvancedSteps(false);   // ✅ verberg stappen 2..5 + submit
      }
    });
  });

  // Toggle-deselect via klik op label (bestond al)
  root.querySelectorAll('input[type="radio"][name="mest_one"]').forEach(r => {
    const lbl = root.querySelector(`label[for="${r.id}"]`);
    if (!lbl) return;
    lbl.addEventListener('click', (ev) => {
      if (r.checked) {
        ev.preventDefault();
        r.checked = false;
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
   BESTANDSANALYSE (optioneel bij formulier)
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
   SUBMIT (formulier – bestand optioneel)
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
      status: 'in_behandeling',
      moderation_note: null
    };

    const { error: insErr } = await supabase.from('mest_uploads').insert(payload);
    if (insErr) throw insErr;

    toast('Upload opgeslagen. Status: In behandeling.', 'success');

    // Reset UI
    form.reset();
    [elDS, elN, elP, elK, elOS, elBio].forEach(i => i.value = '');
    selectedCat = null; selectedType = null;
    await renderMestChoices();
    toggleAdvancedSteps(false);

    cbUseProfile.checked = !!profilePostcodeNow;
    wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';
    initPriceSignToggle('neg');

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
   Overzicht "Mijn uploads" — kaartjes + AUTOSAVE + reden-popover
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
    myUploads.classList.add('uploads-grid');
    myUploads.appendChild(renderUploadsGrid(data));
    bindUploadActions(data);
  } catch (e) {
    console.error(e);
    myUploads.textContent = 'Kon jouw uploads niet ophalen.';
  }
}

function renderUploadsGrid(rows) {
  const grid = document.getElementById('myUploads');
  if (!grid) return;
  grid.innerHTML = '';            // leegmaken
  rows.forEach(rowEl => grid.appendChild(rowEl)); // kaarten direct erin
}

function renderBadge(status){
  const map = { in_behandeling:'gray', gepubliceerd:'green', afgewezen:'red' };
  const cls = map[status] || 'gray';
  const label = String(status || '').replace(/_/g, ' ');
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderUploadCard(r){
  const tpl = document.getElementById('tpl-upload-card');
  const frag = tpl.content.cloneNode(true);
  const article = frag.querySelector('article');
  article.dataset.id = r.id;

  // Header: Titel + status (+ info knop als reden bestaat en niet "geaccepteerd")
  const titleEl = frag.querySelector('.title');
  const safeName = r.naam || 'mest';
  titleEl.textContent = safeName;
  titleEl.title = 'Klik om naam te wijzigen';
  titleEl.setAttribute('data-original', safeName);
  titleEl.setAttribute('contenteditable', 'false');

  const statusWrap = document.createElement('div');
  statusWrap.className = 'status-wrap';
  statusWrap.innerHTML = `<div class="status">${renderBadge(r.status)}</div>`;

  // reden tonen als aanwezig & niet "geaccepteerd" (localStorage)
  const note = (r.moderation_note || '').trim();
  const showNote = !!note && !isReasonAcknowledged(r.id, note);
  if (showNote) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'status-info-btn';
    btn.setAttribute('aria-label','Reden tonen');
    btn.title = 'Reden tonen';
    btn.textContent = 'i';
    statusWrap.appendChild(btn);

    // knop exact even groot als de chip
    const chipEl = statusWrap.querySelector('.badge');
    if (chipEl) syncInfoButtonSize(chipEl, btn);

    // popover container (hidden, appended to article)
    const pop = document.createElement('div');
    pop.className = 'reason-popover';
    pop.hidden = true;
    pop.innerHTML = `
      <h4 class="reason-popover__title">Toelichting ${escapeHtml(r.status.replace('_',' '))}</h4>
      <p class="reason-popover__text">${escapeHtml(note)}</p>
      <div class="reason-popover__actions">
        <button type="button" class="btn-ghost js-close">Sluiten</button>
        <button type="button" class="btn-primary js-ack">Accepteer</button>
      </div>
    `;
    article.appendChild(pop);

    const open = () => { pop.hidden = false; openPopover = pop; document.addEventListener('click', onDocClick, true); document.addEventListener('keydown', onEsc, true); };
    const close= () => { pop.hidden = true; if (openPopover===pop) openPopover = null; document.removeEventListener('click', onDocClick, true); document.removeEventListener('keydown', onEsc, true); };
    const onDocClick = (ev) => {
      if (pop.hidden) return;
      if (pop.contains(ev.target) || btn.contains(ev.target)) return;
      close();
    };
    const onEsc = (ev) => { if (ev.key === 'Escape') close(); };

    btn.addEventListener('click', (e)=>{ e.stopPropagation(); pop.hidden ? open() : close(); });
    pop.querySelector('.js-close')?.addEventListener('click', close);
    pop.querySelector('.js-ack')?.addEventListener('click', () => {
      markReasonAcknowledged(r.id, note);
      close();
      // verwijder knop en popover visueel
      btn.remove(); pop.remove();
    });
  }

  // plaats statusWrap in header
  const head = frag.querySelector('.upload-card__head');
  head.querySelector('.status').replaceWith(statusWrap);

  // Meta
  frag.querySelector('.js-kind').innerHTML = prettyKind(r.mest_categorie, r.mest_type);
  frag.querySelector('.js-analysis').innerHTML = renderAnalysisChips(r);
  const fileCell = frag.querySelector('.js-filechip');
  fileCell.innerHTML = renderFileChip(!!r.file_path);

  // “Voeg/Wijzig analyse”
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'a-fileedit';
  btn.textContent = r.file_path ? 'Wijzig analyse' : 'Voeg analyse toe';
  btn.style.cssText = 'margin-left:.5rem;font-size:.9rem;text-decoration:underline;background:none;border:0;padding:0;cursor:pointer;';
  fileCell.appendChild(btn);

  const hidden = document.createElement('input');
  hidden.type = 'file';
  hidden.accept = '.pdf,.png,.jpg,.jpeg';
  hidden.className = 'e-file';
  hidden.style.display = 'none';
  hidden.dataset.prevPath = r.file_path || '';
  article.appendChild(hidden);

  // Velden
  const prijs = frag.querySelector('.e-prijs');
  const ton   = frag.querySelector('.e-ton');
  const pc    = frag.querySelector('.e-postcode');

  const prijsVal = fmtEditSigned(r.inkoopprijs_per_ton);
  const tonVal   = fmtInt(r.aantal_ton);
  const pcVal    = r.postcode || '';

  if (prijs){ prijs.value = prijsVal; prijs.setAttribute('value', prijsVal); }
  if (ton){   ton.value   = tonVal;   ton.setAttribute('value', tonVal); }
  if (pc){    pc.value    = pcVal;    pc.setAttribute('value', pcVal); }

  return article;
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
function renderFileChip(hasFile){
  return hasFile
    ? `<span class="chip ok"><span class="dot"></span> aanwezig</span>`
    : `<span class="chip none"><span class="dot"></span> geen bestand</span>`;
}

/* === AUTOSAVE infra === */

const SAVE_DEBOUNCE_MS = 500;
const saveTimers = new Map(); // key: card-id -> timeout id

function debouncedSave(cardId, fn){
  if (saveTimers.has(cardId)) clearTimeout(saveTimers.get(cardId));
  const t = setTimeout(fn, SAVE_DEBOUNCE_MS);
  saveTimers.set(cardId, t);
}

function beginCardSave(card){ card?.classList.add('is-saving'); }
function endCardSave(card){ card?.classList.remove('is-saving'); card?.classList.add('is-saved'); setTimeout(()=>card?.classList.remove('is-saved'), 900); }

/* === Reden-acknowledge opslag (client) === */

function reasonKey(id, note){
  // note-hash (simpele djb2)
  let h = 5381; const s = String(note);
  for (let i=0;i<s.length;i++) h = ((h<<5)+h) + s.charCodeAt(i);
  return `mest.reason.ack.${id}.${h>>>0}`;
}
function isReasonAcknowledged(id, note){
  try { return localStorage.getItem(reasonKey(id, note)) === '1'; } catch { return false; }
}
function markReasonAcknowledged(id, note){
  try { localStorage.setItem(reasonKey(id, note), '1'); } catch {}
}
function clearAllReasonAcksFor(id){
  // bij nieuwe analyse oude acks ongeldig maken (ruw: verwijder keys die op dit id matchen)
  try {
    const prefix = `mest.reason.ack.${id}.`;
    const keys = Object.keys(localStorage);
    keys.forEach(k => { if (k.startsWith(prefix)) localStorage.removeItem(k); });
  } catch {}
}

// Maakt het i-icoon exact even hoog als de status-chip; blijft up-to-date bij resizes.
function syncInfoButtonSize(chipEl, btn){
  if (!chipEl || !btn) return;

  const apply = () => {
    const rect = chipEl.getBoundingClientRect();
    const h = Math.round(rect.height);
    if (h && Number.isFinite(h)) {
      btn.style.width  = h + 'px';
      btn.style.height = h + 'px';
    }
  };

  // Direct toepassen
  apply();

  // Realtime volgen
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(apply);
    ro.observe(chipEl);
    const cleanup = () => { try { ro.disconnect(); } catch {} };
    btn.addEventListener('remove', cleanup, { once:true });
  } else {
    window.addEventListener('resize', apply);
  }
}

/* === BINDER === */
function bindUploadActions(rows){
  rows.forEach(r => {
    const card  = myUploads.querySelector(`.upload-card[data-id="${r.id}"]`);
    if (!card) return;

    const titleEl = card.querySelector('.title');
    const elP     = card.querySelector('.e-prijs');
    const elT     = card.querySelector('.e-ton');
    const elPC    = card.querySelector('.e-postcode');
    const btnEdit = card.querySelector('.a-fileedit');
    const hidFile = card.querySelector('.e-file');
    const chipBox = card.querySelector('.js-filechip');

    // ---------- Titel/Naam: inline edit + autosave ----------
    (function initInlineTitleEdit(){
      if (!titleEl) return;
      const maxLen = 25, minLen = 2;

      const startEdit = () => {
        titleEl.classList.add('is-editing');
        titleEl.setAttribute('contenteditable','true');
        placeCaretAtEnd(titleEl);
      };
      const cancelEdit = () => {
        titleEl.textContent = titleEl.getAttribute('data-original') || 'mest';
        titleEl.classList.remove('is-editing');
        titleEl.setAttribute('contenteditable','false');
      };
      const commitEdit = async () => {
        const raw = (titleEl.textContent || '').trim();
        const prev = titleEl.getAttribute('data-original') || '';
        titleEl.classList.remove('is-editing');
        titleEl.setAttribute('contenteditable','false');
        if (raw === prev) return;
        if (raw.length < minLen || raw.length > maxLen) {
          toast(`Naam moet ${minLen}–${maxLen} tekens zijn.`, 'error');
          titleEl.textContent = prev || 'mest';
          return;
        }
        beginCardSave(card);
        const ok = await patchRow(r.id, { naam: raw }, { silent:true });
        endCardSave(card);
        if (ok) titleEl.setAttribute('data-original', raw);
        else titleEl.textContent = prev || 'mest';
      };

      titleEl.addEventListener('click', () => {
        if (titleEl.getAttribute('contenteditable') === 'true') return;
        startEdit();
      });
      titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      });
      titleEl.addEventListener('blur', commitEdit);

      function placeCaretAtEnd(el){
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      }
    })();

    // ---------- Prijs/Ton/Postcode: input mask + autosave ----------
    attachMasks(elP, elT, elPC);

    const planSave = () => {
      card.classList.add('is-dirty');
      debouncedSave(r.id, async () => {
        let ok = true;
        [elP, elT, elPC].forEach(clearInlineError);

        const priceSigned = parseSignedPrice2dec(elP.value);
        if (priceSigned === null || !Number.isFinite(priceSigned)) {
          showInlineError(elP,'Bedrag (±) met max 2 decimalen.');
          ok = false;
        } else {
          const abs = Math.abs(priceSigned).toFixed(2).replace('.', ',');
          elP.value = (priceSigned < 0 ? '-' : '') + abs;
        }

        const tonInt = parseIntStrict(elT.value);
        if (tonInt === null || tonInt <= 24) {
          showInlineError(elT,'Alleen hele aantallen > 24.');
          ok = false;
        } else {
          elT.value = String(tonInt);
        }

        if (!isValidPostcode(elPC.value)) {
          showInlineError(elPC,'Ongeldige NL postcode.');
          ok = false;
        } else {
          elPC.value = formatPostcode(elPC.value);
        }

        if (!ok) { card.classList.add('shake'); setTimeout(()=>card.classList.remove('shake'), 300); return; }

        const patch = {};
        if (elP.value !== elP.getAttribute('value')) patch.inkoopprijs_per_ton = parseSignedPrice2dec(elP.value);
        if (elT.value !== elT.getAttribute('value')) patch.aantal_ton = Number(elT.value);
        if (elPC.value !== elPC.getAttribute('value')) patch.postcode = elPC.value;

        if (Object.keys(patch).length === 0) { card.classList.remove('is-dirty'); return; }

        beginCardSave(card);
        const okSave = await patchRow(r.id, patch, { silent:true });
        endCardSave(card);

        if (okSave) {
          elP.setAttribute('value', elP.value);
          elT.setAttribute('value', elT.value);
          elPC.setAttribute('value', elPC.value);
          card.classList.remove('is-dirty');
        }
      });
    };

    ['input','change','blur'].forEach(ev => {
      elP?.addEventListener(ev, planSave);
      elT?.addEventListener(ev, planSave);
      elPC?.addEventListener(ev, planSave);
    });

    // ---------- Analyse: toevoegen/wijzigen (status → in_behandeling) ----------
    if (btnEdit && hidFile) {
      btnEdit.addEventListener('click', () => hidFile.click());
      hidFile.addEventListener('change', async () => {
        const file = hidFile.files?.[0];
        if (!file) return;
        if (!isFileAllowed(file)) { toast('Alleen PDF/JPG/PNG en max 10MB.', 'error'); hidFile.value=''; return; }

        btnEdit.disabled = true;
        const prevText = btnEdit.textContent;
        btnEdit.textContent = 'Uploaden…';

        try {
          const now = new Date();
          const ext  = (file.name?.split('.').pop() || 'bin').toLowerCase();
          const uuid = makeUUID();
          const newPath = `${userId}/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${uuid}.${ext}`;
          const mime = file.type || 'application/octet-stream';

          const { error: upErr } = await supabase.storage.from('mest-analyses').upload(newPath, file, { contentType: mime, upsert: false });
          if (upErr) throw upErr;

          // oude bestand verwijderen (best-effort)
          const oldPath = hidFile.dataset.prevPath;
          if (oldPath) { try { await supabase.storage.from('mest-analyses').remove([oldPath]); } catch(_) {} }

          // Belangrijk: status resetten, reden wissen
          beginCardSave(card);
          const ok = await patchRow(r.id, {
            file_path: newPath,
            file_mime: mime,
            status: 'in_behandeling',
            moderation_note: null
          }, { silent:true });
          endCardSave(card);
          if (!ok) throw new Error('Opslaan in database mislukt');

          // UI bijwerken
          clearAllReasonAcksFor(r.id);
          hidFile.dataset.prevPath = newPath;
          if (chipBox) chipBox.innerHTML = renderFileChip(true);

          // update statuschip-live
          const statusWrap = card.querySelector('.status-wrap');
          if (statusWrap) statusWrap.innerHTML = `<div class="status">${renderBadge('in_behandeling')}</div>`;
          btnEdit.textContent = 'Wijzig analyse';
          toast('Analyse geüpdatet. Status: In behandeling.', 'success');
        } catch (e) {
          console.error(e);
          toast('Upload mislukt: ' + (e?.message || e), 'error');
          btnEdit.textContent = prevText;
        } finally {
          btnEdit.disabled = false;
        }
      });
    }

    // VERWIJDER (X)
    card.querySelector('.a-del')?.addEventListener('click', async () => {
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
  if (!silent) { /* optioneel feedback */ }
  return true;
}

/* Masks voor kaartvelden */
function attachMasks(elPrice, elTon, elPC) {
  elPrice?.addEventListener('input', () => {
    let s = (elPrice.value || '')
      .replace(/\./g, ',')
      .replace(/[^0-9,\-]/g, '');
    s = s.replace(/(?!^)-/g, '');
    const i = s.indexOf(',');
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
    elPrice.value = s;
  });
  elPrice?.addEventListener('blur', () => {
    const n = parseSignedPrice2dec(elPrice.value);
    if (n !== null) {
      const abs = Math.abs(n).toFixed(2).replace('.', ',');
      elPrice.value = (n < 0 ? '-' : '') + abs;
    }
  });

  elTon?.addEventListener('input', () => {
    elTon.value = (elTon.value || '').replace(/\D/g, '');
  });

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

/* Open popovers management (max 1 open tegelijk) */
let openPopover = null;
