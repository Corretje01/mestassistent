// berekening.js — mestplaatsingsruimte-berekening

// 1) Laad JSON met grondgebonden stikstofnormen (Tabel 2)
let stikstofnormen = {};
fetch('/data/stikstofnormen_tabel2.json')
  .then(res => res.json())
  .then(json => stikstofnormen = json)
  .catch(err => console.error('❌ Kan stikstofnormen niet laden:', err));

const mestForm = document.getElementById('mestForm');
if (mestForm) {
  mestForm.addEventListener('submit', e => {
    e.preventDefault();

    // 2) Validatie
    if (!Array.isArray(parcels) || parcels.length === 0) {
      alert('Selecteer eerst minstens één perceel.');
      return;
    }
    if (Object.keys(stikstofnormen).length === 0) {
      alert('Wacht tot de stikstofnormen geladen zijn.');
      return;
    }

    // 3) Totalen berekenen
    let totaalA = 0;  // dierlijke mest N
    let totaalB = 0;  // grondgebonden N
    let totaalC = 0;  // fosfaat P

    parcels.forEach(p => {
      const ha         = parseFloat(p.ha) || 0;
      const grond      = p.grondsoort || 'Zand';
      const gewasCode  = p.gewasCode;
      const landgebruik= (p.landgebruik || '').toLowerCase();

      // A-norm = 170 kg N/ha
      const A_ha = 170;

      // B-norm uit JSON
      const entry = stikstofnormen[p.gewasNaam]
                  || Object.values(stikstofnormen)
                       .find(o => o.Gewascodes.includes(gewasCode));
      if (!entry) return console.warn(`Geen B-norm voor code ${gewasCode}`);
      const B_ha = entry[grond] ?? entry['Noordelijk, westelijk en centraal zand'];

      // C-norm (fosfaat)
      const C_ha = landgebruik.includes('grasland') ? 75 : 40;

      totaalA += A_ha * ha;
      totaalB += B_ha * ha;
      totaalC += C_ha * ha;
    });

    // 4) Conclusie waarden
    const N_max = Math.min(totaalA, totaalB);
    const P_max = totaalC;

    // 5) Render resultaat **+** knop naar stap 2
    document.getElementById('resultaat').innerHTML = `
      <div class="resultaat-blok">
        <p><strong>Totaal N dierlijke mest:</strong> ${totaalA.toFixed(0)} kg N</p>
        <p><strong>Totaal N grondgebonden:</strong> ${totaalB.toFixed(0)} kg N</p>
        <p><strong>Totaal P fosfaat:</strong> ${totaalC.toFixed(0)} kg P</p>
      </div>
      <h2>Conclusie gebruiksruimte</h2>
      <div class="resultaat-blok">
        <p><strong>Max. stikstof (N):</strong> ${N_max.toFixed(0)} kg</p>
        <p><strong>Max. fosfaat (P):</strong> ${P_max.toFixed(0)} kg</p>
      </div>
      <div style="margin-top:1.5rem; text-align:right;">
        <button
          class="btn btn-primary"
          onclick="window.location.href='mestplan.html'"
        >
          Ga naar stap 2
        </button>
      </div>
    `;
  });
}
