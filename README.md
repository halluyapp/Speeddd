# Velocity — Vehicle Asset Library

A local, reusable collection of **11 detailed GLB vehicles**: the original VX-1 concept plus **10 additional cars**. The interactive Three.js page is an **asset showcase only**—there are no driving, racing, AI, collision, or multiplayer systems.

## Run the showcase

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. A local HTTP server is required; do not open `index.html` through `file://`.

```bash
npm run build       # production site in dist/
npm run preview     # serve the production build
npm test            # catalog and packaging checks
npm run validate:assets  # Khronos glTF validation + geometry/attribution checks
```

All runtime libraries, fonts, previews, decoders, and models are served locally. The showcase makes no CDN or third-party runtime requests.

## Collection

| # | Showcase name | Vehicle type | Triangles | Source license |
|---:|---|---|---:|---|
| 01 | VX-1 Concept | Concept grand tourer | 213,347 | CC BY 4.0 |
| 02 | Aether HX | Electric hypercar concept | 196,500 | CC BY 4.0 |
| 03 | Vector 84 | Retro wedge concept | 71,240 | CC BY 4.0 |
| 04 | Raptor XRT | Rally-raid concept | 127,812 | CC BY 4.0 |
| 05 | Ender LM-9 | Endurance prototype concept | 247,752 | CC BY 4.0 |
| 06 | Silverline S1 | Experimental streamliner | 389,520 | CC BY 4.0 |
| 07 | Corsa RS | Generic sport coupe | 113,622 | CC BY 4.0 |
| 08 | Sovereign S | Generic sports sedan | 113,191 | CC BY 4.0 |
| 09 | Goblin V12 | Fictional supercar | 86,623 | CC BY 4.0 |
| 10 | Mercedes-AMG SL 63 | Detailed production roadster | 359,979 | CC BY 4.0 |
| 11 | BMW M4 CSL | Detailed production track coupe | 286,137 | CC BY 4.0 |

**Attribution is required for every vehicle.** See [LICENSES.md](LICENSES.md), the in-app license browser, or `public/assets/catalog.json`. Each GLB also contains its own author/source/license metadata.

## Showcase features

- One-at-a-time, real-time PBR vehicle rendering
- Fleet filters and local rendered WebP thumbnails
- Orbit, zoom, automatic rotation, and front/side/rear/three-quarter camera presets
- Isolated body-paint controls with gloss, satin, and matte finishes
- Factory-material restoration for every paintable model
- Performance/design metadata and asset geometry information
- Direct GLB and JSON catalog downloads
- Per-asset source, author, license, and modification records
- Keyboard controls, deep links (`#hypercar`, `#wedge`, etc.), fullscreen, and responsive layouts

Performance figures are fictional design targets unless a production reference is explicitly mentioned. They are **metadata for later game design**, not a driving simulation or manufacturer specification service.

## Repository layout

```text
index.html                       Showcase markup and dialogs
src/
  main.js                        Three.js viewer and UI behavior
  style.css                      Responsive showroom design
public/
  assets/
    catalog.json                 Reusable vehicle and credit manifest
    cars/                        11 self-contained GLB assets
    previews/                    Locally rendered WebP fleet thumbnails
    draco/                       Local Draco decoder for compatible assets
scripts/
  validate-assets.js             glTF and catalog validation
  embed_attribution.py           Losslessly refresh GLB credit metadata
tests/
  catalog.test.js                Collection/package checks
LICENSES.md                      Full attribution and modification record
```

## Using the assets later

Each vehicle can be downloaded independently from the showcase or taken directly from `public/assets/cars/`.

- **Geometry and textures remain in the GLB.** Paint selections are viewer operations and are not baked into downloads.
- The viewer normalizes each vehicle to its catalog length, places it on the showroom floor, and presents it nose-forward. These runtime transforms do not rewrite the source geometry.
- `public/assets/catalog.json` records source orientation exceptions, target length, paint material names, hidden helper nodes, design metadata, and credits.
- The two production-car GLBs use Meshopt compression and WebP textures. The included Three.js loader supports them; other tools may need a Meshopt-compatible importer or an optimization/conversion pass.
- The Goblin source was converted from legacy specular/glossiness materials to standard metallic/roughness PBR for current glTF viewers.
- Detailed source models vary in node structure and triangle count. Plan target-platform LODs, collision meshes, and wheel rigs when the actual game requirements exist; those systems are intentionally outside this asset-only task.

After editing credits in the catalog, run:

```bash
python scripts/embed_attribution.py
npm run validate:assets
```

The attribution script changes only the GLB JSON metadata chunk and preserves the binary geometry/material data.

## Production names and marks

The Mercedes-Benz, AMG, BMW, and M names/marks belong to their respective owners. Their model licenses permit reuse with attribution, but model copyright licensing does not grant manufacturer endorsement or separate trademark rights. This is an independent asset collection.
