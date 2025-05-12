// Wacht op submit
document.getElementById('calc-form').addEventListener('submit', function(e) {
  e.preventDefault();

  // 1) Lees invoerwaarden uit
  const veld1 = parseFloat(document.getElementById('veld1').value) || 0;
  const veld2 = parseFloat(document.getElementById('veld2').value) || 0;

  // 2) Basisvalidatie
  if (isNaN(veld1) || isNaN(veld2)) {
    alert('Vul alle velden correct in.');
    return;
  }

  // 3) Berekening (pas dit naar eigen logica)
  const stikstof = veld1 * 1.2;
  const fosfaat  = veld2 * 0.8;

  // 4) Toon resultaten
  document.getElementById('resultaten').textContent =
    `Stikstofruimte: ${stikstof.toFixed(0)} kg • Fosfaatruimte: ${fosfaat.toFixed(0)} kg`;

  const conclusieEl = document.getElementById('conclusie');
  if (stikstof > 0 && fosfaat > 0) {
    conclusieEl.textContent = 'Je kunt deze mestruimte gebruiken!';
  } else {
    conclusieEl.textContent = 'Helaas is je ruimte (nog) onvoldoende.';
  }

  // 5) Laat de result-container en de stap-2 knop zien
  const resultContainer = document.getElementById('result-container');
  const step2Btn       = document.getElementById('step2-btn');
  resultContainer.hidden = false;
  step2Btn.hidden       = false;
});
