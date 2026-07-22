import fs from "node:fs/promises";
import path from "node:path";

let artists = [
  { id:"rembrandt", name:"Rembrandt", qid:"Q5598" },
  { id:"monet", name:"Claude Monet", qid:"Q296" },
  { id:"artemisia-gentileschi", name:"Artemisia Gentileschi", qid:"Q212657" },
  { id:"turner", name:"J. M. W. Turner", qid:"Q159758" },
  { id:"van-gogh", name:"Vincent van Gogh", qid:"Q5582" }
];
const registryMode = process.argv.includes("--registry");
if (registryMode) {
  const registry = JSON.parse(await fs.readFile("artist-registry.json","utf8"));
  const offset = Number(process.argv[process.argv.indexOf("--registry") + 1] || 0);
  const limit = Number(process.argv[process.argv.indexOf("--registry") + 2] || 10);
  artists = registry.artists.slice(offset,offset + limit).map(artist => ({ id:artist.id,name:artist.name,qid:artist.qid }));
}
const endpoint = "https://query.wikidata.org/sparql";
const outputDirectory = path.resolve("generated-data");
const retryableStatuses = new Set([429,500,502,503,504]);

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve,milliseconds));
}

async function fetchWithRetry(url,artistName) {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url,{ headers:{ Accept:"application/sparql-results+json", "User-Agent":"where-is-the-art/1.0 (https://github.com/pelld/where-is-the-art)" } });
    if (response.ok) return response;
    if (!retryableStatuses.has(response.status) || attempt === attempts) throw new Error(`${artistName}: Wikidata returned ${response.status} after ${attempt} attempt${attempt === 1 ? "" : "s"}`);
    const delay = Math.min(30000,2000 * 2 ** (attempt - 1));
    console.warn(`${artistName}: Wikidata returned ${response.status}; retrying in ${delay / 1000}s (attempt ${attempt + 1}/${attempts})`);
    await sleep(delay);
  }
}

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
  return `SELECT DISTINCT ?work ?workLabel ?collection ?collectionLabel ?city ?cityLabel ?country ?countryLabel ?coord ?date ?image ?artistImage WHERE {
  ?work wdt:P170 wd:${qid}; wdt:P195 ?collection.
  ?collection wdt:P625 ?coord.
  OPTIONAL {
    ?collection wdt:P131 ?city.
    OPTIONAL { ?city wdt:P17 ?country. }
  }
  OPTIONAL { ?work wdt:P571 ?date. }
  OPTIONAL { ?work wdt:P18 ?image. }
  OPTIONAL { wd:${qid} wdt:P18 ?artistImage. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 1000`;
}
async function resolveMissingLabels(rows,artistName) {
  const ids = new Set();
  const fields = [["work","workLabel"],["collection","collectionLabel"],["city","cityLabel"],["country","countryLabel"]];
  for (const row of rows) {
    for (const [entityField,labelField] of fields) {
      const entityId = row[entityField]?.value?.split("/").pop();
      const label = row[labelField]?.value;
      if (entityId && (!label || /^Q\d+$/.test(label))) ids.add(entityId);
    }
  }
  const labels = new Map();
  const values = [...ids];
  for (let index = 0; index < values.length; index += 50) {
    const chunk = values.slice(index,index + 50);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join("|")}&props=labels&languages=en&format=json&origin=*`;
    const response = await fetchWithRetry(url,`${artistName} label lookup`);
    const data = await response.json();
    for (const [id,entity] of Object.entries(data.entities || {})) {
      const label = entity.labels?.en?.value;
      if (label) labels.set(id,label);
    }
  }
  return labels;
}
function resolvedLabel(row,entityField,labelField,labels,fallback) {
  const supplied = row[labelField]?.value;
  if (supplied && !/^Q\d+$/.test(supplied)) return supplied;
  const id = row[entityField]?.value?.split("/").pop();
  return labels.get(id) || fallback;
}
async function fetchArtist(artist) {
  const url = `${endpoint}?query=${encodeURIComponent(queryFor(artist.qid))}&format=json`;
  const response = await fetchWithRetry(url,artist.name);
  const data = await response.json();
  const labels = await resolveMissingLabels(data.results.bindings,artist.name);
  const seen = new Set();
  const records = [];
  for (const row of data.results.bindings) {
    const id = row.work.value.split("/").pop();
    const coordinates = point(row.coord?.value);
    if (!coordinates || seen.has(id)) continue;
    seen.add(id);
    const location = resolvedLabel(row,"collection","collectionLabel",labels,"Collection unknown");
    const title = resolvedLabel(row,"work","workLabel",labels,"Untitled record");
    const city = resolvedLabel(row,"city","cityLabel",labels,"Location unknown");
    const country = resolvedLabel(row,"country","countryLabel",labels,"Country unknown");
    records.push({
      id, title, date:year(row.date?.value), type:"Painting", attribution:"Accepted",
      artistId:artist.id, artistName:artist.name,
      locationId:slug(`${location}-${city}`), location,
      city, country,
      lat:coordinates.lat, lon:coordinates.lon, source:row.work.value, image:"", externalImage:row.image?.value || "", artistImage:row.artistImage?.value || "",
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
const requestedArtist = registryMode ? null : process.argv[2];
for (const artist of artists.filter(item => !requestedArtist || item.id === requestedArtist)) {
  try {
    const artworks = await fetchArtist(artist);
    await fs.writeFile(path.join(outputDirectory,`${artist.id}.json`),JSON.stringify({ artworks },null,2)+"\n");
    summary.push({ id:artist.id, status:"complete", records:artworks.length, locations:new Set(artworks.map(work => work.locationId)).size, defaultLocationId:artworks[0]?.locationId || null });
    console.log(`${artist.name}: ${artworks.length} works`);
  } catch (error) {
    summary.push({ id:artist.id, status:"failed", error:error.message });
    console.error(`Skipping ${artist.name}: ${error.message}`);
  }
  await new Promise(resolve => setTimeout(resolve,1000));
}
await fs.writeFile(path.join(outputDirectory,"summary.json"),JSON.stringify(summary,null,2)+"\n");
