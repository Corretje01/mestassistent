// beheer.js
import { supabase } from './supabaseClient.js';
import { toast } from './utils.js';

const listEl  = document.getElementById('adminList');
const fStatus = document.getElementById('fStatus');
const fQuery  = document.getElementById('fQuery');
const fCat    = document.getElementById('fCategorie');
const fType   = document.getElementById('fType');

const ALLOWED_STATUS = ['in_behandeling', 'gepubliceerd', 'afgewezen'];

let session, userId, isAdmin = false;

(async function init() {
  ({ data: { session } } = await supabase.auth.getSession());
  if (!session) { window.location.href = 'account.html'; return; }
  userId = session.user.id;

  // check admin
  const { data: prof, error: profErr } = await supabase
    .from('profiles').select('role').eq('id', userId).single();

  if (profErr) {
    toast('Kon profiel niet laden.', 'error');
    window.location.href = '/';
    return;
  }

  isAdmin = prof?.role === 'admin';
  if (!isAdmin) { toast('Geen toegang', 'error'); window.location.href = '/'; return; }

  // filters
  await loadMestSoorten();
  bindFilters();
  await loadList();
})();

function bindFilters() {
  [fStatus, fCat, fType].forEach(el => el?.addEventListener('change', loadList));
  fQuery?.addEventListener('input', debounce(loadList, 300));
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Gebruik nette NL labels voor categorie
function labelCategorie(c) {
  const map = { drijfmest: 'Drijfmest', vaste_mest: 'Vaste mest', dikke_fractie: 'Dikke fractie', overig: 'Overig' };
  return map[c] || String(c).replace(/_/g, ' ');
}

// Laad mestsoorten.json -> vul filter dropdowns (werkt met array- én object-vorm)
async function loadMestSoorten() {
  try {
    const resp = await fetch('data/mestsoorten.json', { cache: 'no-store' });
    const data = await resp.json();

    let cats = [];
    let types = [];

    if (Array.isArray(data)) {
      // oude array-vorm: [{ categorie, type, ... }]
      cats  = [...new Set(data.map(m => m.categorie).filter(Boolean))];
      types = [...new Set(data.map(m => m.type).filter(Boolean))];
    } else if (data && typeof data === 'object') {
      // object-vorm: { drijfmest: { koe: {...}, varken: {...} }, vaste_mest: {...}, ... }
      cats = Object.keys(data || {});
      types = [
        ...new Set(
          cats.flatMap(c => Object.keys(data[c] || {}))
        )
      ];
    }

    // vul selects (laat bestaande "Alle ..." optie staan)
    cats.forEach(c => fCat?.appendChild(new Option(labelCategorie(c), c)));
    types.forEach(t => fType?.appendChild(new Option(t, t)));
  } catch (e) {
    console.error(e);
    toast('Kon mestsoorten niet laden.', 'error');
  }
}

async function loadList() {
  listEl.textContent = 'Laden…';

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

  listEl.innerHTML = rows.length
    ? rows.map(renderItem).join('')
    : '<div class="muted">Geen resultaten</div>';

  bindItemActions(rows);
}

function renderItem(r) {
  return `
    <details data-id="${r.id}">
      <summary><strong>${escapeHtml(r.naam)}</strong> — ${escapeHtml(r.mest_categorie)}/${escapeHtml(r.mest_type)} — ${escapeHtml(r.postcode)} — <em>${escapeHtml(r.status)}</em></summary>
      <div style="margin:.5rem 0;">
        <div><strong>Bestand:</strong> <button class="a-open">Bekijk analyse</button></div>
        <div class="row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:.5rem;">
          ${input('ds_percent','DS %', r.ds_percent)}
          ${input('n_kg_per_ton','N kg/ton', r.n_kg_per_ton)}
          ${input('p_kg_per_ton','P kg/ton', r.p_kg_per_ton)}
          ${input('k_kg_per_ton','K kg/ton', r.k_kg_per_ton)}
          ${input('os_percent','OS % (opt)', r.os_percent)}
          ${input('biogaspotentieel_m3_per_ton','Biogas m³/ton (opt)', r.biogaspotentieel_m3_per_ton)}
        </div>
        <div style="margin-top:.5rem;">
          <label>Status
            <select class="f-status">
              ${ALLOWED_STATUS.map(s=>`<option ${s===r.status?'selected':''} value="${s}">${s.replace('_',' ')}</option>`).join('')}
            </select>
          </label>
        </div>
        <div style="margin-top:.5rem;">
          <label>Moderation note</label>
          <textarea class="f-note" placeholder="Reden/onderbouwing (verplicht bij afkeuren)">${escapeHtml(r.moderation_note || '')}</textarea>
        </div>
        <div class="actions" style="margin-top:.5rem;">
          <button class="btn-primary a-save">Opslaan</button>
        </div>
      </div>
    </details>
  `;
}

function input(key, label, val) {
  const v = (val === null || val === undefined) ? '' : String(val);
  return `<label>${label}<input data-k="${key}" value="${escapeHtml(v)}" inputmode="decimal"/></label>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function asNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bindItemActions(rows) {
  rows.forEach(r => {
    const root     = document.querySelector(`details[data-id="${r.id}"]`);
    const btnSave  = root.querySelector('.a-save');
    const btnOpen  = root.querySelector('.a-open');
    const statusEl = root.querySelector('.f-status');
    const noteEl   = root.querySelector('.f-note');
    const inputs   = root.querySelectorAll('input[data-k]');

    // Open file (signed URL)
    btnOpen.addEventListener('click', async () => {
      if (!r.file_path) { toast('Geen bestandspad beschikbaar.', 'error'); return; }
      const { data, error } = await supabase.storage
        .from('mest-analyses')
        .createSignedUrl(r.file_path, 60);
      if (error) { toast(`Kon bestand niet openen: ${error.message}`, 'error'); return; }
      window.open(data.signedUrl, '_blank', 'noopener');
    });

    // Enter in een van de inputs => save
    inputs.forEach(i => {
      i.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnSave.click();
        }
      });
    });

    btnSave.addEventListener('click', async () => {
      // Valideer status
      const newStatus = statusEl.value;
      if (!ALLOWED_STATUS.includes(newStatus)) {
        toast('Ongeldige status.', 'error');
        return;
      }

      // Reden verplicht bij afwijzen
      const note = (noteEl.value || '').trim();
      if (newStatus === 'afgewezen' && note.length === 0) {
        toast('Geef een reden bij afwijzen.', 'error');
        noteEl.focus();
        return;
      }

      // Bouw patch; parse numeriek met komma-ondersteuning
      const patch = {
        status: newStatus,
        moderation_note: note || null,
        last_moderated_by: userId
      };
      inputs.forEach(i => {
        const key = i.getAttribute('data-k');  // <-- lowercase keys
        patch[key] = asNumberOrNull(i.value);
      });

      // Disable knop tijdens save
      const prevLabel = btnSave.textContent;
      btnSave.disabled = true;
      btnSave.textContent = 'Opslaan…';

      const { error } = await supabase
        .from('mest_uploads')
        .update(patch)
        .eq('id', r.id);

      btnSave.disabled = false;
      btnSave.textContent = prevLabel;

      if (error) {
        toast(`Opslaan mislukt: ${error.message}`, 'error');
      } else {
        toast('Opgeslagen', 'success');
        await loadList();
      }
    });
  });
}
