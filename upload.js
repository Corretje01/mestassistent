// upload.js — compact "Mijn uploads" als kaarten + single-select mestsoort + defaults (alleen analyse) + optioneel bestand
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
const elPriceSign = document.getElementById('priceSign'); // 'pos' | 'neg' (±-toggle)

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
let mestsoortenObj = {};    // { drijfmest:{koe:{...},...}, vaste_mest:{...}, ... }
let selectedCat = null;
let selectedType = null;

// Client-side paginering voor "Mijn uploads"
let uploadsAll = [];
let uploadsPage = 1;
const PAGE_SIZE = 8;

(async function init(){
  // auth
  ({ data: { session } } = await supabase.auth.getSession());
  if (!session) {
    toast('Log eerst in om te kunnen uploaden.', 'info');
    window.location.href = 'account.html';
    return;
  }
  userId = session.user.id;

  // kleine, scoped styles voor de kaartenweergave
  ensureUploadsStyles();

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

  // mestsoorten laden + UI bouwen
  await renderMestChoices();

  // events (bestand optioneel)
  elFile.addEventListener('change', handleFileChange);
  form.addEventListener('submit', onSubmit);

  // nette prijs bij blur (2 dec + komma)
  elPrijs?.addEventListener('blur', () => {
    const v = parsePrice2dec(elPrijs.value);
    if (v !== null) elPrijs.value = formatPriceDisplay(v);
  });

  // **Standaard teken prijs = NEGATIEF**
  setPriceSignUI('neg');

  // overzicht
  await loadMyUploads();
})();

function getProfilePostcode() {
  return session?.user?.user_metadata?.postcode || profile?.postcode || null;
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
    const resp = await fetch('data/mestsoorten.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();

    // verwacht objectvorm; array → versimpelde objectvorm
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

    // change → selecteren + defaults invullen (alleen analysevelden)
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
   UI helper: ±-toggle sync
======================== */
function setPriceSignUI(mode = 'pos') {
  if (elPriceSign) elPriceSign.value = mode; // 'pos' | 'neg'
  const wrap = document.querySelector('[data-role="price-sign"]');
  if (!wrap) return;
  const pos = wrap.querySelector('button[data-sign="pos"]');
  const neg = wrap.querySelector('button[data-sign="neg"]');
  if (pos && neg) {
    pos.setAttribute('aria-pressed', String(mode === 'pos'));
    neg.setAttribute('aria-pressed', String(mode === 'neg'));
  }
}

/* ========================
   DEFAULTS (alleen analysevelden)
======================== */
function applyDefaultsFromSelection(cat, type){
  if (!cat || !type) return;
  const node = mestsoortenObj?.[cat]?.[type];
  if (!node || typeof node !== 'object') return;

  // tolerant (case-insensitive) keys
  const ds   = pickNum(node, ['ds_percent','DS_percent']);
  const n    = pickNum(node, ['n_kg_per_ton','N_kg_per_ton']);
  const p    = pickNum(node, ['p_kg_per_ton','P_kg_per_ton']);
  const k    = pickNum(node, ['k_kg_per_ton','K_kg_per_ton']);
  const os   = pickNum(node, ['os_percent','OS_percent']);
  const bio  = pickNum(node, ['biogaspotentieel_m3_per_ton','Biogaspotentieel_m3_per_ton']);

  // **Alleen** read-only analysevelden invullen
  elDS.value  = numToRO(ds);
  elN.value   = numToRO(n);
  elP.value   = numToRO(p);
  elK.value   = numToRO(k);
  elOS.value  = numToRO(os);
  elBio.value = numToRO(bio);

  // geen voorinvulling van prijs of ton!
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
function formatPriceDisplay(n){
  return Number(n).toFixed(2).replace('.', ','); // altijd komma
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
  if (elPriceSign) {
    const raw = parsePrice2dec(elPrijs.value);    // "12,50" → 12.5
    if (raw === null) return null;
    return (elPriceSign.value === 'neg') ? -raw : raw;
  }
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

    // 2) Insert mest_uploads (lowercase kolommen)
    const payload = {
      user_id: userId,
      naam: elNaam.value.trim(),
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

    // Reset
    form.reset();
    [elDS, elN, elP, elK, elOS, elBio].forEach(i => i.value = '');
    selectedCat = null; selectedType = null;
    await renderMestChoices();

    cbUseProfile.checked = !!profilePostcodeNow;
    wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';

    // na opslaan: teken terug naar NEGATIEF
    setPriceSignUI('neg');

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
   Overzicht "Mijn uploads" — KAARTEN + PAGINERING
======================== */
async function loadMyUploads(){
  myUploads.innerHTML = 'Laden…';
  const { data, error } = await supabase
    .from('mest_uploads')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    myUploads.textContent = 'Kon jouw uploads niet ophalen.';
    return;
  }

  uploadsAll = data || [];
  uploadsPage = 1;
  renderUploadsGrid();
}

function renderUploadsGrid(){
  const start = 0;
  const end = uploadsPage * PAGE_SIZE;
  const slice = uploadsAll.slice(start, end);

  if (!slice.length) {
    myUploads.innerHTML = `<div class="muted">Nog geen uploads. Voeg hierboven je eerste upload toe.</div>`;
    return;
  }

  myUploads.innerHTML = `
    <div class="uploads-grid">
      ${slice.map(renderUploadCard).join('')}
    </div>
    ${end < uploadsAll.length ? `<div class="uc-more-wrap"><button class="btn btn-primary uc-more">Toon meer</button></div>` : ''}
  `;

  bindUploadCardActions(slice);

  const moreBtn = myUploads.querySelector('.uc-more');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      uploadsPage += 1;
      renderUploadsGrid();
    });
  }
}

function renderUploadCard(r){
  return `
    <article class="uc-card" data-id="${r.id}">
      <header class="uc-header">
        <div class="uc-name">
          <input class="input uc-input e-naam" value="${escapeHtml(r.naam)}" maxlength="60" />
        </div>
        ${renderBadge(r.status)}
      </header>

      <div class="uc-row uc-meta">
        <div class="uc-kind truncate">${prettyKind(r.mest_categorie, r.mest_type)}</div>
        <div class="uc-postcode">
          <input class="input uc-input e-postcode" value="${escapeHtml(r.postcode || '')}" placeholder="1234 AB" maxlength="7"/>
        </div>
      </div>

      <div class="uc-chips">
        ${chip('DS', r.ds_percent, '%')}
        ${chip('N',  r.n_kg_per_ton, ' kg/t')}
        ${chip('P',  r.p_kg_per_ton, ' kg/t')}
        ${chip('K',  r.k_kg_per_ton, ' kg/t')}
      </div>

      <div class="uc-row uc-nums">
        <label class="uc-field">
          <span class="uc-label">€ / ton (±)</span>
          <input class="input uc-input uc-right e-prijs" value="${fmtEditSigned(r.inkoopprijs_per_ton)}" inputmode="decimal" placeholder="0,00"/>
        </label>
        <label class="uc-field">
          <span class="uc-label">Aantal ton</span>
          <input class="input uc-input uc-right e-ton" value="${fmtInt(r.aantal_ton)}" inputmode="numeric" placeholder="0"/>
        </label>
      </div>

      <footer class="uc-actions">
        <div class="uc-actions-left">
          ${r.file_path ? `<button class="btn uc-open">Bekijk analyse</button>` : `<span class="muted">Geen analysebestand</span>`}
        </div>
        <div class="uc-actions-right">
          <button class="btn-primary a-save">Opslaan</button>
          <button class="btn-danger a-del">Verwijderen</button>
        </div>
      </footer>
    </article>
  `;
}

function chip(label, v, suf=''){
  const t = (v===null || v===undefined) ? '—' : `${Number(v)}${suf}`;
  return `<span class="uc-chip"><strong>${label}</strong> ${t}</span>`;
}

/* ---- helpers voor weergave ---- */
function prettyKind(cat, type){
  const nice = String(cat || '').replace(/_/g,' ');
  return `${escapeHtml(nice)} / ${escapeHtml(type || '')}`;
}
function fmtEditSigned(v){
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n).toFixed(2).replace('.', ','); // altijd komma
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

/* ---- acties op kaarten ---- */
function bindUploadCardActions(rows){
  rows.forEach(r => {
    const card   = myUploads.querySelector(`.uc-card[data-id="${r.id}"]`);
    const btnSave= card.querySelector('.a-save');
    const btnDel = card.querySelector('.a-del');
    const btnOpen= card.querySelector('.uc-open');
    const elN    = card.querySelector('.e-naam');
    const elP    = card.querySelector('.e-prijs');
    const elT    = card.querySelector('.e-ton');
    const elPC   = card.querySelector('.e-postcode');

    // nette prijs bij blur: ± met komma en 2 dec
    elP?.addEventListener('blur', () => {
      const n = parseSignedPrice2dec(elP.value);
      if (n === null) return;
      const abs = Math.abs(n).toFixed(2).replace('.', ',');
      elP.value = (n < 0 ? '-' : '') + abs;
    });

    // open analyse (signed URL)
    if (btnOpen) {
      btnOpen.addEventListener('click', async () => {
        if (!r.file_path) { toast('Geen bestandspad beschikbaar.', 'error'); return; }
        const { data, error } = await supabase.storage
          .from('mest-analyses')
          .createSignedUrl(r.file_path, 60);
        if (error) { toast(`Kon bestand niet openen: ${error.message}`, 'error'); return; }
        window.open(data.signedUrl, '_blank', 'noopener');
      });
    }

    btnSave.addEventListener('click', async () => {
      let ok = true;
      [elN, elP, elT, elPC].forEach(clearInlineError);

      if (!elN.value || elN.value.trim().length < 2 || elN.value.trim().length > 60) { showInlineError(elN,'2–60 tekens'); ok=false; }
      const priceSigned = parseSignedPrice2dec(elP.value);
      if (priceSigned === null) { showInlineError(elP,'Bedrag (±) met max 2 decimalen.'); ok=false; }
      const tonInt = parseIntStrict(elT.value);
      if (tonInt === null || tonInt <= 0) { showInlineError(elT,'Alleen hele aantallen > 0.'); ok=false; }
      if (!isValidPostcode(elPC.value)) { showInlineError(elPC,'Postcode ongeldig'); ok=false; }
      const pcFmt = formatPostcode(elPC.value);
      if (!ok) return;

      const { error } = await supabase.from('mest_uploads').update({
        naam: elN.value.trim(),
        inkoopprijs_per_ton: priceSigned,
        aantal_ton: tonInt,
        postcode: pcFmt
      }).eq('id', r.id);

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

/* ========================
   Scoped styles voor kaarten (je kunt dit later naar style.css verplaatsen)
======================== */
function ensureUploadsStyles(){
  if (document.getElementById('uploads-cards-css')) return;
  const css = `
  .uploads-grid{display:grid;gap:.75rem}
  @media(min-width:700px){.uploads-grid{grid-template-columns:1fr 1fr}}
  @media(min-width:1100px){.uploads-grid{grid-template-columns:1fr 1fr 1fr}}
  .uc-card{border:1px solid #eee;background:#fff;border-radius:12px;padding:.85rem;box-shadow:0 2px 8px rgba(0,0,0,.04)}
  .uc-header{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.4rem}
  .uc-name{flex:1}
  .uc-input{width:100%;padding:.55rem .65rem;border:1px solid #e5e7eb;border-radius:10px}
  .uc-input:focus{outline:none;border-color:var(--color-yellow);box-shadow:0 0 0 3px rgba(241,196,15,.25)}
  .uc-row{display:flex;gap:.6rem;flex-wrap:wrap;margin:.4rem 0}
  .uc-meta{align-items:center;justify-content:space-between}
  .uc-kind{font-weight:600}
  .uc-chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.2rem 0 .5rem}
  .uc-chip{display:inline-flex;align-items:center;gap:.25rem;padding:.2rem .45rem;border-radius:999px;background:#f5f5f5;font-size:.85rem}
  .uc-field{flex:1;display:flex;flex-direction:column;gap:.25rem;min-width:140px}
  .uc-label{font-size:.85rem;color:#6b7280}
  .uc-right{text-align:right}
  .uc-actions{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.35rem}
  .uc-actions-right{display:flex;gap:.5rem}
  .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
  .uc-more-wrap{display:flex;justify-content:center;margin-top:.75rem}
  `;
  const tag = document.createElement('style');
  tag.id = 'uploads-cards-css';
  tag.textContent = css;
  document.head.appendChild(tag);
}
