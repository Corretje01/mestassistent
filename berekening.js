// berekening.js — mestberekening alleen als het formulier bestaat
const mestForm = document.getElementById('mestForm');
if (mestForm) {
  mestForm.addEventListener('submit', e => {
    e.preventDefault();
    const ha        = parseFloat(document.getElementById('hectare').value) || 0;
    const gewasKey  = document.getElementById('gewas').value;
    const deriv     = document.getElementById('derogatie').value === 'ja';
    const grond     = window.huidigeGrond || 'Zand';
    const isNV      = window.isNV;
    const normen    = {
      mais: { grond:{ Zand:{B:185},Klei:{B:140},Veen:{B:112} }, A:170, A_NVkort:20, B_derog_NV:190, B_derog_rest:200, C:75 },
      tarwe:{ grond:{ Zand:{B:150},Klei:{B:120},Veen:{B:100} }, A:170, A_NVkort:0,  B_derog_NV:170, B_derog_rest:200, C:60 }
    };
    const m = normen[gewasKey];
    let A_ha = m.A;
    if (isNV && m.A_NVkort) A_ha = A_ha * (100 - m.A_NVkort)/100;
    let B_ha = m.grond[grond]?.B||m.grond.Zand.B;
    if (deriv) B_ha = isNV?m.B_derog_NV:m.B_derog_rest;
    const C_ha = m.C;
    const A = A_ha * ha, B = B_ha * ha, C = C_ha * ha;
    const N_toegestaan = Math.min(A,B);
    document.getElementById('resultaat').innerHTML = `
      <div class="resultaat-blok">
        <h2>Resultaat</h2>
        <p><strong>A (N<sub>dierlijk</sub>):</strong> ${A_ha.toFixed(1)} kg/ha × ${ha} ha = ${A.toFixed(0)} kg</p>
        <p><strong>B (N<sub>totaal</sub>):</strong> ${B_ha.toFixed(1)} kg/ha × ${ha} ha = ${B.toFixed(0)} kg</p>
        <p><strong>C (P<sub>totaal</sub>):</strong> ${C_ha.toFixed(1)} kg/ha × ${ha} ha = ${C.toFixed(0)} kg</p>
        <hr>
        <p><strong>Toegestane stikstof:</strong> ${N_toegestaan.toFixed(0)} kg</p>
        <p><strong>Toegestane fosfaat:</strong> ${C.toFixed(0)} kg</p>
      </div>
    `;
  });
}
