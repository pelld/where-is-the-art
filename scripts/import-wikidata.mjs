import fs from "node:fs/promises";
import path from "node:path";

const artists = [
  { id:"rembrandt", name:"Rembrandt", qid:"Q5598" },
  { id:"monet", name:"Claude Monet", qid:"Q296" },
  { id:"artemisia-gentileschi", name:"Artemisia Gentileschi", qid:"Q212657" },
  { id:"turner", name:"J. M. W. Turner", qid:"Q159758" },
  { id:"van-gogh", name:"Vincent van Gogh", qid:"Q5582" }
];
const endpoint = "https://query.wikidata.org/sparql";
const outputDirectory = path.resolve("generated-data");

function slug(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70);
}
function point(value) {
  const match = /^Point\((-?[\d.]+) (-?[\d.]+)\)$/.exec(value || "");
  return match ? { lon:Number(match[1]), lat:Number(match[2]) } : null;
}
function year(value) {
  const match = /(-?\d{3,4})/.exec(value || "");
  return match ? match[1] : "Date unknown";
}
function identity(work) {
  return [work.locationId,work.title.toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),work.date].join("|");
}
function queryFor(qid) {
  return `SELECT DISTINCT ?work ?workLabel ?collection ?collectionLabel ?cityLabel ?countryLabel ?coord ?date ?image WHERE {
  ?work wdt:P170 wd:${qid}; wdt:P195 ?collection.
  ?collection wdt:P625 ?coord.
  OPTIONAL {
    ?collection wdt:P131 ?city.
    OPTIONAL { ?city wdt:P17 ?country. }
  }
  OPTIONAL { ?work wdt:P571 ?date. }
  OPTIONAL { ?work wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 1000`;
}
async function fetchArtist(artist) {
  const url = `${endpoint}?query=${encodeURIComponent(queryFor(artist.qid))}&format=json`;
  const response = await fetch(url,{ headers:{ Accept:"application/sparql-results+json", "User-Agent":"where-is-the-art/1.0 (https://github.com/pelld/where-is-the-art)" } });
  if (!response.ok) throw new Error(`${artist.name}: Wikidata returned ${response.status}`);
  const data = await response.json();
  const seen = new Set();
  const records = [];
  for (const row of data.results.bindings) {
    const id = row.work.value.split("/").pop();
    const coordinates = point(row.coord?.value);
    if (!coordinates || seen.has(id)) continue;
    seen.add(id);
    const location = row.collectionLabel?.value || "Collection unknown";
    records.push({
      id, title:row.workLabel?.value || id, date:year(row.date?.value), type:"Painting", attribution:"Accepted",
      artistId:artist.id, artistName:artist.name,
      locationId:slug(`${location}-${row.cityLabel?.value || ""}`), location,
      city:row.cityLabel?.value || "Location unknown", country:row.countryLabel?.value || "Country unknown",
      lat:coordinates.lat, lon:coordinates.lon, source:row.work.value, image:"", externalImage:row.image?.value || "",
      provenance:{ source:"Wikidata", artistQid:artist.qid, retrieved:new Date().toISOString().slice(0,10), reviewStatus:"generated" }
    });
  }
  const deduplicated = new Map();
  for (const work of records) {
    const key = identity(work);
    const existing = deduplicated.get(key);
    if (!existing || (!existing.externalImage && work.externalImage)) deduplicated.set(key,work);
  }
  return [...deduplicated.values()].sort((a,b) => a.location.localeCompare(b.location) || a.title.localeCompare(b.title));
}
await fs.mkdir(outputDirectory,{ recursive:true });
const summary = [];
const requestedArtist = process.argv[2];
for (const artist of artists.filter(item => !requestedArtist || item.id === requestedArtist)) {
  const artworks = await fetchArtist(artist);
  await fs.writeFile(path.join(outputDirectory,`${artist.id}.json`),JSON.stringify({ artworks },null,2)+"\n");
  summary.push({ id:artist.id, records:artworks.length, locations:new Set(artworks.map(work => work.locationId)).size, defaultLocationId:artworks[0]?.locationId || null });
  console.log(`${artist.name}: ${artworks.length} works`);
}
await fs.writeFile(path.join(outputDirectory,"summary.json"),JSON.stringify(summary,null,2)+"\n");
