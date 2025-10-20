# MestAssistent – Structuurstub (merge guide)

Dit pakket bevat alleen **nieuwe mappen en placeholder-bestanden** die je veilig kunt toevoegen aan je huidige repo, zonder bestaande files te overschrijven.

## Hoe te gebruiken
1. Kopieer de mappen `core/` en `pages/` naar de root van jouw repo.
2. Commit & deploy: er verandert visueel niets, behalve als je `markt.html` toevoegt en bezoekt.
3. Voeg per pagina (index.html, stap1.html, mestplan.html, upload.html, account.html, beheer.html) onderaan een init toe die de view mount, bijv.:
   ```html
   <script type="module">
     import './core/ui/nav.js';
     import { mountMestplanPage } from './pages/mestplan/view.js';
     const root = document.querySelector('main#app') || document.body;
     if (!document.querySelector('main#app')) {
       const m = document.createElement('main'); m.id='app'; document.body.appendChild(m);
     }
     mountMestplanPage(document.getElementById('app'));
   </script>
   ```
   En in `<head>` een link naar de pagina-specifieke CSS:
   ```html
   <link rel="stylesheet" href="./pages/mestplan/view.css" />
   ```

## Belangrijk
- `core/services/storage/supabase.js` verwacht dat jouw bestaande `supabaseClient.js` in de **project root** staat en `export const supabase = ...` exposeert.
- De bestanden in `core/domain/` en `core/ui/` zijn **placeholders**. Verplaats je echte modules hierheen in kleine, testbare stappen.
- `pages/<slug>/view.js` en `view.css` geven je **per pagina** een nette plek voor initializer & scoped CSS.

## Volgende stappen
- Verplaats mestplan-bestanden stap voor stap:
  - `logicengine.js` → `core/domain/logicEngine.js`
  - `calculationengine.js` → `core/domain/calculationEngine.js`
  - `validationengine.js` → `core/domain/validationEngine.js`
  - `statemanager.js` → `core/domain/stateManager.js`
  - `uicontroller.js` → `core/ui/uiController.js`
  - `scripts/glpk.js` → `core/domain/glpk.js`
  - `data/*.json` → `core/domain/data/`
  - `main.js` → `pages/mestplan/main.js`
- Pas imports aan richting de nieuwe paden.

## Market preview
- `markt.html` + `pages/markt/` laten zien hoe een nieuwe pagina met eigen assets werkt. De pagina toont records uit een (eventuele) `listings`-tabel en crasht niet als die tabel nog niet bestaat.
