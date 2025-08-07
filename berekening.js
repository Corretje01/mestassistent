// berekening.js — mestplaatsingsruimte-berekening
import { supabase } from './supabaseClient.js';
import { parcels } from './kaart.js';

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

    // 5a) Vul de drie resultaten‐velden
    document.getElementById('res_n_dierlijk').value = totaalA.toFixed(0);
    document.getElementById('res_n_totaal').value  = totaalB.toFixed(0);
    document.getElementById('res_p_totaal').value  = totaalC.toFixed(0);

    resAEl.value = totaalA.toFixed(0);
    resBEl.value = totaalB.toFixed(0);
    resCEl.value = totaalC.toFixed(0);
    
    // 5b) Toon de resultaten-sectie (was initieel hidden in index.html)
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
      resultsSection.style.display = 'block';
    }
  
    // 6) Bewaar in localStorage voor stap 2
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // niet ingelogd → alleen localStorage
    
      const totaalN_dierlijk = Number(totaalA);
      const totaalN_totaal   = Number(totaalB);
      const totaalP_totaal   = Number(totaalC);
    
      const { error: upErr } = await supabase
        .from('user_mestplan')
        .upsert(
          {
            user_id:        user.id,
            res_n_dierlijk: totaalN_dierlijk,
            res_n_totaal:   totaalN_totaal,
            res_p_totaal:   totaalP_totaal,
            updated_at:     new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );
      if (upErr) console.error('upsert mestplan error:', upErr);
    })();

    // 7) Bind stap 2-knop
    const btnStep2 = document.getElementById('go-to-step2');
    if (btnStep2) {
      btnStep2.addEventListener('click', () => {
        window.location.href = '/mestplan.html';
      });
    }
  });
}
