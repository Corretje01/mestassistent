// kaart.js — initialisatie en percelenlijst

// 1) Map initialisatie (ongewijzigd)
const map = L.map('map').setView([52.1, 5.2], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap-contributors'
}).addTo(map);

// 2) Parcels-array
let parcels = [];

// 3) Klik-event: haal perceel- en bodemdata op
map.on('click', async e => {
  try {
    // a) Perceel via Netlify Function
    const percResp = await fetch(`/functions/perceel?lat=${e.latlng.lat}&lng=${e.latlng.lng}`);
    const percData = await percResp.json();
    // b) Bodemsoort via Netlify Function
    const bodemResp = await fetch(`/functions/bodemsoort?lat=${e.latlng.lat}&lng=${e.latlng.lng}`);
    const bodemData = await bodemResp.json();

    // Maak p-object zonder NV-gebied
    const p = {
      identificatieLokaalID: percData.identificatieLokaalID,
      ha: percData.surfaceHa,
      gewasCode: percData.gewasCode,
      gewasNaam: percData.gewasNaam,
      grondsoort: bodemData.bodemsoortNaam,
      landgebruik: percData.landgebruik
    };

    parcels.push(p);
    renderParcelList();
  } catch (err) {
    console.error('Perceel fout:', err);
    alert('Fout bij het ophalen van het perceel.');
  }
});

// 4) Render de lijst met alleen de vier gevraagde velden
function renderParcelList() {
  const container = document.getElementById('parcelList');
  if (!container) return;
  container.innerHTML = '';

  parcels.forEach((p, idx) => {
    const item = document.createElement('div');
    item.classList.add('parcel-item');

    // Helper: één field-group maken
    const makeField = (labelText, name, value, type='text') => {
      const fg = document.createElement('div');
      fg.classList.add('field-group');
      const lbl = document.createElement('label');
      lbl.textContent = labelText;
      const inp = document.createElement('input');
      inp.type = type;
      inp.name = name;
      inp.value = value;
      inp.readOnly = true;
      fg.append(lbl, inp);
      return fg;
    };

    // Voeg alleen de velden toe die de gebruiker ziet
    item.append(
      makeField('Perceel',      'perceel',    p.identificatieLokaalID),
      makeField('Opp. (ha)',    'ha',         p.ha,      'number'),
      makeField('Gewascode',    'gewasCode',  p.gewasCode),
      makeField('Gewasnaam',    'gewasNaam',  p.gewasNaam)
    );

    // Verwijder-knop
    const btn = document.createElement('button');
    btn.textContent = 'Verwijder';
    btn.classList.add('remove-parcel');
    btn.addEventListener('click', () => {
      parcels.splice(idx, 1);
      renderParcelList();
    });
    item.appendChild(btn);

    container.appendChild(item);
  });
}
