// kaart.js — selectie togglen + events voor automatische berekening

// --- Map init (met guards) ---
const mapEl = document.getElementById('map');
if (!window.L) {
  console.error('Leaflet (L) niet geladen. Controleer het <script> naar leaflet.js.');
}
if (!mapEl) {
  console.error('#map element niet gevonden in de DOM.');
}

const MAP_CENTER = [52.1, 5.1];
const MAP_ZOOM   = 7;

const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

// Zorg dat Leaflet de containermaat kent ná CSS layout + bij resizes
setTimeout(() => map.invalidateSize(), 0);
window.addEventListener('resize', () => {
  // throttle-ish: klein timeoutje voorkomt spam
  clearTimeout(window.__leafletResizeTO);
  window.__leafletResizeTO = setTimeout(() => map.invalidateSize(), 120);
});

// --- State ---
export let parcels = [];

function uuid() {
  return 'p_' + Math.random().toString(36).slice(2);
}

// Helper: wijzigings-event uitsturen (voor berekening.js)
function dispatchParcelsChanged() {
  try {
    window.dispatchEvent(new CustomEvent('parcels:changed', {
      detail: { parcels: [...parcels] } // veilige kopie
    }));
  } catch (e) {
    console.warn('Kon parcels:changed niet dispatchen:', e);
  }
}

// --- UI: lijst renderen ---
function renderParcelList() {
  const container = document.getElementById('parcelList');
  if (!container) return;

  container.innerHTML = '';
  parcels.forEach(p => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.dataset.id = p.id;
    div.innerHTML = `
      <h3>Perceel ${escapeHtml(p.name)}</h3>
      <div class="field-group"><label>Opp. (ha)</label><input readonly value="${escapeHtml(p.ha ?? '')}"></div>
      <div class="field-group"><label>Gewascode</label><input readonly value="${escapeHtml(p.gewasCode ?? '')}"></div>
      <div class="field-group"><label>Gewasnaam</label><input readonly value="${escapeHtml(p.gewasNaam ?? '')}"></div>
      <button class="remove-btn">Verwijder</button>
    `;
    div.querySelector('.remove-btn').onclick = () => {
      // laag van kaart + uit state
      if (p.layer) map.removeLayer(p.layer);
      parcels = parcels.filter(x => x.id !== p.id);
      renderParcelList();
      dispatchParcelsChanged();
    };
    container.append(div);
  });
}

// --- Klik op kaart: togglen ---
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;

  try {
    // 1) Perceel ophalen
    const res = await fetch(`/.netlify/functions/perceel?lon=${lng}&lat=${lat}`);
    if (!res.ok) throw new Error('Perceel-API ' + res.status);
    const data = await res.json();
    const feat = data?.features?.[0];
    if (!feat) throw new Error('Geen perceel gevonden');

    const props = feat.properties || {};
    const name  = props.weergavenaam
               || `${props.kadastraleGemeenteWaarde || ''} ${props.sectie || ''} ${props.perceelnummer || ''}`.trim();

    // 2) Toggle: als al geselecteerd → deselecteer en klaar
    const exist = parcels.find(p => p.name === name);
    if (exist) {
      if (exist.layer) map.removeLayer(exist.layer);
      parcels = parcels.filter(p => p.name !== name);
      renderParcelList();
      dispatchParcelsChanged();
      return;
    }

    // 3) Bodemsoort ophalen
    const bodemResp = await fetch(`/.netlify/functions/bodemsoort?lon=${lng}&lat=${lat}`);
    if (!bodemResp.ok) throw new Error('Bodemsoort-API ' + bodemResp.status);
    const bodem = await bodemResp.json();

    // 4) Laag tekenen
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // 5) Data samenstellen
    const ha = (props.kadastraleGrootteWaarde != null)
      ? (props.kadastraleGrootteWaarde / 10000).toFixed(2)
      : '';

    parcels.push({
      id: uuid(),
      layer,
      name,
      ha,
      gewasCode:  props.gewasCode   || '',
      gewasNaam:  props.gewasNaam   || '',
      provincie:  props.provincie   || '',
      grondsoort: bodem?.bodemsoortNaam || '',
      landgebruik: props.landgebruik || 'Onbekend'
    });

    // 6) Lijst + event
    renderParcelList();
    dispatchParcelsChanged();

  } catch (err) {
    console.error('Perceel fout:', err);
    alert('Fout bij ophalen perceel. Probeer opnieuw.');
  }
});

// --- Kleine util ---
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Optioneel: direct init van de (lege) lijst en change-event
renderParcelList();
dispatchParcelsChanged();
