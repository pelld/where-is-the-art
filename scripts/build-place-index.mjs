import fs from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const index = JSON.parse(await fs.readFile(path.join(root,"artists.json"),"utf8"));
const countries = new Map();

function slug(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}
function cleanCountry(value) {
  return value && value !== "Country unknown" && !/^Q\d+$/.test(value) ? value : null;
}

for (const artist of index.artists) {
  let data;
  try { data = JSON.parse(await fs.readFile(path.join(root,artist.dataFile),"utf8")); }
  catch { console.warn(`Missing data for ${artist.name}`); continue; }

  for (const work of data.artworks || []) {
    const country = cleanCountry(work.country);
    if (!country) continue;
    const id = slug(country);
    if (!countries.has(id)) countries.set(id,{ id,country,artworks:[] });
    countries.get(id).artworks.push({
      id:work.id || `${work.artistId}:${work.locationId}:${slug(work.title)}`,
      artistId:artist.id, artistName:artist.name, reviewStatus:artist.reviewStatus,
      title:work.title, date:work.date, type:work.type, attribution:work.attribution,
      locationId:work.locationId, location:work.location, city:work.city, country,
      lat:work.lat, lon:work.lon, source:work.source, externalImage:work.externalImage || "", artistImage:work.artistImage || ""
    });
  }
}

const outputDirectory = path.join(root,"data","places");
await fs.mkdir(outputDirectory,{ recursive:true });
const summary = [];
for (const place of countries.values()) {
  place.artworks.sort((a,b) => a.city.localeCompare(b.city) || a.location.localeCompare(b.location) || a.artistName.localeCompare(b.artistName) || a.title.localeCompare(b.title));
  const artists = new Set(place.artworks.map(work => work.artistId));
  const institutions = new Set(place.artworks.map(work => work.locationId));
  const cities = new Set(place.artworks.map(work => work.city));
  summary.push({ id:place.id,name:place.country,works:place.artworks.length,artists:artists.size,institutions:institutions.size,cities:cities.size });
  await fs.writeFile(path.join(outputDirectory,`${place.id}.json`),JSON.stringify(place,null,2)+"\n");
}
summary.sort((a,b) => b.works - a.works || a.name.localeCompare(b.name));
await fs.writeFile(path.join(outputDirectory,"index.json"),JSON.stringify({ generatedAt:new Date().toISOString(),countries:summary },null,2)+"\n");
console.log(`Built ${summary.length} destination files containing ${summary.reduce((sum,item) => sum + item.works,0)} artwork records.`);

