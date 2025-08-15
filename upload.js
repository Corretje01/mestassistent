// upload.js
import { supabase } from './supabaseClient.js';
import {
  isValidPostcode,
  formatPostcode,
  isPositiveNumberMax2Dec,
  isFileAllowed,
  showInlineError,
  clearInlineError,
  disable,
  toast,
  extractAnalysis
} from './utils.js';

const form = document.getElementById('uploadForm');
const elNaam = document.getElementById('naam');
const elCat  = document.getElementById('categorie');
const elType = document.getElementById('type');
const elFile = document.getElementById('file');
const elPrijs= document.getElementById('inkoopprijs');
const elTon  = document.getElementById('aantalTon');
const cbUseProfile = document.getElementById('useProfilePostcode');
const wrapPostcode = document.getElementById('postcodeWrap');
const elPostcode = document.getElementById('postcode');
const btnSubmit = document.getElementById('btnSubmit');
const myUploads = document.getElementById('myUploads');

// Analyse fields (read-only)
const elDS  = document.getElementById('DS_percent');
const elN   = document.getElementById('N_kg_per_ton');
const elP   = document.getElementById('P_kg_per_ton');
const elK   = document.getElementById('K_kg_per_ton');
const elOS  = document.getElementById('OS_percent');
const elBio = document.getElementById('Biogas');

let session, profile, userId;

// init
(async function init(){
  ({ data: { session } } = await supabase.auth.getSession());
  if (!session) {
    toast('Log eerst in om te kunnen uploaden.', 'info');
    window.location.href = 'account.html';
    return;
  }
  userId = session.user.id;

  // fetch profile (voor evt. postcode)
  const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
  profile = prof || {};

  // Slimme default voor checkbox o.b.v. profiel of user_metadata
  const profilePostcode = getProfilePostcode();
  cbUseProfile.checked = !!profilePostcode;
  wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';

  cbUseProfile.addEventListener('change', () => {
    wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';
    if (!cbUseProfile.checked) elPostcode.focus();
  });

  // Categorie/Type dropdowns vanuit mestsoorten.json
  await loadMestSoortenOptions();

  // Bestands-analyse auto-start na selectie
  elFile.addEventListener('change', handleFileChange);

  // Form submit
  form.addEventListener('submit', onSubmit);

  // Load my uploads
  await loadMyUploads();
})();

function getProfilePostcode() {
  // leest eerst user_metadata.postcode, dan profiles.postcode (indien aanwezig)
  return session?.user?.user_metadata?.postcode || profile?.postcode || null;
}

async function loadMestSoortenOptions(){
  try {
    const resp = await fetch('data/mestsoorten.json');
    const mestsoorten = await resp.json();
    // Build categorieën
    const cats = [...new Set(mestsoorten.map(m => m.categorie))];
    for (const c of cats) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = labelCategorie(c);
      elCat.appendChild(opt);
    }
    elCat.addEventListener('change', () => {
      elType.innerHTML = '<option value="">Kies type…</option>';
      elType.disabled = true;
      const sel = elCat.value;
      if (!sel) return;
      const types = [...new Set(mestsoorten.filter(m => m.categorie===sel).map(m=>m.type))];
      for (const t of types) {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = labelType(t);
        elType.appendChild(opt);
      }
      elType.disabled = false;
    });
  } catch (e) {
    console.error(e);
    toast('Kon mestsoorten niet laden.', 'error');
  }
}
function labelCategorie(c){
  const map = { vaste_mest:'Vaste mest', dikke_fractie:'Dikke fractie', drijfmest:'Drijfmest', overig:'Overig' };
  return map[c] || c;
}
function labelType(t){ return t.charAt(0).toUpperCase()+t.slice(1); }

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
    // Extractie
    const parsed = await extractAnalysis(file);
    // Zet read-only velden
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

async function onSubmit(e){
  e.preventDefault();
  // Client validatie
  let ok = true;
  for (const el of [elNaam, elCat, elType, elFile, elPrijs, elTon, elPostcode]) clearInlineError(el);

  if (!elNaam.value || elNaam.value.trim().length < 2 || elNaam.value.trim().length > 60) {
    showInlineError(elNaam, '2–60 tekens.');
    ok = false;
  }
  if (!elCat.value) { showInlineError(elCat, 'Kies een categorie.'); ok = false; }
  if (!elType.value) { showInlineError(elType, 'Kies een type.'); ok = false; }

  const file = elFile.files?.[0];
  if (!file || !isFileAllowed(file)) { showInlineError(elFile, 'Kies een geldig bestand.'); ok = false; }

  if (!isPositiveNumberMax2Dec(elPrijs.value)) { showInlineError(elPrijs, 'Bedrag > 0, max 2 dec.'); ok = false; }
  if (!isPositiveNumberMax2Dec(elTon.value))   { showInlineError(elTon, 'Aantal > 0, max 2 dec.'); ok = false; }

  // Postcode bepalen
  let postcodeVal = null;
  const profilePostcodeNow = getProfilePostcode();

  if (cbUseProfile.checked) {
    if (profilePostcodeNow) {
      postcodeVal = formatPostcode(profilePostcodeNow);
    } else {
      // Geen postcode bekend in profiel/metadata → switch naar handmatig
      wrapPostcode.style.display = 'block';
      cbUseProfile.checked = false;
      showInlineError(elPostcode, 'Geen postcode in profiel. Vul handmatig in.');
      ok = false;
    }
  } else {
    if (!isValidPostcode(elPostcode.value)) {
      showInlineError(elPostcode, 'Ongeldige NL postcode.');
      ok = false;
    } else {
      postcodeVal = formatPostcode(elPostcode.value);
    }
  }

  if (!ok) return;

  disable(btnSubmit, true);

  try {
    // 1) Upload bestand -> Storage private bucket
    const now = new Date();
    const fileExt = (file.name?.split('.').pop() || 'bin').toLowerCase();
    const uuid = makeUUID();
    const path = `${userId}/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${uuid}.${fileExt}`;

    const { error: upErr } = await supabase.storage
      .from('mest-analyses')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upErr) throw upErr;

    // 2) Insert mest_uploads (status in_behandeling)
    const payload = {
      user_id: userId,
      naam: elNaam.value.trim(),
      mest_categorie: elCat.value,
      mest_type: elType.value,
      file_path: path,
      file_mime: file.type || 'application/octet-stream',
      postcode: postcodeVal,
      inkoopprijs_per_ton: Number(elPrijs.value),
      aantal_ton: Number(elTon.value),
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

    // Form reset + postcode-checkbox weer slim instellen
    form.reset();
    [elDS, elN, elP, elK, elOS, elBio].forEach(i => i.value = '');
    cbUseProfile.checked = !!profilePostcodeNow;
    wrapPostcode.style.display = cbUseProfile.checked ? 'none' : 'block';

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
  // crypto.randomUUID (moderne browsers) + fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    // RFC4122 variant 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2,'')).join('');
    return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20)}`;
  }
  // worst-case fallback
  return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

// --- Overview "Mijn uploads" ---
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
  // bind actions
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
            <td class="right"><input class="e-ton" value="${fmtEdit(r.aantal_ton)}" inputmode="decimal"/></td>
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
function fmt(v,suf=''){
  if (v===null || v===undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n}${suf}`;
}
function fmtEdit(v){
  if (v===null || v===undefined) return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '';
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

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
      // Validatie
      let ok = true;
      [elN, elP, elT, elPC].forEach(clearInlineError);
      if (!elN.value || elN.value.trim().length < 2 || elN.value.trim().length > 60) { showInlineError(elN,'2–60 tekens'); ok=false; }
      if (!isPositiveNumberMax2Dec(elP.value)) { showInlineError(elP,'Bedrag >0, max 2 dec'); ok=false; }
      if (!isPositiveNumberMax2Dec(elT.value)) { showInlineError(elT,'Aantal >0, max 2 dec'); ok=false; }
      if (!isValidPostcode(elPC.value)) { showInlineError(elPC,'Postcode ongeldig'); ok=false; }
      const pcFmt = formatPostcode(elPC.value);
      if (!ok) return;

      // Beperkte UPDATE (policies + trigger bewaken immutable kolommen)
      const { error } = await supabase.from('mest_uploads').update({
        naam: elN.value.trim(),
        inkoopprijs_per_ton: Number(elP.value),
        aantal_ton: Number(elT.value),
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
