# Where Is the Art By…?

A GitHub Pages proof of concept for answering a simple question: **where can I see original works by a particular artist?**

The first dataset covers selected sculptures, paintings and frescoes by Michelangelo. It brings together the present locations, coordinates, attribution status and official collection sources in one human-readable JSON file.

## View the site

Once GitHub Pages is enabled, the site will be available at:

`https://pelld.github.io/where-is-the-art/`

## Run locally

Because the site loads its data using `fetch`, serve the folder through a small local web server rather than opening `index.html` directly:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Files

- `index.html` — accessible page structure
- `styles.css` — responsive gallery-style interface
- `app.js` — data loading, filters, map and interactions
- `data/artworks.json` — evidence-led artwork and location records

## Data caveats

- The dataset is a selected proof of concept, not a catalogue raisonné.
- Drawings, architectural work, copies and lost works are excluded.
- Attribution is contested for some early works; these are labelled separately.
- A work being associated with a collection does not guarantee it is currently on display.
- Always follow the official source before making a special journey.

## Publishing on GitHub Pages

1. Create a public repository named `where-is-the-art` under the GitHub account `pelld`.
2. Upload or push these files to the repository's `main` branch.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then save.

No Firebase or server is required.


## Adding another artist

Artist-level copy and defaults live in `artists.json`. Artwork records live in `artworks.json` and are joined with the `artistId` field. The interface derives its search choices, totals, filters, map markers, location cards and gallery from those two files.

The proof of concept currently contains Michelangelo and Johannes Vermeer. To add another artist, add one artist record, then add artwork records using the same `artistId`. No Firebase or database is required.


## Scalable catalogue

The browser first loads `artists.json`, then downloads only the selected artist's file from `data/`. This keeps initial loading small even as the catalogue grows.

The catalogue currently includes two curated datasets and five generated Wikidata datasets. Generated records carry provenance and a review-status flag; they should be treated as discovery data until checked against the holding institution.

Run a refresh locally with:

```bash
node scripts/import-wikidata.mjs
cp generated-data/*.json data/
node scripts/validate-data.mjs
```

The monthly GitHub Actions workflow performs the same import and validation. Add an artist to the importer and `artists.json` to expand the catalogue.


## 100-artist expansion

`artist-seeds.json` contains 93 deliberately selected candidate painters. Together with the two curated and five active generated artists, this defines a 100-artist catalogue. `artist-registry.json` stores their resolved Wikidata identifiers. The workflow accepts an offset and batch size so new artist files can be generated and reviewed in manageable groups instead of placing excessive load on Wikidata or publishing unchecked records all at once.
