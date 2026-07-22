let destinationIndex = [];

fetch("data/places/index.json").then(response => {
  if (!response.ok) throw new Error("Destination data is not available yet.");
  return response.json();
}).then(data => {
  destinationIndex = data.countries;
  document.getElementById("destinationOptions").innerHTML = destinationIndex.map(place => `<option value="${place.name}"></option>`).join("");
  document.getElementById("destinationCount").textContent = `Browse ${destinationIndex.length} available destination${destinationIndex.length === 1 ? "" : "s"}`;
  renderDestinationDirectory(destinationIndex);
}).catch(error => {
  document.getElementById("destinationNote").textContent = error.message;
});

function destinationNormalise(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function destinationDistance(left,right) {
  const previous = Array.from({ length:right.length + 1 },(_,index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1,previous[j - 1] + 1,diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}
function findDestination(query) {
  const value = destinationNormalise(query);
  if (!value) return null;
  const direct = destinationIndex.find(place => destinationNormalise(place.name) === value) || destinationIndex.find(place => destinationNormalise(place.name).includes(value));
  if (direct) return direct;
  const ranked = destinationIndex.map(place => ({ place,distance:destinationDistance(value,destinationNormalise(place.name)) })).sort((a,b) => a.distance - b.distance);
  return ranked[0] && ranked[0].distance <= Math.max(2,Math.floor(value.length * .3)) ? ranked[0].place : null;
}
function renderDestinationDirectory(records) {
  const element = document.getElementById("destinationDirectory");
  element.innerHTML = records.map(place => `<button type="button" data-place-id="${place.id}"><strong>${place.name}</strong><small>${place.works.toLocaleString()} works · ${place.artists} artists</small></button>`).join("");
  element.querySelectorAll("button").forEach(button => button.addEventListener("click",() => {
    const place = destinationIndex.find(item => item.id === button.dataset.placeId);
    document.getElementById("destinationInput").value = place.name;
    loadDestination(place);
    document.getElementById("destinationBrowser").open = false;
  }));
}
async function runDestinationSearch() {
  const input = document.getElementById("destinationInput");
  const place = findDestination(input.value);
  if (!place) {
    document.getElementById("destinationNote").textContent = `No available destination closely matches “${input.value.trim()}”.`;
    document.getElementById("destinationBrowser").open = true;
    return;
  }
  input.value = place.name;
  await loadDestination(place);
}
async function loadDestination(place) {
  const note = document.getElementById("destinationNote");
  note.textContent = `Loading ${place.name}…`;
  const response = await fetch(`data/places/${place.id}.json`);
  if (!response.ok) { note.textContent = `${place.name} is indexed but its detailed file has not been published yet.`; return; }
  const data = await response.json();
  renderDestination(place,data.artworks);
}
function rankedCounts(records,key,labelKey = key) {
  const counts = new Map();
  records.forEach(record => {
    const id = record[key]; if (!id) return;
    if (!counts.has(id)) counts.set(id,{ name:record[labelKey],count:0 });
    counts.get(id).count++;
  });
  return [...counts.values()].sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
}
function renderDestination(place,records) {
  document.getElementById("destinationNote").textContent = `${records.length.toLocaleString()} indexed works. Generated records are a discovery aid; check the source before travelling.`;
  window.showDestinationInExplorer(place,records);
}

window.runDestinationSearch = runDestinationSearch;

document.getElementById("destinationSearchButton").addEventListener("click",runDestinationSearch);
document.getElementById("destinationInput").addEventListener("keydown",event => { if (event.key === "Enter") runDestinationSearch(); });
document.getElementById("destinationInput").addEventListener("input",event => {
  const value = destinationNormalise(event.target.value);
  renderDestinationDirectory(destinationIndex.filter(place => destinationNormalise(place.name).includes(value)));
});

