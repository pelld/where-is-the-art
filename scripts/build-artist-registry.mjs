import fs from "node:fs/promises";

const endpoint = "https://query.wikidata.org/sparql";
const query = `SELECT DISTINCT ?artist ?artistLabel ?birth ?death ?sitelinks WHERE {
  ?artist wdt:P106 wd:Q1028181;
          wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?artist wdt:P569 ?birth. }
  OPTIONAL { ?artist wdt:P570 ?death. }
  FILTER(?sitelinks >= 35)
  FILTER(BOUND(?death) && ?death < "1956-01-01T00:00:00Z"^^xsd:dateTime)
  FILTER EXISTS { ?work wdt:P170 ?artist; wdt:P195 ?collection. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 120`;

function slug(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70);
}
function year(value) {
  return value ? String(new Date(value).getUTCFullYear()) : "?";
}

const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
const response = await fetch(url,{ headers:{ Accept:"application/sparql-results+json", "User-Agent":"where-is-the-art/1.0 (https://github.com/pelld/where-is-the-art)" } });
if (!response.ok) throw new Error(`Wikidata returned ${response.status}`);
const data = await response.json();
const curatedIds = new Set(["Q5592","Q41264"]);
const priorityIds = new Set(["Q5598","Q296","Q212657","Q159758","Q5582"]);
const unique = new Map();
for (const row of data.results.bindings) {
  const qid = row.artist.value.split("/").pop();
  const name = row.artistLabel.value;
  if (curatedIds.has(qid) || priorityIds.has(qid) || /^Q\d+$/.test(name) || unique.has(qid)) continue;
  unique.set(qid,{
    id:slug(name), name, qid,
    years:`${year(row.birth?.value)}–${year(row.death?.value)}`,
    sitelinks:Number(row.sitelinks.value)
  });
}
const generated = [...unique.values()];
const registry = [
  { id:"rembrandt",name:"Rembrandt",qid:"Q5598",years:"1606–1669",priority:true },
  { id:"monet",name:"Claude Monet",qid:"Q296",years:"1840–1926",priority:true },
  { id:"artemisia-gentileschi",name:"Artemisia Gentileschi",qid:"Q212657",years:"1593–c. 1654",priority:true },
  { id:"turner",name:"J. M. W. Turner",qid:"Q159758",years:"1775–1851",priority:true },
  { id:"van-gogh",name:"Vincent van Gogh",qid:"Q5582",years:"1853–1890",priority:true },
  ...generated
].slice(0,98);
await fs.writeFile("artist-registry.generated.json",JSON.stringify({ generatedAt:new Date().toISOString(),artists:registry },null,2)+"\n");
console.log(`Generated registry containing ${registry.length} artists`);
