// berekening.js — mestberekening voor meerdere percelen

// 1) Laad de grondgebonden stikstofnormen (tabel 2) als JSON
let stikstofnormen = {};
fetch('/data/stikstofnormen_tabel2.json')
  .then(res => res.json())
  .then(json => stikstofnormen = json)
  .catch(err => console.error('❌ Kan stikstofnormen niet laden:', err));

const mestForm = document.getElementById('mestForm');
if (mestForm) {
  mestForm.addEventListener('submit', e => {
    e.preventDefault();

    // 2) Checks
    if (!window.parcels || parcels.length === 0) {
      alert('Selecteer eerst minstens één perceel.');
      return;
    }
    if (Object.keys(stikstofnormen).length === 0) {
      alert('Stikstofnormen nog niet geladen, probeer opnieuw.');
      return;
    }

    let totaalN = 0;
    let totaalP = 0;

    // 3) Loop over alle geselecteerde percelen
    parcels.forEach(p => {
      const ha        = parseFloat(p.ha) || 0;
      const grond     = p.grondsoort || 'Zand';
      const isNV      = p.nvgebied === 'Ja';
      const heeftDerog= p.derogatie === 'ja'; 
      const gewasNaam = p.gewasNaam.toLowerCase();
      const gewasCode = p.gewasCode;

      // --- A-norm per ha (dierlijke mest N) ---
      let A_ha = 170;
      if (heeftDerog) {
        A_ha = isNV ? 190 : 200;
      }

      // --- B-norm per ha (grondgebonden N) uit JSON ---
      let normEntry = stikstofnormen[p.gewasNaam] 
                   || Object.values(stikstofnormen)
                       .find(entry => entry.Gewascodes.includes(gewasCode));
      if (!normEntry) {
        console.warn(`Geen grondgebonden stikstofnorm voor gewascode ${gewasCode}`);
        return;
      }
      // Haal de waarde voor de bodemsoort, met fallback
      const B_ha = (normEntry[grond] !== undefined)
                 ? normEntry[grond]
                 : normEntry['Noordelijk, westelijk en centraal zand'];

      // --- C-norm per ha (fosfaat) ---
      // Grasland → 75 kg/ha, anders (bouwland) → 40 kg/ha
      const isGrasland = gewasNaam.includes('grasland');
      const C_ha = isGrasland ? 75 : 40;

      // --- Gebruiksruimte stikstof per ha = min(A, B) ---
      const N_ha = Math.min(A_ha, B_ha);

      totaalN += N_ha * ha;
      totaalP += C_ha * ha;
    });

    // 4) Toon het eindresultaat
    document.getElementById('resultaat').innerHTML = `
      <div class="resultaat-blok">
        <h2>Eindtotaal mestruimte</h2>
        <p><strong>Stikstof (N):</strong> ${totaalN.toFixed(0)} kg</p>
        <p><strong>Fosfaat (P):</strong> ${totaalP.toFixed(0)} kg</p>
      </div>
    `;
  });
}
