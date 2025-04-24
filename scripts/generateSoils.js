
// --- File: scripts/generateSoils.js ---
// Ophalen van alle unieke BRO-bodemtypen en classificatie naar Z/V/L/K/U
import { writeFile } from "fs/promises";

async function fetchAllSoilTypes() {
  const url = new URL("https://service.pdok.nl/bzk/bro-bodemkaart/wfs/v1_0");
  url.search = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetPropertyValue",
    typeNames: "bro:bodemvlakken",
    valueReference: "bro-bodemkaart:first_soilname",
    outputFormat: "application/json"
  }).toString();

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`WFS gaf status ${resp.status}`);
  const data = await resp.json();
  return data.features.map(f => Object.values(f.properties)[0]);
}

function classify(name) {
  const n = name.toLowerCase();
  if (n.includes("veen")) return "V";      // Veen
  if (n.includes("zand")) return "Z";      // Zand
  if (/(loss|löss)/.test(n)) return "L";    // Löss
  if (n.includes("klei")) return "K";      // Klei
  return "U";                               // Onbekend
}

async function main() {
  console.log("▶ Ophalen BRO-bodemtypen…");
  const types = await fetchAllSoilTypes();
  console.log(`✔ Gevonden ${types.length} unieke namen, classificeren…`);

  const mapping = {};
  types.sort().forEach(name => {
    mapping[name] = classify(name);
  });

  await writeFile("data/soilMapping.json", JSON.stringify(mapping, null, 2), "utf8");
  console.log(`✅ Geschreven ${Object.keys(mapping).length} regels naar data/soilMapping.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

