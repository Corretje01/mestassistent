// 1) mestsoort-knoppen toggle
document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    // hier kun je straks dynamisch sliders toevoegen/verwijderen
  });
});

// 2) standaard sliders initialiseren en live value-updates
const standaardSliders = [
  { id: 'stikstof', max: 2000, unit: 'kg' },
  { id: 'fosfaat', max: 800, unit: 'kg' },
  { id: 'kalium', max: 7500, unit: 'kg' },
  { id: 'organisch', max: 3000, unit: 'kg' },
  { id: 'financieel', max: 20000, unit: '€' }
];

standaardSliders.forEach(s => {
  const slider = document.getElementById(`slider-${s.id}`);
  const valueEl = document.getElementById(`value-${s.id}`);
  // init text
  valueEl.textContent = s.id === 'financieel'
    ? `€0`
    : `0 / ${s.max} ${s.unit}`;
  // update on input
  slider.addEventListener('input', () => {
    const v = slider.value;
    valueEl.textContent = s.id === 'financieel'
      ? `€${v}`
      : `${v} / ${s.max} ${s.unit}`;
  });
});
