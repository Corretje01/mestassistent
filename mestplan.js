// referenties
const slidersContainer = document.getElementById('sliders-container');

// 1) Interactie mest-knoppen
document.querySelectorAll('.mest-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    const key   = `${btn.dataset.type}-${btn.dataset.animal}`;
    const label = btn.textContent;
    if (btn.classList.contains('active')) {
      addDynamicSlider(key, label);
    } else {
      removeDynamicSlider(key);
    }
  });
});

// 2) Standaard sliders (blijft ongewijzigd behalve functie-extractie)
const standaardSliders = [
  { id: 'stikstof', max: 2000, unit: 'kg' },
  { id: 'fosfaat', max: 800,  unit: 'kg' },
  { id: 'kalium',  max: 7500, unit: 'kg' },
  { id: 'organisch', max: 3000, unit: 'kg' }
];
standaardSliders.forEach(initSlider);

// 3) Dynamische sliders
function addDynamicSlider(key, label) {
  if (document.getElementById(`slider-${key}`)) return; // dubbel check
  const maxTon = 650; // voorbeeld maximum in ton
  const group = document.createElement('div');
  group.className = 'slider-group';
  group.id = `group-${key}`;
  group.innerHTML = `
    <label for="slider-${key}">${label} <span class="value" id="value-${key}">0 / ${maxTon} ton</span></label>
    <input type="range" id="slider-${key}" min="0" max="${maxTon}" step="1">
    <button class="lock-btn unlocked" data-slider="${key}"></button>
  `;
  // Voeg na de standaard sliders, vóór full-width financial slider
  slidersContainer.appendChild(group);

  const slider = group.querySelector('input[type="range"]');
  const valueEl = group.querySelector('.value');
  // live update
  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} / ${maxTon} ton`;
  });
  // lock/unlock
  const lockBtn = group.querySelector('.lock-btn');
  lockBtn.addEventListener('click', () => {
    const isLocked = lockBtn.classList.toggle('locked');
    lockBtn.classList.toggle('unlocked', !isLocked);
    slider.disabled = isLocked;
  });
}

function removeDynamicSlider(key) {
  const group = document.getElementById(`group-${key}`);
  if (group) group.remove();
}

// 4) Helper voor standaard sliders
function initSlider({id, max, unit}) {
  const slider = document.getElementById(`slider-${id}`);
  const valueEl = document.getElementById(`value-${id}`);
  // init
  valueEl.textContent = `0 / ${max} ${unit}`;
  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} / ${max} ${unit}`;
  });
  // je kunt hier straks ook de lock-button toevoegen zoals bij dynamische sliders
}
