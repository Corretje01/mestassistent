// kaart.js — toggling van perceelsselectie met behoud van originele flow
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

// Zorg dat Leaflet de containermaat kent ná CSS layout
setTimeout(() => map.invalidateSize(), 0);


export let parcels = [];
function uuid() {
  return 'p_' + Math.random().toString(36).slice(2);
}

// Rendering van de percelenlijst blijft ongewijzigd:
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  parcels.forEach(p => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.innerHTML = `
      <h3>Perceel ${p.name}</h3>
      <div class="field-group"><label>Opp. (ha)</label><input readonly value="${p.ha}"></div>
      <div class="field-group"><label>Gewascode</label><input readonly value="${p.gewasCode}"></div>
      <div class="field-group"><label>Gewasnaam</label><input readonly value="${p.gewasNaam}"></div>
      <button class="remove-btn">Verwijder</button>
    `;
    div.querySelector('.remove-btn').onclick = () => {
      map.removeLayer(p.layer);
      parcels = parcels.filter(x => x.id !== p.id);
      renderParcelList();
    };
    container.append(div);
  });
}

// Klik op kaart: togglet selectie in plaats van altijd toevoegen
map.on('click', async e => {
  const { lat, lng } = e.latlng;
  try {
    // 1) Perceel ophalen
    const res = await fetch(`/.netlify/functions/perceel?lon=${lng}&lat=${lat}`);
    if (!res.ok) throw new Error('Perceel-API ' + res.status);
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) throw new Error('Geen perceel gevonden');

    // Unieke naam bepalen (zoals in origineel) :contentReference[oaicite:0]{stap1=0}:contentReference[oaicite:1]{stap1=1}
    const props = feat.properties;
    const name  = props.weergavenaam
                || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;

    // 2) Toggle: als dit perceel al in de lijst zit, deselecteer en return
    const exist = parcels.find(p => p.name === name);
    if (exist) {
      map.removeLayer(exist.layer);
      parcels = parcels.filter(p => p.name !== name);
      renderParcelList();
      return;
    }

    // 3) Bodemsoort ophalen (net als origineel) :contentReference[oaicite:2]{stap1=2}:contentReference[oaicite:3]{stap1=3}
    const bodemResp = await fetch(`/.netlify/functions/bodemsoort?lon=${lng}&lat=${lat}`);
    if (!bodemResp.ok) throw new Error('Bodemsoort-API ' + bodemResp.status);
    const bodem = await bodemResp.json();

    // 4) Teken nieuw perceel
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // 5) Gegevens samenvoegen en toevoegen aan array
    const ha = props.kadastraleGrootteWaarde
             ? (props.kadastraleGrootteWaarde / 10000).toFixed(2)
             : '';
    parcels.push({
      id:         uuid(),
      layer,
      name,
      ha,
      gewasCode:   props.gewasCode   || '',
      gewasNaam:   props.gewasNaam   || '',
      provincie:   props.provincie,
      grondsoort:  bodem.bodemsoortNaam,
      landgebruik: props.landgebruik || 'Onbekend'
    });

    // 6) Lijst bijwerken
    renderParcelList();

  } catch (err) {
    console.error('Perceel fout:', err);
    alert('Fout bij ophalen perceel. Probeer opnieuw.');
  }
});
