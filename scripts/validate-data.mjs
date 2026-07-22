import fs from "node:fs/promises";

const index = JSON.parse(await fs.readFile("artists.json","utf8"));
let failures = 0;
for (const artist of index.artists) {
  const file = artist.dataFile || `data/${artist.id}.json`;
  const data = JSON.parse(await fs.readFile(file,"utf8"));
  const required = ["title","artistId","locationId","location","city","country","lat","lon","source"];
  const ids = new Set();
  for (const [position,work] of data.artworks.entries()) {
    for (const field of required) if (work[field] === undefined || work[field] === "") { console.error(`${file} record ${position + 1}: missing ${field}`); failures++; }
    if (work.artistId !== artist.id) { console.error(`${file} record ${position + 1}: artistId mismatch`); failures++; }
    const identity = work.id || `${work.locationId}:${work.title}`;
    if (ids.has(identity)) { console.error(`${file}: duplicate ${identity}`); failures++; }
    ids.add(identity);
  }
  console.log(`${artist.name}: ${data.artworks.length} validatable records`);
}
if (failures) process.exitCode = 1;
