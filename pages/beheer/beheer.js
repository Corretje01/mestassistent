// pages/beheer/beheer.js — opgeschoond: single-item edit guard (inline), geen page-nav guard
import { supabase } from '../../supabaseClient.js';
import { toast } from '../../core/utils/utils.js';

const listEl   = document.getElementById('adminList');
const fStatus  = document.getElementById('fStatus');
const fQuery   = document.getElementById('fQuery');
const fCat     = document.getElementById('fCategorie');
const fType    = document.getElementById('fType');
const resCount = document.getElementById('resultCount');

const btnReset    = document.getElementById('btnResetFilters');
const btnExpand   = document.getElementById('btnExpandAll');
const btnCollapse = document.getElementById('btnCollapseAll');

const ALLOWED_STATUS = ['in_behandeling', 'gepubliceerd', 'afgewezen'];
const LS_KEY = 'beheer.filters.v1';

// Één actieve editsessie tegelijk
const editSession = {
  activeId: null,        // id (uuid) van het geopende item dat bewerkbaar is
  dirty: false,          // heeft onopgeslagen wijzigingen
  snapshot: null,        // beginwaarden van inputs (voor dirty-vergelijking)
  pendingOpenId: null,   // doel-item om na save/discard naar te wisselen
};

let session, userId, isAdmin = false;

(async function init() {
  ({ data: { session } } = await supabase.auth.getSession());
  if (!session) { window.location.href = 'account.html'; return; }
  userId = session.user.id;

  // check admin
  const { data: prof, error: profErr } = await supabase
    .from('profiles').select('role').eq('id', userId).single();
  if (profErr) { toast('Kon profiel niet laden.', 'error'); window.location.href = '/'; return; }
  isAdmin = String(prof?.role || '').toLowerCase() === 'admin';
  if (!isAdmin) { toast('Geen toegang', 'error'); window.location.href = '/'; return; }

  // filters vullen + herstellen
  await loadMestSoorten();
  restoreFilters();
  bindFilters();

  await loadList();
})();

/* ========================= Filters / lijst ========================= */

function bindFilters() {
  [fStatus, fCat, fType].forEach(el => el?.addEventListener('change', onFiltersChanged));
  fQuery?.addEventListener('input', debounce(onFiltersChanged, 250));

  btnReset?.addEventListener('click', () => {
    fStatus.value = ''; fQuery.value = ''; fCat.value = ''; fType.value = '';
    persistFilters(); loadList();
  });

  btnExpand?.addEventListener('click', () => {
    document.querySelectorAll('details.details-card').forEach(d => d.open = true);
  });
  btnCollapse?.addEventListener('click', () => {
    document.querySelectorAll('details.details-card').forEach(d => d.open = false);
  });
}

function onFiltersChanged(){ persistFilters(); loadList(); }

function persistFilters(){
  const payload = { status: fStatus.value, q: fQuery.value, cat: fCat.value, type: fType.value };
  try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch(_) {}
}
function restoreFilters(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const { status, q, cat, type } = JSON.parse(raw);
    if (typeof status === 'string') fStatus.value = status;
    if (typeof q === 'string')      fQuery.value  = q;
    if (typeof cat === 'string')    fCat.value    = cat;
    if (typeof type === 'string')   fType.value   = type;
  } catch(_) {}
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Gebruik nette NL labels voor categorie
function labelCategorie(c) {
  const map = { drijfmest: 'Drijfmest', vaste_mest: 'Vaste mest', dikke_fractie: 'Dikke fractie', overig: 'Overig' };
  return map[c] || String(c).replace(/_/g, ' ');
}

// Laad mestsoorten.json -> vul filter dropdowns (array- of object-vorm)
async function loadMestSoorten() {
  try {
    const resp = await fetch('../../core/domain/data/mestsoorten.json', { cache: 'no-store' });
    const data = await resp.json();

    let cats = [], types = [];
    if (Array.isArray(data)) {
      cats  = [...new Set(data.map(m => m.categorie).filter(Boolean))];
      types = [...new Set(data.map(m => m.type).filter(Boolean))];
    } else if (data && typeof data === 'object') {
      cats = Object.keys(data || {});
      types = [...new Set(cats.flatMap(c => Object.keys(data[c] || {})))];
    }

    cats.forEach(c => fCat?.appendChild(new Option(labelCategorie(c), c)));
    types.forEach(t => fType?.appendChild(new Option(t, t)));
  } catch (e) {
    console.error(e);
    toast('Kon mestsoorten niet laden.', 'error');
  }
}

async function loadList() {
  if (!listEl) return;
  listEl.textContent = 'Laden…';

  // Bij opnieuw laden: sessie resetten
  resetEditSession();

  let q = supabase.from('mest_uploads')
    .select('*')
    .order('created_at', { ascending: false });

  if (fStatus?.value) q = q.eq('status', fStatus.value);
  if (fCat?.value)    q = q.eq('mest_categorie', fCat.value);
  if (fType?.value)   q = q.eq('mest_type', fType.value);

  const { data, error } = await q;
  if (error) { listEl.textContent = 'Fout bij laden'; return; }

  let rows = data || [];
  const query = fQuery?.value?.toLowerCase().trim();
  if (query) {
    rows = rows.filter(r =>
      (r.naam || '').toLowerCase().includes(query) ||
      (r.postcode || '').toLowerCase().includes(query)
    );
  }

  if (resCount) resCount.textContent = String(rows.length);

  listEl.innerHTML = rows.length
    ? rows.map(renderItem).join('')
    : '<div class="muted">Geen resultaten</div>';

  bindItemActions(rows);
}

/* ========================= Rendering ========================= */

function renderItem(r) {
  const created = fmtDate(r.created_at);
  return `
    <details class="details-card" data-id="${r.id}">
      <summary class="item-summary">
        <span class="item-title">${escapeHtml(r.naam || '—')}</span>
        <span class="item-meta">${escapeHtml(labelCategorie(r.mest_categorie))}/${escapeHtml(r.mest_type || '—')} • ${escapeHtml(r.postcode || '—')} • ${created}</span>
        ${statusChip(r.status)}
      </summary>

      <div class="edit-wrap" style="margin:.5rem 0;">
        <div style="display:flex; align-items:center; gap:.5rem;">
          <strong>Bestand:</strong>
          <button class="a-open">Bekijk analyse</button>
          ${r.file_path ? '' : '<span class="muted">(geen bestand)</span>'}
        </div>

        <div class="row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:.5rem;">
          ${input('ds_percent','DS %', r.ds_percent)}
          ${input('n_kg_per_ton','N kg/ton', r.n_kg_per_ton)}
          ${input('p_kg_per_ton','P kg/ton', r.p_kg_per_ton)}
          ${input('k_kg_per_ton','K kg/ton', r.k_kg_per_ton)}
          ${input('os_percent','OS % (opt)', r.os_percent)}
          ${input('biogaspotentieel_m3_per_ton','Biogas m³/ton (opt)', r.biogaspotentieel_m3_per_ton)}
        </div>

        <div class="admin-grid-2" style="margin-top:.75rem;">
          <label> Status
            <select class="f-status">
              ${ALLOWED_STATUS.map(s=>`<option ${s===r.status?'selected':''} value="${s}">${s.replace('_',' ')}</option>`).join('')}
            </select>
          </label>
          <label> Moderation note
            <textarea class="f-note" placeholder="Reden/onderbouwing (verplicht bij afkeuren)">${escapeHtml(r.moderation_note || '')}</textarea>
          </label>
        </div>

        <div class="actions" style="margin-top:.75rem; display:flex; gap:.5rem; align-items:center; flex-wrap:wrap;">
          <button class="btn-primary a-save" disabled>Opslaan</button>
          <span class="muted dirty-hint" hidden>Onopgeslagen wijzigingen…</span>
        </div>

        <!-- Inline guard banner (injectieplek) -->
        <div class="dirty-banner" hidden></div>
      </div>
    </details>
  `;
}

function statusChip(s){
  const map = { in_behandeling:'gray', gepubliceerd:'green', afgewezen:'red' };
  const cls = map[s] || 'gray';
  const label = String(s || '').replace('_',' ');
  return `<span class="status-chip ${cls}" aria-label="Status: ${label}">${label}</span>`;
}

function input(key, label, val) {
  const v = (val === null || val === undefined) ? '' : String(val);
  return `<label>${label}<input data-k="${key}" value="${escapeHtml(v)}" inputmode="decimal"/></label>`;
}

/* ========================= Item interactie ========================= */

function bindItemActions(rows) {
  rows.forEach(r => {
    const root     = document.querySelector(`details[data-id="${r.id}"]`);
    if (!root) return;

    const sumEl    = root.querySelector('summary');
    const btnSave  = root.querySelector('.a-save');
    const btnOpen  = root.querySelector('.a-open');
    const statusEl = root.querySelector('.f-status');
    const noteEl   = root.querySelector('.f-note');
    const inputs   = root.querySelectorAll('input[data-k]');
    const hintEl   = root.querySelector('.dirty-hint');

    // --- open file (signed URL)
    btnOpen?.addEventListener('click', async () => {
      if (!r.file_path) { toast('Geen bestand beschikbaar.', 'error'); return; }
      const { data, error } = await supabase.storage
        .from('mest-analyses')
        .createSignedUrl(r.file_path, 60);
      if (error) { toast(`Kon bestand niet openen: ${error.message}`, 'error'); return; }
      window.open(data.signedUrl, '_blank', 'noopener');
    });

    // --- summary click: single-item edit guard
    sumEl?.addEventListener('click', (e) => {
      // Als dit item al actief is, laat gewoon togglen toe.
      const id = r.id;
      const switching = (editSession.activeId && editSession.activeId !== id);
      if (switching && editSession.dirty) {
        // Blokkeer wisselen; toon banner op actieve
        e.preventDefault();
        e.stopPropagation();
        showDirtyBannerForActiveItem(id); // pendingOpenId = id
        focusActiveDirtyItem();
      }
    });

    // --- toggle open/close: initialiseer sessie bij openen
    root.addEventListener('toggle', () => {
      const id = r.id;
      if (root.open) {
        // Als we hier kwamen via “Opslaan & wisselen” of “Verwerpen & wisselen”, reset dirty
        if (editSession.pendingOpenId === id) {
          editSession.pendingOpenId = null;
        }
        // Maak dit het actieve item en neem snapshot op
        setActiveItem(id, root);
        setSnapshotFromDOM(root);
        setDirty(false, root);
      } else {
        // Sluit je het actieve item? Als het dirty is: blokkeer sluiten.
        if (editSession.activeId === id && editSession.dirty) {
          // Forceer open + banner tonen
          root.open = true;
          showDirtyBannerForActiveItem(null);
        } else if (editSession.activeId === id) {
          // schoon afsluiten
          resetEditSession();
        }
      }
    });

    // --- Dirty detectie
    const markDirty = () => { setDirty(true, root); };
    [statusEl, noteEl, ...inputs].forEach(el => {
      el?.addEventListener('input', markDirty);
      el?.addEventListener('change', markDirty);
    });

    // Enter in input => save
    inputs.forEach(i => {
      i.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); btnSave?.click(); }
      });
    });

    // Cmd/Ctrl+S => save (binnen dit details)
    root.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); btnSave?.click();
      }
    });

    // --- Opslaan
    btnSave?.addEventListener('click', async () => {
      await saveCurrent(root, r.id);
    });

    // Bij eerste render blijven alle items dicht; user opent er één → toggle handler init sessie
  });
}

/* ========================= Dirty/inline guard helpers ========================= */

function resetEditSession() {
  editSession.activeId = null;
  editSession.dirty = false;
  editSession.snapshot = null;
  editSession.pendingOpenId = null;
}

function setActiveItem(id, root) {
  editSession.activeId = id;
  // Verwijder eventuele banners op ALLE items
  document.querySelectorAll('.dirty-banner').forEach(b => (b.hidden = true, b.innerHTML = ''));
  // Visuele hint reset
  const hint = root.querySelector('.dirty-hint');
  if (hint) hint.hidden = true;
}

function setSnapshotFromDOM(root) {
  editSession.snapshot = readPayloadFromDOM(root);
}

function readPayloadFromDOM(root) {
  const statusEl = root.querySelector('.f-status');
  const noteEl   = root.querySelector('.f-note');
  const inputs   = root.querySelectorAll('input[data-k]');
  const payload  = {
    status: statusEl?.value || '',
    note:   (noteEl?.value || ''),
    fields: {}
  };
  inputs.forEach(i => {
    payload.fields[i.getAttribute('data-k')] = i.value;
  });
  return payload;
}

function isDirtyComparedToSnapshot(root) {
  if (!editSession.snapshot) return false;
  const cur = readPayloadFromDOM(root);
  if (cur.status !== editSession.snapshot.status) return true;
  if (cur.note   !== editSession.snapshot.note)   return true;
  const keys = new Set([...Object.keys(cur.fields), ...Object.keys(editSession.snapshot.fields)]);
  for (const k of keys) {
    if ((cur.fields[k] ?? '') !== (editSession.snapshot.fields[k] ?? '')) return true;
  }
  return false;
}

function setDirty(on, root) {
  editSession.dirty = !!on;
  const btnSave = root.querySelector('.a-save');
  const hintEl  = root.querySelector('.dirty-hint');
  if (btnSave) btnSave.disabled = !editSession.dirty;
  if (hintEl)  hintEl.hidden = !editSession.dirty;
}

function showDirtyBannerForActiveItem(pendingOpenId /* string|null */) {
  const activeRoot = document.querySelector(`details.details-card[data-id="${editSession.activeId}"]`);
  if (!activeRoot) return;
  editSession.pendingOpenId = pendingOpenId || null;

  const banner = activeRoot.querySelector('.dirty-banner');
  if (!banner) return;

  banner.innerHTML = `
    <div class="card" style="margin-top:.65rem; display:flex; gap:.5rem; align-items:center; flex-wrap:wrap;">
      <strong>Niet opgeslagen wijzigingen.</strong>
      <div style="flex:1"></div>
      <button class="btn-primary a-save-continue">Opslaan & wisselen</button>
      <button class="btn-danger a-discard-continue">Verwerpen & wisselen</button>
      <button class="btn-ghost a-keep-editing">Doorgaan met bewerken</button>
    </div>
  `;
  banner.hidden = false;

  const btnSaveCont   = banner.querySelector('.a-save-continue');
  const btnDiscard    = banner.querySelector('.a-discard-continue');
  const btnKeep       = banner.querySelector('.a-keep-editing');

  btnKeep?.addEventListener('click', () => {
    banner.hidden = true;
  });

  btnDiscard?.addEventListener('click', () => {
    // Snapshot terugzetten → waarden herstellen
    restoreFromSnapshot(activeRoot);
    setDirty(false, activeRoot);
    banner.hidden = true;
    if (editSession.pendingOpenId) {
      openItemById(editSession.pendingOpenId);
      editSession.pendingOpenId = null;
    }
  });

  btnSaveCont?.addEventListener('click', async () => {
    const id = editSession.activeId;
    await saveCurrent(activeRoot, id);
    banner.hidden = true;
    if (editSession.pendingOpenId) {
      openItemById(editSession.pendingOpenId);
      editSession.pendingOpenId = null;
    }
  });
}

function restoreFromSnapshot(root) {
  if (!editSession.snapshot) return;
  const statusEl = root.querySelector('.f-status');
  const noteEl   = root.querySelector('.f-note');
  if (statusEl) statusEl.value = editSession.snapshot.status || '';
  if (noteEl)   noteEl.value   = editSession.snapshot.note   || '';
  const inputs = root.querySelectorAll('input[data-k]');
  inputs.forEach(i => {
    const k = i.getAttribute('data-k');
    i.value = editSession.snapshot.fields[k] ?? '';
  });
}

function focusActiveDirtyItem() {
  const active = document.querySelector(`details.details-card[data-id="${editSession.activeId}"]`);
  if (!active) return;
  active.open = true;
  active.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openItemById(id) {
  const nextRoot = document.querySelector(`details.details-card[data-id="${id}"]`);
  if (!nextRoot) return;
  nextRoot.open = true; // triggert toggle → setActiveItem + snapshot
}

/* ========================= Opslaan ========================= */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function asNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.'); if (s === '') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function fmtDate(iso){
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('nl-NL',{ day:'2-digit', month:'short', year:'numeric' });
  } catch { return '—'; }
}

async function saveCurrent(root, rowId) {
  // Valideer status
  const statusEl = root.querySelector('.f-status');
  const noteEl   = root.querySelector('.f-note');
  const newStatus = statusEl?.value;
  if (!ALLOWED_STATUS.includes(newStatus)) { toast('Ongeldige status.', 'error'); return; }

  const note = (noteEl?.value || '').trim();
  if (newStatus === 'afgewezen' && note.length === 0) {
    toast('Geef een reden bij afwijzen.', 'error');
    noteEl?.focus();
    return;
  }

  // Bouw patch; parse numeriek met komma-ondersteuning
  const patch = {
    status: newStatus,
    moderation_note: note || null,
    last_moderated_by: userId
  };
  const inputs = root.querySelectorAll('input[data-k]');
  inputs.forEach(i => {
    const key = i.getAttribute('data-k');  // lowercase keys in DB
    patch[key] = asNumberOrNull(i.value);
  });

  const btnSave = root.querySelector('.a-save');
  const prevLabel = btnSave?.textContent || 'Opslaan';
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Opslaan…'; }

  const { error } = await supabase.from('mest_uploads').update(patch).eq('id', rowId);

  if (btnSave) { btnSave.disabled = false; btnSave.textContent = prevLabel; }

  if (error) {
    toast(`Opslaan mislukt: ${error.message}`, 'error');
    return;
  }

  toast('Opgeslagen', 'success');
  // Nieuwe snapshot en dirty uit
  setSnapshotFromDOM(root);
  setDirty(false, root);
  // Kopregel/status-chip meteen laten kloppen → herlaad lijst
  await loadList();
}

/* ========================= Einde ========================= */
