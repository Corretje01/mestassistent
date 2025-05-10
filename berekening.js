// berekening.js — mestberekening voor meerdere percelen

// 1) Laad de grondgebonden stikstofnormen (tabel 2)
let stikstofnormen = {};
fetch('/data/stikstofnormen_tabel2.json')
  .then(res => res.json())
  .then(json => stikstofnormen = json)
  .catch(err => console.error('❌ Kan stikstofnormen niet laden:', err));

const mestForm = document.getElementById('mestForm');
if (mestForm) {
  mestForm.addEventListener('submit', e => {
    e.preventDefault();

    // 2) Controle: is er minstens één perceel geselecteerd?
    if (!Array.isArray(parcels) || parcels.length === 0) {
      alert('Selecteer eerst minstens één perceel.');
      return;
    }
    // 3) Controle: zijn de stikstofnormen geladen?
    if (Object.keys(stikstofnormen).length === 0) {
      alert('Stikstofnormen nog niet geladen, probeer opnieuw.');
      return;
    }

    let totaalN = 0;
    let totaalP = 0;

    // 4) Loop over alle geselecteerde percelen
    parcels.forEach(p => {
      const ha         = parseFloat(p.ha) || 0;
      const grond      = p.grondsoort || 'Zand';
      const gewasCode  = p.gewasCode;
      const landgebruik = (p.landgebruik || '').toLowerCase();

      // --- A-norm (vast) 170 kg N/ha ---
      const A_ha = 170;

      // --- B-norm (grondgebonden N) uit JSON op basis van gewascode & grondsoort ---
      let normEntry = stikstofnormen[p.gewasNaam]
                   || Object.values(stikstofnormen)
                       .find(entry => entry.Gewascodes.includes(gewasCode));

      if (!normEntry) {
        console.warn(`Geen grondgebonden stikstofnorm voor gewascode ${gewasCode}`);
        return;
      }
      const B_ha = (normEntry[grond] !== undefined)
                 ? normEntry[grond]
                 : normEntry['Noordelijk, westelijk en centraal zand'];

      // --- C-norm (fosfaat) afh. van landgebruik ---
      // Grasland → 75 kg P/ha; anders (bouwland) → 40 kg P/ha
      const C_ha = landgebruik.includes('grasland') ? 75 : 40;

      // --- Gebruiksruimte stikstof per ha = min(A, B) ---
      const N_ha = Math.min(A_ha, B_ha);

      totaalN += N_ha * ha;
      totaalP += C_ha  * ha;
    });

    // 5) Toon het eindresultaat
    document.getElementById('resultaat').innerHTML = `
      <div class="resultaat-blok">
        <h2>Eindtotaal mestruimte</h2>
        <p><strong>Stikstof (N):</strong> ${totaalN.toFixed(0)} kg</p>
        <p><strong>Fosfaat (P):</strong> ${totaalP.toFixed(0)} kg</p>
      </div>
    `;
  });
}
