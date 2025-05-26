// berekening.js — mestplaatsingsruimte-berekening

// 1) Laad JSON met grondgebonden stikstofnormen (Tabel 2)
let stikstofnormen = {};
fetch('/data/stikstofnormen_tabel2.json')
  .then(res => res.json())
  .then(json => stikstofnormen = json)
  .catch(err => console.error('❌ Kan stikstofnormen niet laden:', err));

// 2) Form listener
const mestForm = document.getElementById('mestForm');
if (mestForm) {
  mestForm.addEventListener('submit', e => {
    e.preventDefault();

    // 3) Validatie: percelen én normen moeten geladen zijn
    if (!Array.isArray(parcels) || parcels.length === 0) {
      alert('Selecteer eerst minstens één perceel.');
      return;
    }
    if (Object.keys(stikstofnormen).length === 0) {
      alert('Wacht even tot de stikstofnormen geladen zijn.');
      return;
    }

    // 4) Totalen berekenen
    let totaalA = 0;  // N uit dierlijke mest
    let totaalB = 0;  // grondgebonden N
    let totaalC = 0;  // P uit mest

    parcels.forEach(p => {
      const ha         = parseFloat(p.ha) || 0;
      const grond      = p.grondsoort || 'Zand';
      const gewasCode  = p.gewasCode;
      const landgebruik= (p.landgebruik || '').toLowerCase();

      // A-norm per hectare
      const A_ha = 170;

      // B-norm uit JSON: probeer op gewasnaam, anders via Gewascodes
      const entry = stikstofnormen[p.gewasNaam]
        || Object.values(stikstofnormen)
             .find(o => o.Gewascodes.includes(gewasCode));
      const B_ha = entry
        ? (entry[grond] ?? entry['Noordelijk, westelijk en centraal zand'])
        : 0;

      // C-norm (fosfaat): grasland 75 kg, anders 40 kg per ha
      const C_ha = landgebruik.includes('grasland') ? 75 : 40;

      totaalA += A_ha * ha;
      totaalB += B_ha * ha;
      totaalC += C_ha * ha;
    });

    // 5) Render conclusie inclusief uitleg
    document.getElementById('resultaat').innerHTML = `
      <h2>Conclusie gebruiksruimte</h2>
      <p>Op basis van de geselecteerde percelen is dit de maximale hoeveelheid stikstof en fosfaat die je mag gebruiken:</p>
      <div class="resultaat-blok">
        <p><strong>Max. stikstof (N) uit dierlijke mest:</strong> ${totaalA.toFixed(0)} kg</p>
        <p><strong>Max. stikstof (N) uit alle soorten mest:</strong> ${totaalB.toFixed(0)} kg</p>
        <p><strong>Max. fosfaat (P):</strong> ${totaalC.toFixed(0)} kg</p>
      </div>
      <div style="margin-top:1.5rem; text-align:right;">
        <button
          class="btn btn-primary"
          onclick="window.location.href='mestplan.html?totaalA=' + ${totaalA.toFixed(0)} + '&totaalB=' + ${totaalB.toFixed(0)} + '&totaalC=' + ${totaalC.toFixed(0)}"
        >
          Ga naar stap 2
        </button>
      </div>
    `;
  });
}
