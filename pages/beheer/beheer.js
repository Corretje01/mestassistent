// pages/beheer/beheer.js
// Admin-lijst met filters, single-edit lock, dirty-guard en veilige saves
// "Bekijk analyse" opent weer direct de signed URL op andere origin, in een nieuw tabblad.

import { supabase } from '../../supabaseClient.js';
import { toast }    from '../../core/utils/utils.js';

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

// ===== Single-edit session =====
const editSession = {
  id: null,      // id van het item dat momenteel bewerkt wordt
  dirty: false,  // onopgeslagen wijzigingen?
  saving: false, // save bezig?
  snapshot: null // originele data (voor rollback)
};

let session, userId, isAdmin = false;

/* ========== INIT ========== */
(async function init() {
  try { ({ data: { session } } = await supabase.auth.getSession()); } catch {}
  if (!session) { window.location.replace('account.html?signin=1'); return; }
  userId = session.user.id;

  try {
    const { data: prof } = await supabase.from('profiles')
      .select('role').eq('id', userId).maybeSingle();
    isAdmin = String(prof?.role || '').toLowerCase() === 'admin';
  } catch {}
  if (!isAdmin) { toast('Geen toegang', 'error'); window.location.replace('account.html'); return; }

  await loadMestSoorten();
  restoreFilters();
  bindFilters();

  // Alleen bij echte pagina-unload (browser toont het 1x)
  window.addEventListener('beforeunload', (e) => {
    if (editSession.dirty && !editSession.saving) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Dirty-guard alleen voor navigatie in DEZELFDE tab (menu/links).
  // Nieuwe tabbladen (zoals "Bekijk analyse") NIET blokkeren.
  document.body.addEventListener('click', (e) => {
    const a = e.target.closest('a,button');
    if (!a) return;

    const href = a.tagName === 'A' ? a.getAttribute('href') : null;
    const isSameTabNav =
      a.matches('.nav__item, .btn-login') ||
      (href && !href.startsWith('#') && !href.startsWith('javascript:') && a.getAttribute('target') !== '_blank');

    if (isSameTabNav && editSession.dirty && !editSession.saving) {
      const ok = confirm('Je hebt onopgeslagen wijzigingen. Doorgaan en wijzigingen verwerpen?');
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        rollbackCurrentEdits();
      }
    }
  }, true);

  await loadList();
})();

/* ========== FILTERS ========== */
function bindFilters() {
  [fStatus, fCat, fType].forEach(el => el?.addEventListener('change', onFiltersChanged));
  fQuery?.addEventListener('input', debounce(onFiltersChanged, 250));

  btnReset?.addEventListener('click', () => {
    if (!allowDiscardIfDirty()) return;
    if (fStatus) fStatus.value = '';
    if (fQuery)  fQuery.value  = '';
    if (fCat)    fCat.value    = '';
    if (fType)   fType.value   = '';
    persistFilters();
    loadList();
  });

  // Met single-edit lock sluiten we gewoon alles
  btnExpand?.addEventListener('click', () => toggleOnlyOneOpen(null));
  btnCollapse?.addEventListener('click', () => toggleOnlyOneOpen(null));
}

function onFiltersChanged(){
  if (!allowDiscardIfDirty()) { restoreFilters(); return; }
  persistFilters();
  loadList();
}

function persistFilters(){
  const payload = {
    status: fStatus?.value ?? '',
    q:      fQuery?.value  ?? '',
    cat:    fCat?.value    ?? '',
    type:   fType?.value   ?? ''
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch {}
}
function restoreFilters(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const { status, q, cat, type } = JSON.parse(raw);
    if (fStatus && typeof status === 'string') fStatus.value = status;
    if (fQuery  && typeof q      === 'string') fQuery.value  = q;
    if (fCat    && typeof cat    === 'string') fCat.value    = cat;
    if (fType   && typeof type   === 'string') fType.value   = type;
  } catch {}
}

function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

/* ========== HELPER LABELS/UTILS ========== */
function labelCategorie(c){
  const map = { drijfmest:'Drijfmest', vaste_mest:'Vaste mest', dikke_fractie:'Dikke fractie', overig:'Overig' };
  return map[c] || String(c || '').replace(/_/g, ' ');
}
function statusChip(s){
  const map = { in_behandeling:'gray', gepubliceerd:'green', afgewezen:'red' };
  const cls = map[s] || 'gray';
  const label = String(s || '').replace('_',' ');
  return `<span class="status-chip ${cls}" aria-label="Status: ${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}
function input(key, label, val){
  const v = (val === null || val === undefined) ? '' : String(val);
  return `<label>${escapeHtml(label)}<input data-k="${escapeHtml(key)}" value="${escapeHtml(v)}" inputmode="decimal"/></label>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function asNumberOrNull(v){
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.'); if (s === '') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function fmtDate(iso){
  if (!iso) return '—';
  try { const d = new Date(iso); return d.toLocaleDateString('nl-NL',{ day:'2-digit', month:'short', year:'numeric' }); }
  catch { return '—'; }
}

/* ========== DATA LOADERS ========== */
async function loadMestSoorten(){
  try {
    const resp = await fetch('../../core/domain/data/mestsoorten.json',{ cache:'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    let cats=[], types=[];
    if (Array.isArray(data)) {
      cats  = [...new Set(data.map(m => m.categorie).filter(Boolean))];
      types = [...new Set(data.map(m => m.type).filter(Boolean))];
    } else if (data && typeof data === 'object') {
      cats  = Object.keys(data || {});
      types = [...new Set(cats.flatMap(c => Object.keys(data[c] || {})))];
    }

    cats.forEach(c => fCat?.appendChild(new Option(labelCategorie(c), c)));
    types.forEach(t => fType?.appendChild(new Option(t, t)));
  } catch (e) {
    console.error('[beheer] mestsoorten laden:', e);
    toast('Kon mestsoorten niet laden.', 'error');
  }
}

async function loadList(){
  if (!listEl) return;
  if (!allowDiscardIfDirty()) return;

  listEl.textContent = 'Laden…';

  let q = supabase.from('mest_uploads').select('*').order('created_at',{ ascending:false });
  if (fStatus?.value) q = q.eq('status', fStatus.value);
  if (fCat?.value)    q = q.eq('mest_categorie', fCat.value);
  if (fType?.value)   q = q.eq('mest_type', fType.value);

  const { data, error } = await q;
  if (error) { listEl.textContent = 'Fout bij laden'; console.error(error); return; }

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

  clearEditSession();
  bindItemActions(rows);
}

/* ========== RENDER & BINDINGS PER ITEM ========== */
function renderItem(r){
  const created = fmtDate(r.created_at);
  return `
    <details class="details-card" data-id="${escapeHtml(r.id)}">
      <summary class="item-summary">
        <span class="item-title">${escapeHtml(r.naam || '—')}</span>
        <span class="item-meta">${escapeHtml(labelCategorie(r.mest_categorie))}/${escapeHtml(r.mest_type || '—')} • ${escapeHtml(r.postcode || '—')} • ${created}</span>
        ${statusChip(r.status)}
      </summary>

      <div style="margin:.5rem 0;">
        <div style="display:flex; align-items:center; gap:.5rem;">
          <strong>Bestand:</strong>
          <button class="a-open btn-ghost" type="button">Bekijk analyse</button>
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
          <div class="admin-field">
            <label>Status</label>
            <select class="f-status">
              ${ALLOWED_STATUS.map(s => `<option ${s===r.status?'selected':''} value="${s}">${escapeHtml(s.replace('_',' '))}</option>`).join('')}
            </select>
          </div>
          <div class="admin-field">
            <label>Moderation note</label>
            <textarea class="f-note" placeholder="Reden/onderbouwing (verplicht bij afkeuren)">${escapeHtml(r.moderation_note || '')}</textarea>
          </div>
        </div>

        <div class="actions" style="margin-top:.75rem; display:flex; gap:.5rem;">
          <button class="btn-primary a-save"  type="button" disabled>Opslaan</button>
          <button class="btn-outline a-cancel" type="button" disabled>Wijzigingen ongedaan maken</button>
        </div>
      </div>
    </details>
  `;
}

function bindItemActions(rows){
  rows.forEach(r => {
    const root     = document.querySelector(`details[data-id="${CSS.escape(String(r.id))}"]`);
    if (!root) return;

    const btnSave  = root.querySelector('.a-save');
    const btnOpen  = root.querySelector('.a-open');
    const btnCancel= root.querySelector('.a-cancel');
    const statusEl = root.querySelector('.f-status');
    const noteEl   = root.querySelector('.f-note');
    const inputs   = root.querySelectorAll('input[data-k]');

    // --- Single-open gedrag + dirty guard ---
    root.addEventListener('toggle', () => {
      if (root.open) {
        if (editSession.dirty && editSession.id !== r.id) {
          const ok = confirm('Je hebt onopgeslagen wijzigingen. Doorgaan en wijzigingen verwerpen?');
          if (!ok) { root.open = false; return; }
          rollbackCurrentEdits();
        }
        toggleOnlyOneOpen(r.id);
        startEditSession(r, root);
      } else {
        if (editSession.id === r.id && editSession.dirty && !editSession.saving) {
          const ok = confirm('Wijzigingen zijn nog niet opgeslagen. Sluiten en wijzigingen verwerpen?');
          if (!ok) { root.open = true; return; }
          rollbackCurrentEdits();
          endEditSession();
        } else if (editSession.id === r.id && !editSession.saving) {
          endEditSession();
        }
      }
    });

    // --- Bestand openen (directe navigatie in NIEUW tabblad) ---
    btnOpen?.addEventListener('click', async () => {
      if (!r.file_path) { toast('Geen bestand beschikbaar.', 'error'); return; }

      // 1) Open meteen een leeg tabblad tijdens de user-gesture (voorkomt blockers)
      const newTab = window.open('about:blank', '_blank', 'noopener,noreferrer');
      if (!newTab) { toast('Pop-up geblokkeerd. Sta pop-ups toe voor deze site.', 'error'); return; }

      try {
        // 2) Signed URL ophalen
        const { data, error } = await supabase.storage
          .from('mest-analyses')
          .createSignedUrl(r.file_path, 60);
        if (error || !data?.signedUrl) throw error || new Error('Geen signed URL');

        // 3) Navigeer dat tabblad hard naar de andere origin
        try {
          newTab.location.replace(data.signedUrl);
        } catch {
          // fallback
          newTab.location.href = data.signedUrl;
        }
      } catch (e) {
        // Mislukt? Sluit het lege tabblad
        try { newTab.close(); } catch {}
        console.error('[beheer] createSignedUrl/open error:', e);
        toast('Kon bestand niet openen.', 'error');
      }
    });

    // Dirty-detect
    const markDirty = () => {
      if (editSession.id !== r.id) startEditSession(r, root);
      editSession.dirty = true;
      if (btnSave)   btnSave.disabled   = false;
      if (btnCancel) btnCancel.disabled = false;
    };
    [statusEl, noteEl, ...inputs].forEach(el => {
      el?.addEventListener('input', markDirty);
      el?.addEventListener('change', markDirty);
    });

    // Enter → save
    inputs.forEach(i => {
      i.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); btnSave?.click(); }
      });
    });
    // Cmd/Ctrl+S → save
    root.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); btnSave?.click();
      }
    });

    // Cancel → rollback
    btnCancel?.addEventListener('click', () => {
      if (editSession.id !== r.id) return;
      if (!editSession.dirty) return;
      rollbackCurrentEdits();
      restoreItemUIFromSnapshot(root, editSession.snapshot);
      editSession.dirty = false;
      btnSave.disabled = true;
      btnCancel.disabled = true;
    });

    // Save
    btnSave?.addEventListener('click', async () => {
      if (editSession.saving) return;
      if (editSession.id !== r.id) return;

      const newStatus = statusEl?.value;
      if (!ALLOWED_STATUS.includes(newStatus)) {
        toast('Ongeldige status.', 'error');
        return;
      }

      const note = (noteEl?.value || '').trim();
      if (newStatus === 'afgewezen' && note.length === 0) {
        toast('Geef een reden bij afwijzen.', 'error');
        noteEl?.focus(); return;
      }

      const patch = {
        status: newStatus,
        moderation_note: note || null,
        last_moderated_by: userId
      };
      inputs.forEach(i => {
        const key = i.getAttribute('data-k');
        patch[key] = asNumberOrNull(i.value);
      });

      // Disable UI tijdens save
      setItemInputsDisabled(root, true);
      editSession.saving = true;

      const prevLabel = btnSave.textContent;
      btnSave.textContent = 'Opslaan…';

      const { error } = await supabase.from('mest_uploads').update(patch).eq('id', r.id);

      // Re-enable UI
      editSession.saving = false;
      setItemInputsDisabled(root, false);
      btnSave.textContent = prevLabel;

      if (error) {
        console.error(error);
        toast(`Opslaan mislukt: ${error.message}`, 'error');
        return;
      }

      toast('Opgeslagen', 'success');
      editSession.dirty = false;
      btnSave.disabled = true;
      btnCancel.disabled = true;

      await loadList();
      const reopened = document.querySelector(`details[data-id="${CSS.escape(String(r.id))}"]`);
      if (reopened) reopened.open = true;
    });
  });

  toggleOnlyOneOpen(editSession.id);
}

/* ========== EDIT SESSION HELPERS ========== */
function startEditSession(row){
  editSession.id = row.id;
  editSession.dirty = false;
  editSession.saving = false;
  editSession.snapshot = {
    id: row.id,
    status: row.status,
    moderation_note: row.moderation_note || '',
    ds_percent: row.ds_percent,
    n_kg_per_ton: row.n_kg_per_ton,
    p_kg_per_ton: row.p_kg_per_ton,
    k_kg_per_ton: row.k_kg_per_ton,
    os_percent: row.os_percent,
    biogaspotentieel_m3_per_ton: row.biogaspotentieel_m3_per_ton
  };
}

function endEditSession(){
  editSession.id = null;
  editSession.dirty = false;
  editSession.saving = false;
  editSession.snapshot = null;
}

function clearEditSession(){
  endEditSession();
  document.querySelectorAll('details.details-card[open]').forEach(d => d.open = false);
}

function rollbackCurrentEdits(){
  if (!editSession.id || !editSession.snapshot) return;
  const root = document.querySelector(`details[data-id="${CSS.escape(String(editSession.id))}"]`);
  if (root) restoreItemUIFromSnapshot(root, editSession.snapshot);
  endEditSession();
}

function restoreItemUIFromSnapshot(root, snap){
  const statusEl = root.querySelector('.f-status');
  const noteEl   = root.querySelector('.f-note');
  const inputs   = root.querySelectorAll('input[data-k]');

  if (statusEl) statusEl.value = snap.status || 'in_behandeling';
  if (noteEl)   noteEl.value   = snap.moderation_note || '';

  const map = {
    ds_percent: snap.ds_percent,
    n_kg_per_ton: snap.n_kg_per_ton,
    p_kg_per_ton: snap.p_kg_per_ton,
    k_kg_per_ton: snap.k_kg_per_ton,
    os_percent: snap.os_percent,
    biogaspotentieel_m3_per_ton: snap.biogaspotentieel_m3_per_ton
  };
  inputs.forEach(i => {
    const k = i.getAttribute('data-k');
    const v = map[k];
    i.value = (v === null || v === undefined) ? '' : String(v);
  });

  const btnSave   = root.querySelector('.a-save');
  const btnCancel = root.querySelector('.a-cancel');
  if (btnSave)   btnSave.disabled = true;
  if (btnCancel) btnCancel.disabled = true;
}

function setItemInputsDisabled(root, on){
  root.querySelectorAll('input, select, textarea, button').forEach(el => {
    if (el.classList.contains('a-save') || el.classList.contains('a-cancel')) {
      el.disabled = on ? true : el.disabled;
    } else {
      el.disabled = on;
    }
  });
}

/** Zorgt dat slechts 1 details open is; id === null => sluit alles. */
function toggleOnlyOneOpen(id){
  const all = Array.from(document.querySelectorAll('details.details-card'));
  all.forEach(d => { if (id == null || d.dataset.id !== String(id)) d.open = false; });
}

/** Confirm helper voor weggooien wijzigingen */
function allowDiscardIfDirty(){
  if (!editSession.dirty || editSession.saving) return true;
  const ok = confirm('Je hebt onopgeslagen wijzigingen. Doorgaan en wijzigingen verwerpen?');
  if (ok) rollbackCurrentEdits();
  return ok;
}
