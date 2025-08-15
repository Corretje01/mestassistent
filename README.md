## Mest uploaden & moderatie

### Pagina's
- `upload.html` + `upload.js`: gebruikers uploaden mest, zien eigen uploads, kunnen prijs/ton, aantal_ton en postcode en naam bijwerken, of item verwijderen.
- `beheer.html` + `beheer.js`: admins modereren alle uploads, corrigeren nutrientvelden en wijzigen `status`.

### Storage
- Bucket: `mest-analyses` (private).
- Pad: `userId/yyyy/mm/dd/<uuid>.<ext>`.

### Database
- Tabel `profiles`: `id`, `email`, `role` (`user`/`admin`).
- Tabel `mest_uploads`: velden conform migratie.
- RLS:
  - Owner: select/insert/delete; beperkte update (naam, inkoopprijs_per_ton, aantal_ton, postcode).
  - Admin: volledige update/delete; status & nutrients.

### Extractie
- `utils.js` bevat `extractAnalysis(file)` met feature flag `USE_AI`.
- `USE_AI=false` gebruikt een stub (later vervangen door pdf.js/Tesseract); bij falen blijft status `in_behandeling`.

### Validatie
- Postcode: regex `^[1-9][0-9]{3}\s?[A-Z]{2}$`; formattering naar `1234 AB`.
- File: PDF/PNG/JPG, max 10MB.
- Bedragen/ton: >0, max 2 decimalen.

### Lokale checks
- Pas `supabaseClient.js` aan met jouw keys.
- Zorg dat `data/mestsoorten.json` beschikbaar is (categorie/type).

