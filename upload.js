// upload.js — single-select mestsoort in dezelfde JSON-structuur als mestplan
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
const elPriceSign = document.getElementById('priceSign'); // 'pos' | 'neg' (optioneel; aanwezig als je toggle in HTML gebruikt)

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
let mestsoortenObj = {};    // zelfde vorm als mestplan
let selectedCat = null;     // bv. 'drijfmest' | 'vaste_mest' | 'dikke_fractie' | 'overig'
let selectedType = null;    // bv. 'koe' | 'varken' | 'compost' ...

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

  // laad JSON (LET OP: zonder leading slash voor submap-compat!)
  await renderMestChoices();

  elFile.addEventListener('change', handleFileChange);
  form.addEventListener('submit', onSubmit);

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

    // Normaliseer naar objectvorm zoals mestplan gebruikt:
    // { drijfmest: { koe: {...}, varken: {...} }, vaste_mest: { ... }, overig: { ... } }
    mestsoortenObj = toObjectShapedMest(raw);

    // Prioriteitsvolgorde voor rendering
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

    // één selectie totaal
    listContainer.querySelectorAll('input[name="mest_one"]').forEach(r => {
      r.addEventListener('change', () => {
        selectedCat  = r.dataset.cat;
        selectedType = r.dataset.type;
        clearInlineError(listContainer);
      });
    });

  } catch (e) {
    console.error(e);
    listContainer.innerHTML = `<div class="message error">Kon mestsoorten niet laden.</div>`;
  }
}

// Converteer elk redelijk formaat naar objectvorm
function toObjectShapedMest(raw){
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw; // lijkt al goed
  }
  // array-vorm => { cat: { type: true } } (UI heeft namen nodig; details niet verplicht)
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
   BESTANDSANALYSE
======================== */
async function handleFileChange() {
  clearInlineError(elFile);
  const file = elFile.files?.[0];
  if (!file) return;
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
    toast('Analyse uitlezen mislukt. Item kan wel als "in behandeling" worden opgeslagen.', 'warning');
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
  // 1) Als er een sign-toggle is, gebruik die (clean UX)
  if (elPriceSign) {
    const raw = parsePrice2dec(elPrijs.value);
    if (raw === null) return null;
    return (elPriceSign.value === 'neg') ? -raw : raw;
  }
  // 2) Fallback: sta een getekend getal in het veld toe (bv. "-12.50")
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

  // Bestand
  const file = elFile.files?.[0];
  if (!file || !isFileAllowed(file)) {
    showInlineError(elFile, 'Kies een geldig bestand.');
    ok = false;
  }

  // Prijs (±, max 2 dec)
  const signedPrice = getSignedPriceFromUI();
  if (signedPrice === null) {
    showInlineError(elPrijs, 'Ongeldig bedrag (max 2 decimalen).');
    ok = false;
  }

  // Ton (integer > 0)
  const tonInt = parseIntStrict(elTon.value);
  if (tonInt === null || tonInt <= 0) {
    showInlineError(elTon, 'Alleen hele aantallen > 0.');
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
    // 1) Upload naar Storage
    const now = new Date();
    const fileExt = (file.name?.split('.').pop() || 'bin').toLowerCase();
    const uuid = makeUUID();
    const path = `${userId}/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${uuid}.${fileExt}`;
    const { error: upErr } = await supabase.storage
      .from('mest-analyses')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upErr) throw upErr;

    // 2) Insert mest_uploads
    const payload = {
      user_id: userId,
      naam: elNaam.value.trim(),
      mest_categorie: selectedCat,     // bv. 'vaste_mest'
      mest_type: selectedType,         // bv. 'koe'
      file_path: path,
      file_mime: file.type || 'application/octet-stream',
      postcode: postcodeVal,
      inkoopprijs_per_ton: signedPrice,  // ± prijs
      aantal_ton: tonInt,                // integer
      DS_percent: toNumOrNull(elDS.value),
      N_kg_per_ton: toNumOrNull(elN.value),
      P_kg_per_ton: toNumOrNull(elP.value),
      K_kg_per_ton: toNumOrNull(elK.value),
      OS_percent: toNumOrNull(elOS.value),
      Biogaspotentieel_m3_per_ton: toNumOrNull(elBio.value),
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

    // (optioneel) reset sign-toggle naar positief
    if (elPriceSign) elPriceSign.value = 'pos';

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
  const n = Number(v);
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

/* --- Overzicht "Mijn uploads" (met ± prijs en integer ton) --- */
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
  if (!data.length){
    myUploads.innerHTML = `<div class="muted">Nog geen uploads. Voeg hierboven je eerste upload toe.</div>`;
    return;
  }
  myUploads.innerHTML = renderUploadsTable(data);
  bindUploadActions(data);
}

function renderBadge(status){
  const map = { in_behandeling:'gray', gepubliceerd:'green', afgewezen:'red' };
  const cls = map[status] || 'gray';
  const label = String(status).replace(/_/g, ' ');
  return `<span class="badge ${cls}">${label}</span>`;
}
function renderUploadsTable(rows){
  return `
    <table aria-label="Mijn uploads">
      <thead>
        <tr>
          <th>Naam</th><th>Mestsoort</th><th>DS/N/P/K</th><th class="right">€ / ton</th>
          <th class="right">Ton</th><th>Postcode</th><th>Status</th><th>Acties</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr data-id="${r.id}">
            <td><input class="e-naam" value="${escapeHtml(r.naam)}"/></td>
            <td>${escapeHtml(r.mest_categorie)} / ${escapeHtml(r.mest_type)}</td>
            <td class="muted">${fmt(r.DS_percent,'%')} • N ${fmt(r.N_kg_per_ton,' kg/t')} • P ${fmt(r.P_kg_per_ton,' kg/t')} • K ${fmt(r.K_kg_per_ton,' kg/t')}</td>
            <td class="right"><input class="e-prijs" value="${fmtEdit(r.inkoopprijs_per_ton)}" inputmode="decimal"/></td>
            <td class="right"><input class="e-ton" value="${fmtEdit(r.aantal_ton)}" inputmode="numeric"/></td>
            <td><input class="e-postcode" value="${escapeHtml(r.postcode)}"/></td>
            <td>${renderBadge(r.status)}</td>
            <td class="actions">
              <button class="btn-primary a-save">Opslaan</button>
              <button class="btn-danger a-del">Verwijderen</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
function fmt(v,suf=''){ if (v===null || v===undefined) return '—'; const n = Number(v); return Number.isFinite(n) ? `${n}${suf}` : '—'; }
function fmtEdit(v){ if (v===null || v===undefined) return ''; const n = Number(v); return Number.isFinite(n) ? String(n) : ''; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function bindUploadActions(rows){
  rows.forEach(r => {
    const tr = myUploads.querySelector(`tr[data-id="${r.id}"]`);
    const btnSave = tr.querySelector('.a-save');
    const btnDel  = tr.querySelector('.a-del');
    const elN     = tr.querySelector('.e-naam');
    const elP     = tr.querySelector('.e-prijs');
    const elT     = tr.querySelector('.e-ton');
    const elPC    = tr.querySelector('.e-postcode');

    btnSave.addEventListener('click', async () => {
      let ok = true;
      [elN, elP, elT, elPC].forEach(clearInlineError);

      // naam
      if (!elN.value || elN.value.trim().length < 2 || elN.value.trim().length > 60) {
        showInlineError(elN,'2–60 tekens'); ok=false;
      }

      // prijs (±, max 2 dec)
      const priceSigned = parseSignedPrice2dec(elP.value);
      if (priceSigned === null) { showInlineError(elP,'Bedrag (±) met max 2 decimalen.'); ok=false; }

      // ton (integer > 0)
      const tonInt = parseIntStrict(elT.value);
      if (tonInt === null || tonInt <= 0) { showInlineError(elT,'Alleen hele aantallen > 0.'); ok=false; }

      // postcode
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
