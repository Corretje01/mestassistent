// berekening.js

// Form submission
document.getElementById('calc-form').addEventListener('submit', function(e) {
  e.preventDefault();

  // 1) Lees inputwaarden (voorbeeld)
  const invoer1 = parseFloat(document.querySelector('#veld1').value || 0);
  const invoer2 = parseFloat(document.querySelector('#veld2').value || 0);
  // … meer velden …

  // 2) Validatie
  if (isNaN(invoer1) || isNaN(invoer2)) {
    alert('Vul alle velden correct in.');
    return;
  }

  // 3) Berekeningen (voorbeeldformule)
  const stikstof = invoer1 * 1.2;
  const fosfaat  = invoer2 * 0.8;
  // … je eigen logica …

  // 4) Resultaat tonen
  document.getElementById('resultaten').textContent =
    `Stikstofruimte: ${stikstof.toFixed(0)} kg • Fosfaatruimte: ${fosfaat.toFixed(0)} kg`;
  document.getElementById('conclusie').textContent =
    (stikstof > 0 && fosfaat > 0)
      ? 'Je kunt deze mestruimte gebruiken!'
      : 'Helaas is je ruimte (nog) onvoldoende.';

  const resultContainer = document.getElementById('result-container');
  resultContainer.style.display = 'block';

  // 5) “Ga naar stap 2”-knop zichtbaar maken
  document.getElementById('step2-btn').style.display = 'block';
});
