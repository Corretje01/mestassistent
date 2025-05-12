// kaart.js — initialisatie en percelenlijst

// 1) Laad soilMapping (unmodified)
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json niet geladen:', err));

function getBaseCategory(name) {
  const e = soilMapping.find(x => x.name === name);
  return e?.category || 'Onbekend';
}

// 2) Map init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

// 3) Parcels opslaan
let parcels = [];
function uuid() { return 'p_' + Math.random().toString(36).slice(2); }

// 4) Klik op kaart: percelen ophalen
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // Deselect klik binnen bestaand perceel
  for (const p of parcels) {
    if (p.layer.getBounds().contains(e.latlng)) {
      return removeParcel(p.id);
    }
  }

  try {
    // a) perceel
    const resP = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
    if (!resP.ok) throw new Error(`Perceel-API ${resP.status}`);
    const dataP = await resP.json();
    const feat  = dataP.features?.[0];
    if (!feat) throw new Error('Geen perceel gevonden');

    // b) bodemsoort
    const resB = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    if (!resB.ok) throw new Error(`Bodemsoort-API ${resB.status}`);
    const dataB = await resB.json();

    // polygon tekenen
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // properties
    const props = feat.properties;
    const naam  = props.weergavenaam
                || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde;
    const ha    = opp!=null ? (opp/10000).toFixed(2) : '';

    // bodemsoort categoriseren
    let baseCat = getBaseCategory(dataB.bodemsoortNaam || '');
    if (baseCat==='Zand') {
      baseCat = ['Limburg','Noord-Brabant'].includes(props.provincie)
              ? 'Zuidelijk zand'
              : 'Noordelijk, westelijk en centraal zand';
    }

    // push naar parcels
    parcels.push({
      id:         uuid(),
      layer,
      name:       naam,
      ha,
      gewasCode:  props.gewasCode || '',
      gewasNaam:  props.gewasNaam || '',
      provincie:  props.provincie,
      grondsoort: baseCat,
      landgebruik: props.landgebruik || 'Onbekend'
    });

    renderParcelList();

  } catch (err) {
    console.error('Perceel fout:', err);
    alert('Fout bij ophalen perceel.');
  }
});

// 5) Verwijder helper
function removeParcel(id) {
  const idx = parcels.findIndex(p=>p.id===id);
  if (idx>=0) {
    map.removeLayer(parcels[idx].layer);
    parcels.splice(idx,1);
    renderParcelList();
  }
}

// 6) Render alleen titel + 3 velden
function renderParcelList() {
  const container = document.getElementById('parcelList');
  if (!container) return;
  container.innerHTML = '';

  parcels.forEach(p => {
    const item = document.createElement('div');
    item.className = 'parcel-item';

    // titel
    const h3 = document.createElement('h3');
    h3.textContent = `Perceel ${p.name}`;
    item.appendChild(h3);

    // field-groups
    const fg = (label, val, type='text') => {
      const div = document.createElement('div');
      div.className = 'field-group';
      const lbl = document.createElement('label');
      lbl.textContent = label;
      const inp = document.createElement('input');
      inp.type = type; inp.value = val; inp.readOnly = true;
      div.append(lbl, inp);
      return div;
    };

    item.appendChild(fg('Opp. (ha)',   p.ha,         'number'));
    item.appendChild(fg('Gewascode',   p.gewasCode));
    item.appendChild(fg('Gewasnaam',   p.gewasNaam));

    // verwijder knop
    const btn = document.createElement('button');
    btn.textContent = 'Verwijder';
    btn.className = 'remove-btn';
    btn.onclick = ()=> removeParcel(p.id);
    item.appendChild(btn);

    container.appendChild(item);
  });
}
