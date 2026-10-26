# Velocity — Vehicle Asset Library

A local, reusable collection of **11 detailed vehicles**, each with an untouched master GLB, four optimized runtime LODs, a basic convex collision mesh, and four-wheel rig metadata. The interactive Three.js page is an **asset showcase only**—there are no driving, racing, AI, physics, or multiplayer systems.

## Run the showcase

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. A local HTTP server is required; do not open `index.html` through `file://`.

```bash
npm run build           # production site in dist/
npm run preview         # serve the production build
npm test                # catalogue and packaging checks
npm run validate:assets # Khronos validation + decoded geometry/rig checks
```

All runtime libraries, fonts, previews, decoders, and models are served locally. The showcase makes no CDN or third-party runtime requests.

## Rebuild the vehicle packages

The generated runtime assets are committed, so a normal site build does not need to regenerate them. After changing a master or the pipeline, run:

```bash
npm run build:cars
# Or rebuild one vehicle while iterating:
npm run build:cars -- --only hypercar
```

The reproducible pipeline uses glTF Transform, Meshoptimizer, Sharp, and Three.js. It reads each master from `assets-src/cars/` and writes:

- `public/assets/cars/lods/<id>-lod0.glb` — high-quality runtime **LOD0**
- `public/assets/cars/lods/<id>-lod1.glb` through `-lod3.glb` — three progressively simplified versions
- `public/assets/cars/collisions/<id>-collision.glb` — a basic convex hull
- `public/assets/cars/rigs/<id>.json` — dimensions, wheel positions/radii/widths, LOD metrics, and collision reference
- Updated catalogue metrics and `public/assets/cars/LICENSES.txt`

Vehicle LODs use Meshopt geometry compression and WebP textures. Named wheel nodes, paint materials, attribution, and applicable node hierarchy are retained. The unused source skin in the sport coupé is pruned; there are no active skinned meshes to remove. The masters themselves are never written by the build pipeline.

## Collection

Triangle counts below are for runtime LOD0 after cleanup. Each asset details dialog exposes all four LOD downloads and their exact counts.

| # | Showcase name | Vehicle type | LOD0 triangles | Source license |
|---:|---|---|---:|---|
| 01 | VX-1 Concept | Concept grand tourer | 213,347 | CC BY 4.0 |
| 02 | Aether HX | Electric hypercar concept | 189,012 | CC BY 4.0 |
| 03 | Vector 84 | Retro wedge concept | 70,592 | CC BY 4.0 |
| 04 | Raptor XRT | Rally-raid concept | 66,732 | CC BY 4.0 |
| 05 | Ender LM-9 | Endurance prototype concept | 238,680 | CC BY 4.0 |
| 06 | Silverline S1 | Experimental streamliner | 386,736 | CC BY 4.0 |
| 07 | Corsa RS | Generic sport coupe | 113,622 | CC BY 4.0 |
| 08 | Sovereign S | Generic sports sedan | 102,219 | CC BY 4.0 |
| 09 | Goblin V12 | Fictional supercar | 86,623 | CC BY 4.0 |
| 10 | Mercedes-AMG SL 63 | Detailed production roadster | 359,979 | CC BY 4.0 |
| 11 | BMW M4 CSL | Detailed production track coupe | 286,137 | CC BY 4.0 |

**Attribution is required for every vehicle and its derivatives.** See [LICENSES.md](LICENSES.md), the in-app license browser, `public/assets/cars/LICENSES.txt`, or `public/assets/catalog.json`. Each GLB also contains author/source/license metadata.

## Showcase features

- Instant local vehicle poster while optimized interactive 3D loads in the background
- One-at-a-time, real-time PBR vehicle rendering with baked dimensions and grounding
- Fleet filters and local rendered WebP thumbnails
- Orbit, zoom, automatic rotation, and front/side/rear/three-quarter camera presets
- Isolated body-paint controls with gloss, satin, and matte finishes
- Factory-material restoration for every paintable model
- Performance/design metadata and asset geometry information
- Direct LOD0–LOD3, collision GLB, wheel-rig JSON, and JSON catalogue downloads
- Per-asset source, author, license, master/runtime modification records
- Keyboard controls, deep links (`#hypercar`, `#wedge`, etc.), fullscreen, and responsive layouts

Performance figures are fictional design targets unless a production reference is explicitly mentioned. They are **metadata for later game design**, not a driving simulation or manufacturer specification service.

## Repository layout

```text
assets-src/
  cars/                          Untouched master GLBs + source attribution
index.html                       Showcase markup and dialogs
src/
  main.js                        Three.js viewer and UI behavior
  style.css                      Responsive showroom design
public/
  assets/
    catalog.json                 Reusable vehicle, LOD, rig, and credit manifest
    cars/                        Runtime attribution summary
      lods/                      Runtime LOD0–LOD3 GLBs
      collisions/                Basic convex collision GLBs
      rigs/                      Wheel/dimension/package JSON records
    previews/                    Locally rendered WebP fleet thumbnails
    draco/                       Local Draco decoder for compatible assets
scripts/
  build-car-assets.js            Reproducible master → runtime pipeline
  validate-assets.js             glTF, decoded bounds, LOD, collision, and rig validation
  embed_attribution.py           Update master GLB credit metadata after credit edits
tests/
  catalog.test.js                Collection/package checks
LICENSES.md                      Full attribution and modification record
```

## Using the assets later

Each runtime vehicle can be downloaded independently from the showcase or taken directly from `public/assets/cars/`.

- **Scale and orientation are baked into runtime assets.** Every LOD uses metres, Y-up, +Z-forward, horizontal centering, and ground-zero placement. The viewer does not rescale or rotate these assets again.
- **LOD selection is explicit.** `catalog.json` maps levels `0`–`3` to local GLB paths and records exact triangle counts. A future game can choose them by camera distance or platform budget.
- **Collision is a starting point.** The supplied single convex hull is suitable for basic arcade experiments, not final vehicle physics. Suspension, chassis shape, tire behavior, and handling still need validation in the driving prototype.
- **Wheel metadata is reusable.** Rig JSON provides four wheel records (`FL`, `FR`, `RL`, `RR`), source node names, positions, radii, widths, and steering/axle labels. It is not an animation or suspension controller.
- **Geometry and textures remain in the GLBs.** Paint selections are viewer operations and are not baked into downloads.
- **Masters remain separate.** Use `assets-src/cars/` for lossless source work; use `public/assets/cars/` for runtime deployment. Do not edit generated runtime files directly.
- **Meshopt support is required for vehicle LODs.** The included Three.js loader supports it; other tools may need a Meshopt-compatible importer. Collision GLBs are intentionally simple uncompressed geometry.

After editing credits in the catalogue, deliberately update the master metadata and regenerate the runtime packages:

```bash
python scripts/embed_attribution.py
npm run build:cars
npm run validate:assets
```

The attribution script changes only each master GLB's JSON metadata chunk and preserves its binary geometry/material data. The build pipeline then carries attribution into every generated runtime LOD and collision asset.

## Production names and marks

The Mercedes-Benz, AMG, BMW, and M names/marks belong to their respective owners. Their model licenses permit reuse with attribution, but model copyright licensing does not grant manufacturer endorsement or separate trademark rights. This is an independent asset collection.
