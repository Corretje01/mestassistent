// --- File: scripts/bootstrap.sh ---
#!/usr/bin/env bash
set -euo pipefail

# Configure Git-user
git config user.name "Corretje01"
git config user.email "Corretje01@users.noreply.github.com"

echo "1) soilMapping.json genereren…"
node scripts/generateSoils.js

echo "2) Committen en pushen als er veranderingen zijn…"
git add data/soilMapping.json
if git diff --cached --quiet; then
  echo "– Geen wijzigingen in soilMapping.json"
else
  git commit -m "chore: update BRO-bodemsoort mapping"
  git push
fi

echo "✅ Bootstrap klaar"

