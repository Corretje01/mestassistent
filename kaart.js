// kaart.js — toggling van perceelsselectie

const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

let parcels = [];

function uuid() {
  return 'p_' + Math.random().toString(36).slice(2);
}

// Slimme rendering: precies vier velden, plus verwijder-knop
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

map.on('click', async e => {
  const { lat, lng } = e.latlng;
  try {
    // 1) Perceel ophalen
    const res = await fetch(`/.netlify/functions/perceel?lon=${lng}&lat=${lat}`);
    if (!res.ok) throw new Error('Perceel-API ' + res.status);
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) throw new Error('Geen perceel gevonden');

    // 2) Bodemsoort ophalen
    const bodemResp = await fetch(`/.netlify/functions/bodemsoort?lon=${lng}&lat=${lat}`);
    if (!bodemResp.ok) throw new Error('Bodemsoort-API ' + bodemResp.status);
    const bodem = await bodemResp.json();

    // 3) Teken perceel met toggle-handler
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 },
      onEachFeature: (feature, layer) => {
        layer.on('click', evt => {
          // voorkom dat deze click de map.on('click') triggert
          L.DomEvent.stopPropagation(evt);
          // als dit layer al in parcels zit, verwijderen we 'm
          const existing = parcels.find(p => p.layer === layer);
          if (existing) {
            map.removeLayer(layer);
            parcels = parcels.filter(p => p.layer !== layer);
            renderParcelList();
          }
        });
      }
    }).addTo(map);

    // 4) Bouw perceel-object en check op duplicate before push
    const props = feat.properties;
    const name  = props.weergavenaam
                || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const ha    = props.kadastraleGrootteWaarde
                ? (props.kadastraleGrootteWaarde / 10000).toFixed(2)
                : '';

    // Kijk of we deze geometry al hebben—layer equality is genoeg dankzij toggle-handler
    const already = parcels.some(p => {
      // eenvoudige check: gelijk object reference?
      // (oude layers zijn verwijderd bij deselect)
      return false;
    });
    // altijd push; deselect gebeurt in onEachFeature
    parcels.push({
      id:         uuid(),
      layer,
      name,
      ha,
      gewasCode:   props.gewasCode  || '',
      gewasNaam:   props.gewasNaam  || '',
      provincie:   props.provincie,
      grondsoort:  bodem.grondsoort,
      landgebruik: props.landgebruik || 'Onbekend'
    });

    renderParcelList();

  } catch (err) {
    console.error('Perceel fout:', err);
    alert('Fout bij ophalen perceel. Probeer opnieuw.');
  }
});
