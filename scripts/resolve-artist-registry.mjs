import fs from "node:fs/promises";

const seeds = JSON.parse(await fs.readFile("artist-seeds.json","utf8"));
const identifierOverrides = { "Raphael":"Q5597", "Tintoretto":"Q9319", "Antoine Watteau":"Q183221" };
const resolved = [];
for (const name of seeds.candidateArtists) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({ action:"wbsearchentities", search:name, language:"en", uselang:"en", type:"item", limit:"5", format:"json", origin:"*" });
  const response = await fetch(url,{ headers:{ "User-Agent":"where-is-the-art/1.0 (https://github.com/pelld/where-is-the-art)" } });
  if (!response.ok) throw new Error(`${name}: Wikidata returned ${response.status}`);
  const result = await response.json();
  const candidates = result.search || [];
  const exact = candidates.filter(item => item.label?.toLowerCase() === name.toLowerCase());
  const match = exact.find(item => /painter|artist|printmaker|draughtsman|sculptor/i.test(item.description || "")) || candidates.find(item => /painter|artist|printmaker|draughtsman|sculptor/i.test(item.description || "")) || exact[0] || candidates[0];
  if (!match) { console.warn(`Unresolved: ${name}`); continue; }
  resolved.push({ id:name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""), name, qid:identifierOverrides[name] || match.id, description:match.description || "", status:"candidate" });
  console.log(`${name}: ${match.id}`);
  await new Promise(resolve => setTimeout(resolve,150));
}
await fs.writeFile("artist-registry.json",JSON.stringify({ generatedAt:new Date().toISOString(),targetCatalogueSize:100,artists:resolved },null,2)+"\n");
