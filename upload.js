// upload.js — single-select mestsoort + defaults uit mestsoorten.json + optioneel bestand + compacte kaarten UI
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
const elPriceSign = document.getElementById('priceSign'); // 'pos' | 'neg' (optioneel; via ±-toggle in HTML)

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
let mestsoortenObj = {};    // verwacht: { drijfmest: { koe:{...}, varken:{...} }, vaste_mest: {...}, ... }
let selectedCat = null;     // 'drijfmest' | 'vaste_mest' | 'dikke_fractie' | 'overig'
let selectedType = null;    // 'koe' | 'varken' | 'compost' | ...

/* ========================
   INIT
======================== */
(async function init(){
  // auth
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

  // postcode default
  const profilePostcode = getProfilePostcode();
  cbUseProfile.checked = !!profilePostcode;
  wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';
  cbUseProfile.addEventListener('change', () => {
    wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';
    if (!cbUseProfile.checked) elPostcode?.focus();
  });

  // vraagprijs-teken standaard NEGATIEF
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
   PRICE SIGN TOGGLE (optioneel)
======================== */
function initPriceSignToggle(defaultMode='neg'){
  if (elPriceSign) elPriceSign.value = defaultMode;
  const wrap = document.querySelector('[data-role="price-sign"]');
  if (!wrap) return; // UI niet aanwezig, alleen hidden value gezet
  const bPos = wrap.querySelector('button[data-sign="pos"]');
  const bNeg = wrap.querySelector('button[data-sign="neg"]');

  const setSign = (mode) => {
    if (elPriceSign) elPriceSign.value = mode;
    bPos?.setAttribute('aria-pressed', String(mode === 'pos'));
    bNeg?.setAttribute('aria-pressed', String(mode === 'neg'));
  };

  bPos?.addEventListener('click', () => setSign('pos'));
  bNeg?.addEventListener('click', () => setSign('neg'));

  // start op default
  setSign(defaultMode);
}

/* ========================
   MEST KEUZE UI (single-select)
======================== */
function labelCategorie(c){
  const map = {
    drijfmest:'Drijfmest',
    vaste_mest:'Vaste mest',
    dikke_fractie:'Dikke fractie',
    overig:'Overig'
  };
  return map[c] || (c?.replace(/_/g,' ') || '');
}
function labelType(t){ return t ? t.charAt(0).toUpperCase()+t.slice(1) : ''; }

async function renderMestChoices(){
  try {
    const resp = await fetch('data/mestsoorten.json', { cache: 'no-store' }); // <— relative path
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();

    // verwacht objectvorm; array wordt omgezet naar { cat: { type: true } }
    mestsoortenObj = toObjectShapedMest(raw);

    // volgorde
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

    // change → selecteren + defaults invullen (alleen analyse-velden)
    listContainer.querySelectorAll('input[name="mest_one"]').forEach(r => {
      r.addEventListener('change', () => {
        selectedCat  = r.dataset.cat;
        selectedType = r.dataset.type;
        clearInlineError(listContainer);
        applyDefaultsFromSelection(selectedCat, selectedType);
      });
    });

  } catch (e) {
    console.error(e);
    listContainer.innerHTML = `<div class="message error">Kon mestsoorten niet laden.</div>`;
  }
}

// normaliseer naar objectvorm; als array, gebruik alleen namen
function toObjectShapedMest(raw){
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw; // al goed
  }
  if (Array.isArray(raw)) {
    const obj = {};
    for (const m of raw) {
      const cat = m?.categorie; const typ = m?.type;
      if (!cat || !typ) continue;
      (obj[cat] ||= {})[typ] = true;
    }
    return obj;
  }
  return {};
}

/* ========================
   DEFAULTS op basis van keuze (alleen analyse)
======================== */
function applyDefaultsFromSelection(cat, type){
  if (!cat || !type) return;
  const node = mestsoortenObj?.[cat]?.[type];
  if (!node || typeof node !== 'object') return;

  // haal tolerant (case-insensitive) de velden op
  const ds   = pickNum(node, ['ds_percent','DS_percent']);
  const n    = pickNum(node, ['n_kg_per_ton','N_kg_per_ton']);
  const p    = pickNum(node, ['p_kg_per_ton','P_kg_per_ton']);
  const k    = pickNum(node, ['k_kg_per_ton','K_kg_per_ton']);
  const os   = pickNum(node, ['os_percent','OS_percent']);
  const bio  = pickNum(node, ['biogaspotentieel_m3_per_ton','Biogaspotentieel_m3_per_ton']);

  // zet read-only velden (lege string als null)
  elDS.value  = numToRO(ds);
  elN.value   = numToRO(n);
  elP.value   = numToRO(p);
  elK.value   = numToRO(k);
  elOS.value  = numToRO(os);
  elBio.value = numToRO(bio);

  // GEEN prijs/ton of aantal ton invullen!
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
  if (!file) return; // bestand is optioneel
  if (!isFileAllowed(file)) {
    showInlineError(elFile, 'Alleen PDF/JPG/PNG en max 10MB.');
    return;
  }
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
  // 1) ±-toggle aanwezig?
  if (elPriceSign) {
    const raw = parsePrice2dec(elPrijs.value);    // leest "12,50" → 12.5
    if (raw === null) return null;
    return (elPriceSign.value === 'neg') ? -raw : raw;
  }
  // 2) fallback: teken in veld (bv. "-12,50")
  const signed = parseSignedPrice2dec(elPrijs.value);
  return signed === null ? null : signed;
}

/* ========================
   SUBMIT
======================== */
async function onSubmit(e){
  e.preventDefault();
  let ok = true;
  [elNaam, elFile, elPrijs, elTon, elPostcode, listContainer].forEach(clearInlineError);

  // Naam
  if (!elNaam.value || elNaam.value.trim().length < 2 || elNaam.value.trim().length > 60) {
    showInlineError(elNaam, '2–60 tekens.');
    ok = false;
  }

  // Mestsoort
  if (!selectedCat || !selectedType) {
    showInlineError(listContainer, 'Kies een mestsoort.');
    ok = false;
  }

  // Bestand (optioneel): valideer alléén als ingevuld
  const file = elFile.files?.[0];
  if (file && !isFileAllowed(file)) {
    showInlineError(elFile, 'Ongeldig bestand (alleen PDF/JPG/PNG, max 10MB).');
    ok = false;
  }

  // Prijs (±, max 2 dec) — 0 is toegestaan
  const signedPrice = getSignedPriceFromUI();
  if (signedPrice === null || !Number.isFinite(signedPrice)) {
    showInlineError(elPrijs, 'Ongeldig bedrag (max 2 decimalen).');
    ok = false;
  }

  // Ton (integer > 24)
  const tonInt = parseIntStrict(elTon.value);
  if (tonInt === null || tonInt <= 24) {
    showInlineError(elTon, 'Alleen hele aantallen > 24.');
    ok = false;
  }

  // Postcode
  let postcodeVal = null;
  const profilePostcodeNow = getProfilePostcode();
  if (cbUseProfile.checked) {
    if (profilePostcodeNow) {
      postcodeVal = formatPostcode(profilePostcodeNow);
    } else {
      wrapPostcode.style.display = 'block';
      cbUseProfile.checked = false;
      showInlineError(elPostcode, 'Geen postcode in profiel. Vul handmatig in.');
      ok = false;
    }
  } else {
    if (!isValidPostcode(elPostcode.value)) {
      showInlineError(elPostcode,'Ongeldige NL postcode.');
      ok=false;
    } else {
      postcodeVal = formatPostcode(elPostcode.value);
    }
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
      const { error: upErr } = await supabase.storage
        .from('mest-analyses')
        .upload(path, file, { contentType: mime, upsert: false });
      if (upErr) throw upErr;
    }

    // 2) Insert mest_uploads (let op lowercase kolommen)
    const payload = {
      user_id: userId,
      naam: elNaam.value.trim(),
      mest_categorie: selectedCat,     // bv. 'vaste_mest'
      mest_type: selectedType,         // bv. 'koe'
      file_path: path,                 // kan null zijn
      file_mime: mime,                 // kan null zijn
      postcode: postcodeVal,
      inkoopprijs_per_ton: signedPrice,   // ± prijs
      aantal_ton: tonInt,                 // integer
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

    // Reset
    form.reset();
    [elDS, elN, elP, elK, elOS, elBio].forEach(i => i.value = '');
    selectedCat = null; selectedType = null;
    await renderMestChoices();

    cbUseProfile.checked = !!profilePostcodeNow;
    wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';
    if (elPriceSign) elPriceSign.value = 'neg';  // default teken blijft negatief
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
   Overzicht "Mijn uploads" — COMPACTE KAARTEN
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

    myUploads.innerHTML = renderUploadsGrid(data);
    bindUploadActions(data);
  } catch (e) {
    console.error(e);
    myUploads.textContent = 'Kon jouw uploads niet ophalen.';
  }
}

function renderUploadsGrid(rows){
  return `
    <div class="uploads-grid">
      ${rows.map(r => renderUploadCard(r)).join('')}
    </div>
  `;
}

function renderUploadCard(r){
  const hasFile = !!r.file_path;
  const analysis = formatAnalysis(r); // korte weergave
  return `
    <article class="upload-card" data-id="${r.id}">
      <header class="upload-card__head">
        <div class="title" title="${escapeHtml(r.naam)}">${escapeHtml(r.naam)}</div>
        <div class="status">${renderBadge(r.status)}</div>
      </header>

      <div class="upload-card__meta">
        <div class="meta-row">
          <span class="meta-label">Mestsoort</span>
          <span class="meta-value" title="${escapeHtml(prettyKind(r.mest_categorie, r.mest_type))}">
            ${prettyKind(r.mest_categorie, r.mest_type)}
          </span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Analyse</span>
          <span class="meta-value" title="${escapeHtml(analysis)}">${analysis}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Bestand</span>
          <span class="meta-value">${renderFileChip(hasFile)}</span>
        </div>
      </div>

      <div class="upload-card__form">
        <label class="field-sm addon-wrap">
          <span class="label-sm">€ / ton</span>
          <span class="addon left">€</span>
          <input class="input input--sm addon-left-pad e-prijs" inputmode="decimal" placeholder="0,00"
                 value="${fmtEditSigned(r.inkoopprijs_per_ton)}">
        </label>

        <label class="field-sm addon-wrap">
          <span class="label-sm">Ton</span>
          <input class="input input--sm addon-right-pad e-ton" inputmode="numeric" placeholder="0"
                 value="${fmtInt(r.aantal_ton)}">
          <span class="addon right">t</span>
        </label>

        <label class="field-sm">
          <span class="label-sm">Postcode</span>
          <input class="input input--sm e-postcode" maxlength="7" placeholder="1234 AB"
                 value="${escapeHtml(r.postcode || '')}">
        </label>
      </div>

      <footer class="upload-card__actions">
        <button class="btn-ghost a-del" title="Verwijderen">Verwijderen</button>
        <button class="btn-primary a-save">Opslaan</button>
      </footer>
    </article>
  `;
}

// --- Helpers voor analyse-/waardeweergave in de kaarten ---
function formatAnalysis(r){
  // LET OP: gebruikt de lowercase kolommen uit je DB
  return `${fmt(r.ds_percent,'%')} • N ${fmt(r.n_kg_per_ton,' kg/t')} • P ${fmt(r.p_kg_per_ton,' kg/t')} • K ${fmt(r.k_kg_per_ton,' kg/t')}`;
}

function fmt(v, suf=''){
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? `${n}${suf}` : '—';
}

function fmtEditSigned(v){
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n).toFixed(2).replace('.', ','); // UI altijd met komma
  return (n < 0 ? '-' : '') + abs;
}

function fmtInt(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n));
}

// Alleen toevoegen als je deze NIET al ergens in je file hebt:
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

/* --- acties in kaarten --- */
function bindUploadActions(rows){
  rows.forEach(r => {
    const card  = myUploads.querySelector(`.upload-card[data-id="${r.id}"]`);
    if (!card) return;

    const btnSave = card.querySelector('.a-save');
    const btnDel  = card.querySelector('.a-del');
    const elP     = card.querySelector('.e-prijs');
    const elT     = card.querySelector('.e-ton');
    const elPC    = card.querySelector('.e-postcode');

    // nette format op blur: ± en komma met 2 dec (laat teken zoals gebruiker het intikt)
    elP?.addEventListener('blur', () => {
      const n = parseSignedPrice2dec(elP.value);
      if (n === null) return;
      const abs = Math.abs(n).toFixed(2).replace('.', ',');
      elP.value = (n < 0 ? '-' : '') + abs;
    });

    btnSave.addEventListener('click', async () => {
      let ok = true;
      [elP, elT, elPC].forEach(clearInlineError);

      // prijs (±, max 2 dec, 0 toegestaan)
      const priceSigned = parseSignedPrice2dec(elP.value);
      if (priceSigned === null) { showInlineError(elP,'Bedrag (±) met max 2 decimalen.'); ok=false; }

      // ton (integer > 0)
      const tonInt = parseIntStrict(elT.value);
      if (tonInt === null || tonInt <= 0) { showInlineError(elT,'Alleen hele aantallen > 0.'); ok=false; }

      // postcode
      if (!isValidPostcode(elPC.value)) { showInlineError(elPC,'Postcode ongeldig'); ok=false; }
      const pcFmt = formatPostcode(elPC.value);

      if (!ok) return;

      const prev = btnSave.textContent;
      btnSave.disabled = true;
      btnSave.textContent = 'Opslaan…';

      const { error } = await supabase.from('mest_uploads').update({
        inkoopprijs_per_ton: priceSigned,
        aantal_ton: tonInt,
        postcode: pcFmt
      }).eq('id', r.id);

      btnSave.disabled = false;
      btnSave.textContent = prev;

      if (error) {
        toast('Opslaan mislukt: ' + error.message, 'error');
      } else {
        toast('Bewaard', 'success');
        await loadMyUploads();
      }
    });

    btnDel.addEventListener('click', async () => {
      if (!confirm('Weet je zeker dat je dit item wilt verwijderen?')) return;
      const { error } = await supabase.from('mest_uploads').delete().eq('id', r.id);
      if (error) toast('Verwijderen mislukt: ' + error.message, 'error');
      else { toast('Verwijderd', 'success'); await loadMyUploads(); }
    });
  });
}
