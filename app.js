/* ============================================================
   00. APPLICATION STATE
   ============================================================ */
let artists = [];
let artworks = [];
let locations = [];
let filteredLocations = [];
let filteredArtworks = [];
let selectedArtistId = "michelangelo";
let selectedLocationId = "accademia";
let map;
const markerByLocation = new Map();

/* ============================================================
   01. DATA LOADING AND NORMALISATION
   ============================================================ */
Promise.all([
  fetch("artists.json").then(response => { if (!response.ok) throw new Error("The artist data could not be loaded."); return response.json(); }),
  fetch("artworks.json").then(response => { if (!response.ok) throw new Error("The artwork data could not be loaded."); return response.json(); })
]).then(([artistData, artworkData]) => {
  artists = artistData.artists;
  artworks = artworkData.artworks;
  initialiseMap();
  initialiseControls();
  selectArtist(selectedArtistId, false);
}).catch(error => {
  document.querySelector(".dashboard").innerHTML = `<div class="load-error"><h2>Something went wrong</h2><p>${error.message}</p></div>`;
});

function currentArtist() { return artists.find(artist => artist.id === selectedArtistId); }
function artistWorks() { return artworks.filter(work => work.artistId === selectedArtistId); }
function artworkImage(work) { return window.bundledArtworkImages[`${work.artistId}:${work.locationId}`] || window.bundledArtworkImages[work.locationId] || work.image || ""; }

function groupByLocation(records) {
  const grouped = new Map();
  records.forEach(work => {
    if (!grouped.has(work.locationId)) grouped.set(work.locationId, { id:work.locationId, name:work.location, city:work.city, country:work.country, lat:work.lat, lon:work.lon, source:work.source, image:artworkImage(work), works:[] });
    grouped.get(work.locationId).works.push(work);
  });
  return [...grouped.values()].sort((a,b) => b.works.length - a.works.length || a.city.localeCompare(b.city));
}

/* ============================================================
   02. MAP CREATION
   ============================================================ */
function initialiseMap() {
  map = document.getElementById("map");
  map.innerHTML = '<div class="static-world-map"><img src="world-map.svg" alt="" aria-hidden="true"><div id="mapMarkers"></div><div class="map-caption">Self-contained map · no external tile service</div></div>';
}

function mapPosition(lat,lon) {
  const scale = 184.6;
  return { left:`${((600 + lon * Math.PI / 180 * scale) / 1200) * 100}%`, top:`${((300 - lat * Math.PI / 180 * scale) / 600) * 100}%` };
}

function renderMarkers() {
  const layer = document.getElementById("mapMarkers");
  layer.innerHTML = "";
  markerByLocation.clear();
  filteredLocations.forEach(location => {
    const button = document.createElement("button");
    const position = mapPosition(location.lat,location.lon);
    button.className = `map-point ${location.id === selectedLocationId ? "selected" : ""}`;
    button.style.left = position.left;
    button.style.top = position.top;
    button.innerHTML = `<span>${location.works.length}</span><b>${location.city}</b>`;
    button.setAttribute("aria-label",`${location.name}, ${location.city}: ${location.works.length} works or ensembles`);
    button.addEventListener("click",() => selectLocation(location.id,false));
    layer.appendChild(button);
    markerByLocation.set(location.id,button);
  });
}

/* ============================================================
   03. ARTIST SEARCH, FILTERS AND VIEW SWITCHING
   ============================================================ */
function initialiseControls() {
  document.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener("change",applyFilters));
  document.getElementById("resetFilters").addEventListener("click",() => { document.querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = true); applyFilters(); });
  document.querySelectorAll(".view-toggle button").forEach(button => button.addEventListener("click",() => switchView(button.dataset.view)));
  document.getElementById("searchButton").addEventListener("click",runArtistSearch);
  document.getElementById("artistInput").addEventListener("keydown",event => { if (event.key === "Enter") runArtistSearch(); });
}

function runArtistSearch() {
  const input = document.getElementById("artistInput");
  const value = input.value.trim().toLowerCase();
  const match = artists.find(artist => artist.name.toLowerCase().includes(value) || artist.fullName.toLowerCase().includes(value) || value.includes(artist.name.toLowerCase()));
  if (value && match) selectArtist(match.id);
  else {
    const note = document.getElementById("searchNote");
    note.textContent = `“${input.value.trim()}” is not in this proof of concept yet. Try Michelangelo or Johannes Vermeer.`;
    note.classList.add("search-warning");
  }
}

function selectArtist(artistId, announce = true) {
  const artist = artists.find(item => item.id === artistId);
  if (!artist) return;
  selectedArtistId = artist.id;
  selectedLocationId = artist.defaultLocationId;
  document.getElementById("artistInput").value = artist.name;
  document.getElementById("artistName").textContent = artist.displayName || artist.name;
  document.getElementById("artistIntro").textContent = artist.intro;
  document.getElementById("tripHeading").textContent = `Plan a ${artist.shortName || artist.name} trip`;
  document.getElementById("tripSummary").textContent = artist.tripSummary;
  document.querySelector(".dashboard").setAttribute("aria-label",`${artist.name} work locations`);
  document.getElementById("map").setAttribute("aria-label",`Map showing locations of ${artist.name} works`);
  const note = document.getElementById("searchNote");
  note.textContent = `Showing ${artist.name}. Choose the other artist from the search box to compare the pattern.`;
  note.classList.remove("search-warning");
  updateCounts();
  applyFilters();
  if (announce) document.getElementById("explore").scrollIntoView({ behavior:"smooth", block:"start" });
}

function applyFilters() {
  const types = [...document.querySelectorAll('input[name="type"]:checked')].map(input => input.value);
  const attributions = [...document.querySelectorAll('input[name="attribution"]:checked')].map(input => input.value);
  filteredArtworks = artistWorks().filter(work => {
    const attributionGroup = work.attribution === "Michelangelo" ? "Accepted" : work.attribution;
    return types.includes(work.type) && attributions.includes(attributionGroup);
  });
  filteredLocations = groupByLocation(filteredArtworks);
  if (!filteredLocations.some(location => location.id === selectedLocationId)) selectedLocationId = filteredLocations[0]?.id || null;
  renderMarkers(); renderLocationCards(); renderArtworkGallery(); renderListView(); renderSelectedLocation();
  document.getElementById("locationCount").textContent = `${filteredLocations.length} ${filteredLocations.length === 1 ? "location" : "locations"}`;
  document.getElementById("workCount").textContent = `${filteredArtworks.length} ${filteredArtworks.length === 1 ? "work or ensemble" : "works and ensembles"}`;
}

function switchView(view) {
  document.querySelectorAll(".view-toggle button").forEach(button => button.classList.toggle("active",button.dataset.view === view));
  document.getElementById("map").hidden = view !== "map";
  document.getElementById("listView").hidden = view !== "list";
}

/* ============================================================
   04. SELECTED LOCATION AND RESULT CARDS
   ============================================================ */
function selectLocation(locationId,scroll = true) {
  selectedLocationId = locationId; renderMarkers(); renderSelectedLocation(); renderLocationCards();
  if (scroll && window.innerWidth < 850) document.getElementById("locationPanel").scrollIntoView({ behavior:"smooth",block:"start" });
}

function renderSelectedLocation() {
  const location = filteredLocations.find(item => item.id === selectedLocationId);
  const imageFrame = document.querySelector(".location-image");
  if (!location) {
    imageFrame.classList.add("image-missing"); imageFrame.style.removeProperty("--artwork-image");
    document.getElementById("locationImage").removeAttribute("src"); document.getElementById("locationImage").alt = "";
    document.getElementById("locationCountry").textContent = "No results"; document.getElementById("locationCity").textContent = "Change the filters";
    document.getElementById("locationName").textContent = "No matching works"; document.getElementById("locationSummary").textContent = "Choose at least one work type and attribution category.";
    document.getElementById("workList").innerHTML = ""; document.getElementById("sourceLink").removeAttribute("href"); return;
  }
  const work = location.works[0];
  const image = artworkImage(work);
  const imageElement = document.getElementById("locationImage");
  imageFrame.classList.toggle("image-missing",!image);
  imageFrame.style.setProperty("--artwork-image",image ? `url("${image}")` : "none");
  if (image) imageElement.src = image; else imageElement.removeAttribute("src");
  imageElement.alt = image ? `${work.title} by ${work.artistName}` : "";
  document.getElementById("locationCountry").textContent = location.country;
  document.getElementById("locationCity").textContent = location.city;
  document.getElementById("locationName").textContent = location.name;
  document.getElementById("locationSummary").textContent = `${location.works.length} selected ${location.works.length === 1 ? "work or ensemble is" : "works or ensembles are"} recorded here.`;
  document.getElementById("workList").innerHTML = location.works.map(item => `<div class="work-item"><strong>${item.title}</strong><span class="${item.attribution === "Attributed" ? "debated" : ""}">${item.date} · ${item.type}${item.attribution === "Attributed" ? " · attribution debated" : ""}</span></div>`).join("");
  document.getElementById("sourceLink").href = location.source;
}

function renderLocationCards() {
  document.getElementById("locationCards").innerHTML = filteredLocations.map(location => `<button class="place-card" data-location="${location.id}"><span>${location.city} · ${location.country}</span><h3>${location.name}</h3><p>${location.works.slice(0,2).map(work => work.title).join(" · ")}${location.works.length > 2 ? ` · +${location.works.length - 2} more` : ""}</p><b>${location.works.length} ${location.works.length === 1 ? "work / ensemble" : "works / ensembles"} →</b></button>`).join("");
  document.querySelectorAll(".place-card").forEach(card => card.addEventListener("click",() => selectLocation(card.dataset.location)));
}

function renderListView() {
  document.getElementById("listView").innerHTML = filteredLocations.map(location => `<button data-location="${location.id}"><span><strong>${location.name}</strong><small>${location.city}, ${location.country}</small></span><b>${location.works.length}</b></button>`).join("");
  document.querySelectorAll("#listView button").forEach(button => button.addEventListener("click",() => selectLocation(button.dataset.location)));
}

function renderArtworkGallery() {
  const gallery = document.getElementById("artworkGallery"); if (!gallery) return;
  gallery.innerHTML = filteredArtworks.map(work => { const image = artworkImage(work); return `<article class="artwork-card"><a class="artwork-picture ${image ? "" : "image-missing"}" href="${work.source}" target="_blank" rel="noreferrer">${image ? `<img src="${image}" alt="${work.title} by ${work.artistName}" loading="lazy">` : `<i>${work.title}</i>`}<span>${work.type}</span></a><div class="artwork-details"><p>${work.city} · ${work.country}</p><h3>${work.title}</h3><small>${work.date} · ${work.location}</small>${work.attribution === "Attributed" ? '<b>Attribution debated</b>' : ''}<a href="${work.source}" target="_blank" rel="noreferrer">View official source ↗</a></div></article>`; }).join("");
  document.getElementById("artworkGalleryCount").textContent = `${filteredArtworks.length} shown`;
}

function updateCounts() {
  const records = artistWorks();
  document.getElementById("countSculpture").textContent = records.filter(work => work.type === "Sculpture").length;
  document.getElementById("countPainting").textContent = records.filter(work => work.type === "Painting").length;
  document.getElementById("countFresco").textContent = records.filter(work => work.type === "Fresco").length;
  document.getElementById("countAccepted").textContent = records.filter(work => work.attribution === "Accepted" || work.attribution === "Michelangelo").length;
  document.getElementById("countAttributed").textContent = records.filter(work => work.attribution === "Attributed").length;
}
