// berekening.js — alleen totale mestruimte tonen

document.addEventListener('DOMContentLoaded', () => {
  const btn       = document.getElementById('berekenBtn');
  const resultaat = document.getElementById('resultaat');

  btn.addEventListener('click', e => {
    e.preventDefault();

    // Haal de geselecteerde percelen uit kaart.js
    const lst = window.parcels || [];
    if (lst.length === 0) {
      resultaat.innerHTML = `<p>Geen percelen geselecteerd.</p>`;
      return;
    }

    // Normen-config
    const normen = {
      mais: {
        grond: { Zand:{B:185}, Klei:{B:140}, Veen:{B:112}, Löss:{B:185} },
        A:170, A_NVkort:20, B_derog_NV:190, B_derog_rest:200, C:75
      },
      tarwe: {
        grond: { Zand:{B:150}, Klei:{B:120}, Veen:{B:100}, Löss:{B:150} },
        A:170, A_NVkort:0,  B_derog_NV:170, B_derog_rest:200, C:60
      },
      suikerbieten: {
        grond: { Zand:{B:170}, Klei:{B:130}, Veen:{B:110}, Löss:{B:170} },
        A:170, A_NVkort:0,  B_derog_NV:170, B_derog_rest:200, C:70
      }
      // … voeg hier andere gewassen toe
    };

    let totaalN = 0;
    let totaalP = 0;

    lst.forEach(p => {
      const m = normen[p.gewas];
      // Norm A (kg N/ha)
      let A_ha = m.A;
      if (p.nvgebied === 'Ja' && m.A_NVkort) {
        A_ha = A_ha * (100 - m.A_NVkort) / 100;
      }
      // Norm B (kg N/ha)
      let B_ha = m.grond[p.grondsoort]?.B ?? m.grond['Zand'].B;
      if (p.derogatie === 'ja') {
        B_ha = p.nvgebied === 'Ja' ? m.B_derog_NV : m.B_derog_rest;
      }
      // Norm C (kg P/ha)
      const C_ha = m.C;

      const ha = parseFloat(p.ha) || 0;
      const N_dierlijk = A_ha * ha;
      const N_totaal   = B_ha * ha;
      const P_totaal   = C_ha * ha;

      // toegestane N is min van A en B
      totaalN += Math.min(N_dierlijk, N_totaal);
      // toegestane P is gewoon P
      totaalP += P_totaal;
    });

    resultaat.innerHTML = `
      <div class="resultaat-blok">
        <h2>Totale mestruimte</h2>
        <p><strong>Stikstof (N):</strong> ${totaalN.toFixed(0)} kg</p>
        <p><strong>Fosfaat (P):</strong> ${totaalP.toFixed(0)} kg</p>
      </div>
    `;
  });
});
