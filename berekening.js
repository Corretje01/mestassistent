// berekening.js — mestberekening voor meerdere percelen

// Laad de grondgebonden stikstofnormen (tabel 2)
let stikstofnormen = {};
fetch('/data/stikstofnormen_tabel2.json')
  .then(res => res.json())
  .then(json => stikstofnormen = json)
  .catch(err => console.error('❌ Kan stikstofnormen niet laden:', err));

const mestForm = document.getElementById('mestForm');
if (mestForm) {
  mestForm.addEventListener('submit', e => {
    e.preventDefault();

    // 1) Check percelen en normen
    if (!Array.isArray(parcels) || parcels.length === 0) {
      alert('Selecteer eerst minstens één perceel.');
      return;
    }
    if (Object.keys(stikstofnormen).length === 0) {
      alert('Wacht tot stikstofnormen zijn geladen.');
      return;
    }

    // 2) Variabelen voor totalen
    let totaalA = 0; // dierlijke mest N
    let totaalB = 0; // grondgebonden N
    let totaalC = 0; // fosfaat P

    // 3) Perceel-loop
    parcels.forEach(p => {
      const ha          = parseFloat(p.ha) || 0;
      const grond       = p.grondsoort || 'Zand';
      const gewasCode   = p.gewasCode;
      const landgebruik = (p.landgebruik || '').toLowerCase();

      // A-norm: vast 170 kg N/ha
      const A_ha = 170;

      // B-norm: uit JSON op basis van code & grondsoort
      let entry = stikstofnormen[p.gewasNaam]
               || Object.values(stikstofnormen)
                   .find(o => o.Gewascodes.includes(gewasCode));
      if (!entry) {
        console.warn(`Geen B-norm voor gewascode ${gewasCode}`);
        return;
      }
      const B_ha = entry[grond] ?? entry['Noordelijk, westelijk en centraal zand'];

      // C-norm: afhankelijk van landgebruik
      const C_ha = landgebruik.includes('grasland') ? 75 : 40;

      // Optellen per perceel
      totaalA += A_ha * ha;
      totaalB += B_ha * ha;
      totaalC += C_ha * ha;
    });

    // 4) Berekeningen eindresultaat
    const N_max = Math.min(totaalA, totaalB);
    const P_max = totaalC;

    // 5) Render resultaat
    document.getElementById('resultaat').innerHTML = `
      <div class="resultaat-blok">
        <h2>Berekening A (dierlijke mest N)</h2>
        <p><strong>A-totaal:</strong> ${totaalA.toFixed(0)} kg N</p>
      </div>
      <div class="resultaat-blok">
        <h2>Berekening B (grondgebonden N)</h2>
        <p><strong>B-totaal:</strong> ${totaalB.toFixed(0)} kg N</p>
      </div>
      <div class="resultaat-blok">
        <h2>Berekening C (fosfaat P)</h2>
        <p><strong>C-totaal:</strong> ${totaalC.toFixed(0)} kg P</p>
      </div>
      <div class="resultaat-blok">
        <h2>Conclusie gebruiksruimte</h2>
        <p><strong>Max. stikstof (N):</strong> ${N_max.toFixed(0)} kg</p>
        <p><strong>Max. fosfaat (P):</strong> ${P_max.toFixed(0)} kg</p>
      </div>
    `;
  });
}
