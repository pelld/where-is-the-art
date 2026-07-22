/* ============================================================
   00. APPLICATION STATE
   ============================================================ */
let artworks = [];
let locations = [];
let filteredLocations = [];
let selectedLocationId = "accademia";
let map;
let markerLayer;
const markerByLocation = new Map();

/* ============================================================
   01. DATA LOADING AND NORMALISATION
   ============================================================ */
fetch("data/artworks.json").then(response => { if (!response.ok) throw new Error("The artwork data could not be loaded."); return response.json(); }).then(data => {
  artworks = data.artworks;
  locations = groupByLocation(artworks);
  initialiseMap();
  initialiseControls();
  updateCounts();
  applyFilters();
}).catch(error => {
  document.querySelector(".dashboard").innerHTML = `<div class="load-error"><h2>Something went wrong</h2><p>${error.message}</p></div>`;
});

function groupByLocation(records) {
  const grouped = new Map();
  records.forEach(work => {
    if (!grouped.has(work.locationId)) grouped.set(work.locationId, { id:work.locationId, name:work.location, city:work.city, country:work.country, lat:work.lat, lon:work.lon, source:work.source, image:work.image, works:[] });
    grouped.get(work.locationId).works.push(work);
  });
  return [...grouped.values()].sort((a,b) => b.works.length - a.works.length || a.city.localeCompare(b.city));
}

/* ============================================================
   02. MAP CREATION
   ============================================================ */
function initialiseMap() {
  map = L.map("map", { zoomControl:true, scrollWheelZoom:true }).setView([46.5,8],5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:18 }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function renderMarkers() {
  markerLayer.clearLayers();
  markerByLocation.clear();
  filteredLocations.forEach((location,index) => {
    const isSelected = location.id === selectedLocationId;
    const icon = L.divIcon({ className:"", html:`<div class="art-marker ${isSelected ? "selected" : ""}"><span>${location.works.length}</span></div>`, iconSize:[42,42], iconAnchor:[21,21] });
    const marker = L.marker([location.lat,location.lon], { icon }).bindPopup(`<div class="map-popup"><strong>${location.name}</strong><small>${location.city} · ${location.works.length} ${location.works.length === 1 ? "work" : "works/ensembles"}</small></div>`);
    marker.on("click", () => selectLocation(location.id,false));
    marker.addTo(markerLayer);
    markerByLocation.set(location.id,marker);
  });
}

/* ============================================================
   03. FILTERS, SEARCH AND VIEW SWITCHING
   ============================================================ */
function initialiseControls() {
  document.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener("change",applyFilters));
  document.getElementById("resetFilters").addEventListener("click",() => { document.querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = true); applyFilters(); });
  document.querySelectorAll(".view-toggle button").forEach(button => button.addEventListener("click",() => switchView(button.dataset.view)));
  document.getElementById("searchButton").addEventListener("click",runArtistSearch);
  document.getElementById("artistInput").addEventListener("keydown",event => { if (event.key === "Enter") runArtistSearch(); });
}

function runArtistSearch() {
  const value = document.getElementById("artistInput").value.trim().toLowerCase();
  const note = document.getElementById("searchNote");
  if (!value || "michelangelo buonarroti".includes(value) || value.includes("michelangelo")) { note.textContent = "Showing the Michelangelo proof of concept. The same data structure can support additional artists."; note.classList.remove("search-warning"); }
  else { note.textContent = `“${document.getElementById("artistInput").value.trim()}” is not in the proof of concept yet.`; note.classList.add("search-warning"); }
}

function applyFilters() {
  const types = [...document.querySelectorAll('input[name="type"]:checked')].map(input => input.value);
  const attributions = [...document.querySelectorAll('input[name="attribution"]:checked')].map(input => input.value);
  const filteredWorks = artworks.filter(work => types.includes(work.type) && attributions.includes(work.attribution));
  filteredLocations = groupByLocation(filteredWorks);
  if (!filteredLocations.some(location => location.id === selectedLocationId)) selectedLocationId = filteredLocations[0]?.id || null;
  renderMarkers();
  renderLocationCards();
  renderListView();
  renderSelectedLocation();
  document.getElementById("locationCount").textContent = `${filteredLocations.length} ${filteredLocations.length === 1 ? "location" : "locations"}`;
  document.getElementById("workCount").textContent = `${filteredWorks.length} ${filteredWorks.length === 1 ? "work or ensemble" : "works and ensembles"}`;
}

function switchView(view) {
  document.querySelectorAll(".view-toggle button").forEach(button => button.classList.toggle("active",button.dataset.view === view));
  document.getElementById("map").hidden = view !== "map";
  document.getElementById("mapAttribution").hidden = view !== "map";
  document.getElementById("listView").hidden = view !== "list";
  if (view === "map") setTimeout(() => map.invalidateSize(),0);
}

/* ============================================================
   04. SELECTED LOCATION AND RESULT CARDS
   ============================================================ */
function selectLocation(locationId,scroll = true) {
  selectedLocationId = locationId;
  renderMarkers();
  renderSelectedLocation();
  renderLocationCards();
  const location = filteredLocations.find(item => item.id === locationId);
  if (location) { map.flyTo([location.lat,location.lon],Math.max(map.getZoom(),6),{ duration:.7 }); markerByLocation.get(locationId)?.openPopup(); }
  if (scroll && window.innerWidth < 850) document.getElementById("locationPanel").scrollIntoView({ behavior:"smooth",block:"start" });
}

function renderSelectedLocation() {
  const location = filteredLocations.find(item => item.id === selectedLocationId);
  if (!location) {
    document.getElementById("locationImage").removeAttribute("src");
    document.getElementById("locationImage").alt = "";
    document.getElementById("locationCountry").textContent = "No results";
    document.getElementById("locationCity").textContent = "Change the filters";
    document.getElementById("locationName").textContent = "No matching works";
    document.getElementById("locationSummary").textContent = "Choose at least one work type and attribution category.";
    document.getElementById("workList").innerHTML = "";
    document.getElementById("sourceLink").removeAttribute("href");
    return;
  }
  document.getElementById("locationImage").src = location.image;
  document.getElementById("locationImage").alt = `${location.works[0].title} by Michelangelo`;
  document.getElementById("locationCountry").textContent = location.country;
  document.getElementById("locationCity").textContent = location.city;
  document.getElementById("locationName").textContent = location.name;
  document.getElementById("locationSummary").textContent = `${location.works.length} selected ${location.works.length === 1 ? "work or ensemble is" : "works or ensembles are"} recorded here.`;
  document.getElementById("workList").innerHTML = location.works.map(work => `<div class="work-item"><strong>${work.title}</strong><span class="${work.attribution === "Attributed" ? "debated" : ""}">${work.date} · ${work.type}${work.attribution === "Attributed" ? " · attribution debated" : ""}</span></div>`).join("");
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

function updateCounts() {
  document.getElementById("countSculpture").textContent = artworks.filter(work => work.type === "Sculpture").length;
  document.getElementById("countPainting").textContent = artworks.filter(work => work.type === "Painting").length;
  document.getElementById("countFresco").textContent = artworks.filter(work => work.type === "Fresco").length;
  document.getElementById("countAccepted").textContent = artworks.filter(work => work.attribution === "Michelangelo").length;
  document.getElementById("countAttributed").textContent = artworks.filter(work => work.attribution === "Attributed").length;
}
