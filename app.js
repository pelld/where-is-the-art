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
const artworkCache = new Map();
let artistRequestToken = 0;
let map;
const markerByLocation = new Map();
const GALLERY_LIMIT = 120;
const LOCATION_WORK_LIMIT = 12;
const expandedLocationIds = new Set();

/* ============================================================
   01. DATA LOADING AND NORMALISATION
   ============================================================ */
fetch("artists.json").then(response => {
  if (!response.ok) throw new Error("The artist index could not be loaded.");
  return response.json();
}).then(artistData => {
  artists = artistData.artists;
  populateArtistChoices();
  initialiseMap();
  initialiseControls();
  return selectArtist(selectedArtistId, false);
}).catch(error => showLoadError(error));

function showLoadError(error) {
  document.querySelector(".dashboard").innerHTML = `<div class="load-error"><h2>Something went wrong</h2><p>${error.message}</p></div>`;
}

function populateArtistChoices() {
  const sortedArtists = [...artists].sort((a,b) => a.name.localeCompare(b.name));
  document.getElementById("artistOptions").innerHTML = sortedArtists.map(artist => `<option value="${artist.name}"></option>`).join("");
  document.getElementById("availableCount").textContent = `Browse ${artists.length} available artist${artists.length === 1 ? "" : "s"}`;
  renderArtistDirectory(sortedArtists);
}

function renderArtistDirectory(records = artists) {
  const directory = document.getElementById("artistDirectory");
  directory.innerHTML = records.map(artist => `<button type="button" data-artist-id="${artist.id}" class="${artist.id === selectedArtistId ? "active" : ""}">${artist.name}<small>${artist.reviewStatus === "curated" ? "Curated" : "Generated"}</small></button>`).join("");
  directory.querySelectorAll("button").forEach(button => button.addEventListener("click",() => {
    selectArtist(button.dataset.artistId).catch(showLoadError);
    document.getElementById("artistBrowser").open = false;
  }));
}

function normaliseSearch(value) {
  return value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function editDistance(left,right) {
  const previous = Array.from({ length:right.length + 1 },(_,index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(previous[rightIndex] + 1,previous[rightIndex - 1] + 1,diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

function findArtistMatch(query) {
  const value = normaliseSearch(query);
  if (!value) return null;
  const candidates = artists.map(artist => {
    const names = [artist.name,artist.fullName,artist.displayName,artist.shortName,artist.id].filter(Boolean).map(normaliseSearch);
    const tokens = names.flatMap(name => name.split(" ").filter(token => token.length >= 4));
    const exact = names.some(name => name === value);
    const partial = names.some(name => name.includes(value) || value.includes(name)) || tokens.some(token => token === value);
    const distance = Math.min(...[...names,...tokens].map(name => editDistance(value,name)));
    return { artist,exact,partial,distance };
  });
  const direct = candidates.find(candidate => candidate.exact) || candidates.find(candidate => candidate.partial);
  if (direct) return { artist:direct.artist,fuzzy:false };
  candidates.sort((a,b) => a.distance - b.distance);
  const best = candidates[0];
  const threshold = Math.max(2,Math.floor(value.length * .3));
  return best && best.distance <= threshold ? { artist:best.artist,fuzzy:true } : null;
}

async function loadArtistArtworks(artist) {
  if (artworkCache.has(artist.id)) return artworkCache.get(artist.id);
  const response = await fetch(artist.dataFile);
  if (!response.ok) throw new Error(`The ${artist.name} dataset could not be loaded.`);
  const data = await response.json();
  artworkCache.set(artist.id,data.artworks);
  return data.artworks;
}

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
  document.getElementById("artistInput").addEventListener("input",event => {
    const query = normaliseSearch(event.target.value);
    const matches = [...artists].filter(artist => normaliseSearch(`${artist.name} ${artist.fullName || ""}`).includes(query)).sort((a,b) => a.name.localeCompare(b.name));
    renderArtistDirectory(matches.length || !query ? matches.length ? matches : [...artists].sort((a,b) => a.name.localeCompare(b.name)) : []);
  });
}

async function runArtistSearch() {
  const input = document.getElementById("artistInput");
  const query = input.value.trim();
  const match = findArtistMatch(query);
  if (match) {
    await selectArtist(match.artist.id);
    if (match.fuzzy) {
      const note = document.getElementById("searchNote");
      note.textContent = `Matched “${query}” to ${match.artist.name}. ${match.artist.reviewStatus === "curated" ? "This catalogue is curated." : "These generated records still need individual review."}`;
    }
  } else {
    const note = document.getElementById("searchNote");
    note.textContent = `No available artist closely matches “${query}”. Open the artist list to browse every available name.`;
    note.classList.add("search-warning");
    document.getElementById("artistBrowser").open = true;
  }
}

async function selectArtist(artistId, announce = true) {
  const artist = artists.find(item => item.id === artistId);
  if (!artist) return;
  const requestToken = ++artistRequestToken;
  const loadedArtworks = await loadArtistArtworks(artist);
  if (requestToken !== artistRequestToken) return;
  selectedArtistId = artist.id;
  expandedLocationIds.clear();
  artworks = loadedArtworks;
  selectedLocationId = artist.defaultLocationId;
  document.getElementById("artistInput").value = artist.name;
  document.getElementById("artistName").textContent = artist.displayName || artist.name;
  document.getElementById("artistIntro").textContent = artist.intro;
  document.getElementById("tripHeading").textContent = `Plan a ${artist.shortName || artist.name} trip`;
  document.getElementById("tripSummary").textContent = artist.tripSummary;
  document.querySelector(".dashboard").setAttribute("aria-label",`${artist.name} work locations`);
  document.getElementById("map").setAttribute("aria-label",`Map showing locations of ${artist.name} works`);
  const note = document.getElementById("searchNote");
  note.textContent = artist.reviewStatus === "curated" ? `Showing the curated ${artist.name} catalogue.` : `Showing a generated Wikidata catalogue for ${artist.name}. Individual records still need review.`;
  note.classList.remove("search-warning");
  renderArtistDirectory([...artists].sort((a,b) => a.name.localeCompare(b.name)));
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
  const expanded = expandedLocationIds.has(location.id);
  const visibleWorks = expanded ? location.works : location.works.slice(0,LOCATION_WORK_LIMIT);
  const remaining = location.works.length - visibleWorks.length;
  document.getElementById("workList").innerHTML = visibleWorks.map(item => `<div class="work-item"><strong>${item.title}</strong><span class="${item.attribution === "Attributed" ? "debated" : ""}">${item.date} · ${item.type}${item.attribution === "Attributed" ? " · attribution debated" : ""}</span></div>`).join("") + (remaining > 0 ? `<button class="show-all-works" id="showAllWorks">Show all ${location.works.length} works <span>↓</span></button>` : "");
  document.getElementById("showAllWorks")?.addEventListener("click",() => { expandedLocationIds.add(location.id); renderSelectedLocation(); });
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
  const displayedArtworks = filteredArtworks.slice(0,GALLERY_LIMIT);
  gallery.innerHTML = displayedArtworks.map(work => { const image = artworkImage(work); return `<article class="artwork-card"><a class="artwork-picture ${image ? "" : "image-missing"}" href="${work.source}" target="_blank" rel="noreferrer">${image ? `<img src="${image}" alt="${work.title} by ${work.artistName}" loading="lazy">` : `<i>${work.title}</i>`}<span>${work.type}</span></a><div class="artwork-details"><p>${work.city} · ${work.country}</p><h3>${work.title}</h3><small>${work.date} · ${work.location}</small>${work.attribution === "Attributed" ? '<b>Attribution debated</b>' : ''}<a href="${work.source}" target="_blank" rel="noreferrer">View official source ↗</a></div></article>`; }).join("");
  document.getElementById("artworkGalleryCount").textContent = filteredArtworks.length > GALLERY_LIMIT ? `Showing ${GALLERY_LIMIT} of ${filteredArtworks.length}` : `${filteredArtworks.length} shown`;
}

function updateCounts() {
  const records = artistWorks();
  document.getElementById("countSculpture").textContent = records.filter(work => work.type === "Sculpture").length;
  document.getElementById("countPainting").textContent = records.filter(work => work.type === "Painting").length;
  document.getElementById("countFresco").textContent = records.filter(work => work.type === "Fresco").length;
  document.getElementById("countAccepted").textContent = records.filter(work => work.attribution === "Accepted" || work.attribution === "Michelangelo").length;
  document.getElementById("countAttributed").textContent = records.filter(work => work.attribution === "Attributed").length;
}
