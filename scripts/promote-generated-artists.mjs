import fs from "node:fs/promises";

const index = JSON.parse(await fs.readFile("artists.json","utf8"));
const registry = JSON.parse(await fs.readFile("artist-registry.json","utf8"));
const permanent = index.artists.filter(artist => artist.reviewStatus === "curated" || ["rembrandt","monet","artemisia-gentileschi","turner","van-gogh"].includes(artist.id));
const promoted = [];

for (const candidate of registry.artists) {
  const file = `data/${candidate.id}.json`;
  let data;
  try { data = JSON.parse(await fs.readFile(file,"utf8")); }
  catch { console.warn(`Not published yet: ${candidate.name}`); continue; }
  if (!data.artworks?.length) { console.warn(`No records: ${candidate.name}`); continue; }

  const locations = new Map();
  for (const work of data.artworks) locations.set(work.locationId,(locations.get(work.locationId) || 0) + 1);
  const defaultLocationId = [...locations].sort((a,b) => b[1] - a[1])[0][0];
  const locationCount = locations.size;
  const workCount = data.artworks.length;

  promoted.push({
    id:candidate.id,
    name:candidate.name,
    displayName:candidate.name,
    fullName:candidate.name,
    shortName:candidate.name,
    years:"",
    dataFile:file,
    defaultLocationId,
    reviewStatus:"generated",
    intro:`${workCount} works across ${locationCount} mapped collections. Check individual records against the linked source before travelling.`,
    tripSummary:`Explore the mapped collections currently associated with ${candidate.name}; verify individual works against the linked source before making a special journey.`
  });
}
index.artists = [...permanent,...promoted];
await fs.writeFile("artists.json",JSON.stringify(index,null,2)+"\n");
console.log(`Published ${promoted.length} registry artists; ${index.artists.length} artists are now searchable.`);

