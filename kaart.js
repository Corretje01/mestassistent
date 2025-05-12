// kaart.js — initialisatie en percelenlijst (precisie-fix)

let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json niet geladen:', err));

function getBaseCategory(name) {
  const e = soilMapping.find(x => x.name === name);
  return e?.category || 'Onbekend';
}

const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

let parcels = [];
function uuid() { return 'p_' + Math.random().toString(36).slice(2); }

function renderParcelList() {
  const container = document.getElementById('parcelList');
  if (!container) return;
  container.innerHTML = '';

  parcels.forEach(p => {
    const item = document.createElement('div');
    item.className = 'parcel-item';

    // Titel
    const h3 = document.createElement('h3');
    h3.textContent = `Perceel ${p.name}`;
    item.appendChild(h3);

    // Helper voor veld-groep
    const makeField = (label, val, type='text') => {
      const fg = document.createElement('div');
      fg.className = 'field-group';
      const lbl = document.createElement('label');
      lbl.textContent = label;
      const inp = document.createElement('input');
      inp.type = type;
      inp.value = val;
      inp.readOnly = true;
      fg.append(lbl, inp);
      return fg;
    };

    item.appendChild(makeField('Opp. (ha)',  p.ha,        'number'));
    item.appendChild(makeField('Gewascode',  p.gewasCode));
    item.appendChild(makeField('Gewasnaam',  p.gewasNaam));

    const btn = document.createElement('button');
    btn.textContent = 'Verwijder';
    btn.className = 'remove-btn';
    btn.onclick = () => removeParcel(p.id);
    item.appendChild(btn);

    container.appendChild(item);
  });
}

function removeParcel(id) {
  const idx = parcels.findIndex(p => p.id === id);
  if (idx >= 0) {
    map.removeLayer(parcels[idx].layer);
    parcels.splice(idx, 1);
    renderParcelList();
  }
}

map.on('click', async e => {
  const { lat, lng } = e.latlng;

  // Deselection: klik in bestaand perceel
  for (const p of parcels) {
    if (p.layer.getBounds().contains(e.latlng)) {
      return removeParcel(p.id);
    }
  }

  try {
    // 1) Perceel ophalen met originele params en volle precisie
    const resP = await fetch(`/.netlify/functions/perceel?lat=${lat}&lng=${lng}`);
    if (!resP.ok) throw new Error(`Perceel-API returned ${resP.status}`);
    const dataP = await resP.json();
    const feat  = dataP.features?.[0];
    if (!feat) throw new Error('Geen perceel gevonden');

    // 2) Bodemsoort ophalen met originele params
    const resB = await fetch(`/.netlify/functions/bodemsoort?lat=${lat}&lng=${lng}`);
    if (!resB.ok) throw new Error(`Bodemsoort-API returned ${resB.status}`);
    const dataB = await resB.json();

    // 3) Polygon tekenen
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // 4) Properties verwerken
    const props = feat.properties;
    const naam  = props.weergavenaam
                || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde;
    const ha    = opp != null ? (opp / 10000).toFixed(2) : '';

    let baseCat = getBaseCategory(dataB.bodemsoortNaam || '');
    if (baseCat === 'Zand') {
      baseCat = ['Limburg','Noord-Brabant'].includes(props.provincie)
              ? 'Zuidelijk zand'
              : 'Noordelijk, westelijk en centraal zand';
    }

    // 5) Parcels-data (zonder NV-gebied)
    parcels.push({
      id:          uuid(),
      layer,
      name:        naam,
      ha,
      gewasCode:   props.gewasCode || '',
      gewasNaam:   props.gewasNaam || '',
      provincie:   props.provincie,
      grondsoort:  baseCat,
      landgebruik: props.landgebruik || 'Onbekend'
    });

    renderParcelList();

  } catch (err) {
    console.error('Perceel fout:', err);
    alert('Fout bij ophalen perceel.');
  }
});
