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

    // Controle: minstens één perceel geselecteerd
    if (typeof parcels === 'undefined' || parcels.length === 0) {
      alert('Selecteer eerst minstens één perceel.');
      return;
    }
    // Controle: JSON geladen
    if (Object.keys(stikstofnormen).length === 0) {
      alert('Stikstofnormen nog niet geladen, probeer opnieuw.');
      return;
    }

    // 2) Handmatige A- en C-normen per gewas (zelfde structuur als eerder)
    const normen = {
      'mais': {
        A: 170, A_NVkort: 20, B_derog_NV: 190, B_derog_rest: 200, C: 75
      },
      'tarwe': {
        A: 170, A_NVkort: 0,  B_derog_NV: 170, B_derog_rest: 200, C: 60
      }
      // … voeg hier andere gewassen toe
    };

    let totaalN = 0;
    let totaalP = 0;

    // 3) Loop over alle geselecteerde percelen
    parcels.forEach(p => {
      const ha        = parseFloat(p.ha) || 0;
      const grond     = p.grondsoort || 'Zand';
      const isNV      = p.nvgebied === 'Ja';
      const deriv     = p.derogatie === 'ja'; // indien je dit veld gebruikt
      const gewasKey  = p.gewasNaam.toLowerCase(); // moet overeenkomen met keys in `normen`
      const gewasCode = p.gewasCode;

      // *** A-norm per ha ***
      const m = normen[gewasKey];
      if (!m) {
        console.warn(`Geen A-/C-norm gedefinieerd voor ${p.gewasNaam}`);
        return;
      }
      let A_ha = m.A;
      if (isNV && m.A_NVkort) {
        A_ha = A_ha * (100 - m.A_NVkort) / 100;
      }

      // *** B-norm per ha uit JSON ***
      // Zoek eerst op gewasnaam, anders op code
      let normEntry = stikstofnormen[p.gewasNaam];
      if (!normEntry) {
        const gevonden = Object.entries(stikstofnormen)
          .find(([_, entry]) => entry.Gewascodes.includes(gewasCode));
        if (gevonden) normEntry = gevonden[1];
      }
      if (!normEntry) {
        console.warn(`Geen grondgebonden stikstofnorm voor gewascode ${gewasCode}`);
        return;
      }
      // Kies de juiste grondsoortwaarde, of fallback
      let B_ha = (normEntry[grond] !== undefined)
                ? normEntry[grond]
                : normEntry['Noordelijk, westelijk en centraal zand'];

      // Derogatie kan B_ha overschrijven
      if (deriv) {
        B_ha = isNV ? m.B_derog_NV : m.B_derog_rest;
      }

      // *** C-norm per ha (fosfaat) ***
      const C_ha = m.C;

      // Toegestane stikstof is min(A_ha, B_ha)
      const N_ha = Math.min(A_ha, B_ha);

      totaalN += N_ha * ha;
      totaalP += C_ha  * ha;
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
