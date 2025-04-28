// berekening.js — mestberekening per perceel

const mestForm = document.getElementById('mestForm');
if (mestForm) {
  mestForm.addEventListener('submit', e => {
    e.preventDefault();
    const resultaten = parcels.map((p, i) => {
      const ha       = parseFloat(p.ha) || 0;
      const gewasKey = p.gewas;
      const deriv    = p.derogatie === 'ja';
      const grond    = p.grondsoort;
      const isNV     = (p.nvgebied === 'Ja');
      const normen   = {
        mais: { grond:{ Zand:{B:185},Klei:{B:140},Veen:{B:112} }, A:170, A_NVkort:20, B_derog_NV:190, B_derog_rest:200, C:75 },
        tarwe:{ grond:{ Zand:{B:150},Klei:{B:120},Veen:{B:100} }, A:170, A_NVkort:0,  B_derog_NV:170, B_derog_rest:200, C:60 }
      };
      const m = normen[gewasKey];
      let A_ha = m.A;
      if (isNV && m.A_NVkort) A_ha = A_ha * (100 - m.A_NVkort)/100;
      let B_ha = m.grond[grond]?.B || m.grond.Zand.B;
      if (deriv) B_ha = isNV? m.B_derog_NV : m.B_derog_rest;
      const C_ha = m.C;
      const A = A_ha * ha, B = B_ha * ha, C = C_ha * ha;
      const N_toegestaan = Math.min(A,B);
      return {
        titel: p.name,
        A:    { perHa: A_ha, totaal: A },
        B:    { perHa: B_ha, totaal: B },
        C:    { perHa: C_ha, totaal: C },
        N_toegestaan
      };
    });

    // Toon alle resultaten
    const html = resultaten.map((r, i) => `
      <div class="resultaat-blok">
        <h2>${i+1}. ${r.titel}</h2>
        <p><strong>A (N<sub>dierlijk</sub>):</strong>
          ${r.A.perHa.toFixed(1)} kg/ha × ${parcels[i].ha} ha = ${r.A.totaal.toFixed(0)} kg</p>
        <p><strong>B (N<sub>totaal</sub>):</strong>
          ${r.B.perHa.toFixed(1)} kg/ha × ${parcels[i].ha} ha = ${r.B.totaal.toFixed(0)} kg</p>
        <p><strong>C (P<sub>totaal</sub>):</strong>
          ${r.C.perHa.toFixed(1)} kg/ha × ${parcels[i].ha} ha = ${r.C.totaal.toFixed(0)} kg</p>
        <hr>
        <p><strong>Toegestane stikstof:</strong> ${r.N_toegestaan.toFixed(0)} kg</p>
        <p><strong>Toegestane fosfaat:</strong> ${r.C.totaal.toFixed(0)} kg</p>
      </div>
    `).join('');
    document.getElementById('resultaat').innerHTML = html;
  });
}
