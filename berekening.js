// berekening.js — mestberekening voor meerdere percelen
const mestForm = document.getElementById('mestForm');
if (mestForm) {
  mestForm.addEventListener('submit', e => {
    e.preventDefault();

    // Zorg dat er minstens één perceel geselecteerd is
    if (!window.parcels || window.parcels.length === 0) {
      alert('Selecteer eerst minstens één perceel.');
      return;
    }

    // RVO-normen
    const normen = {
      mais: {
        grond: { Zand: { B: 185 }, Klei: { B: 140 }, Veen: { B: 112 } },
        A: 170,
        A_NVkort: 20,
        B_derog_NV: 190,
        B_derog_rest: 200,
        C: 75
      },
      tarwe: {
        grond: { Zand: { B: 150 }, Klei: { B: 120 }, Veen: { B: 100 } },
        A: 170,
        A_NVkort: 0,
        B_derog_NV: 170,
        B_derog_rest: 200,
        C: 60
      }
      // … voeg hier andere gewassen toe
    };

    let totaalN = 0;
    let totaalP = 0;

    // Loop over alle geselecteerde percelen
    window.parcels.forEach(p => {
      const ha = parseFloat(p.ha) || 0;
      const gewasKey = p.gewas;
      const deriv = p.derogatie === 'ja';
      const grond = p.grondsoort || 'Zand';
      const isNV = p.nvgebied === 'Ja';

      const m = normen[gewasKey];
      if (!m) return; // onbekend gewas, skip

      // Norm A (N dierlijk per ha)
      let A_ha = m.A;
      if (isNV && m.A_NVkort) {
        A_ha = A_ha * (100 - m.A_NVkort) / 100;
      }

      // Norm B (N totaal per ha)
      let B_ha = m.grond[grond]?.B ?? m.grond['Zand'].B;
      if (deriv) {
        B_ha = isNV ? m.B_derog_NV : m.B_derog_rest;
      }

      // Norm C (P per ha)
      const C_ha = m.C;

      // Totaal per perceel
      const A = A_ha * ha;
      const B = B_ha * ha;
      const C = C_ha * ha;

      // Toegestane stikstof = minimum van A en B
      const N_toegestaan = Math.min(A, B);

      totaalN += N_toegestaan;
      totaalP += C;
    });

    // Toon het eindresultaat
    document.getElementById('resultaat').innerHTML = `
      <div class="resultaat-blok">
        <h2>Eindtotaal mestruimte</h2>
        <p><strong>Stikstof (N):</strong> ${totaalN.toFixed(0)} kg</p>
        <p><strong>Fosfaat (P):</strong> ${totaalP.toFixed(0)} kg</p>
      </div>
    `;
  });
}
