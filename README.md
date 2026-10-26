# Velocity — Asset Library

A local, reusable asset foundation containing **11 detailed vehicles** and the original **Azurline Circuit** coastal environment. Vehicles include untouched masters, four runtime LODs, convex collision meshes, and wheel-rig metadata. The track includes four purpose-built LODs, drive-surface/terrain/barrier collision, and race-layout metadata. The Three.js pages are **asset inspectors only**—there are no driving, racing, AI, physics, or multiplayer systems.

## Run the inspectors

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. A local HTTP server is required; do not open the HTML files through `file://`.

- `index.html` — vehicle collection and paint showroom
- `track.html` — Azurline Circuit environment inspector

```bash
npm run build           # production multi-page site in dist/
npm run preview         # serve the production build
npm test                # vehicle and track catalogue/package checks
npm run validate:assets # all vehicle + track geometry and metadata checks
npm run validate:cars   # vehicle checks only
npm run validate:track  # coastal-track checks only
```

All runtime libraries, fonts, previews, decoders, and models are served locally. Neither inspector makes CDN or third-party runtime requests.

## Rebuild the vehicle packages

The generated runtime assets are committed, so a normal site build does not need to regenerate them. After changing a vehicle master or its pipeline, run:

```bash
npm run build:cars
# Or rebuild one vehicle while iterating:
npm run build:cars -- --only hypercar
```

The pipeline uses glTF Transform, Meshoptimizer, Sharp, and Three.js. It reads each master from `assets-src/cars/` and writes:

- `public/assets/cars/lods/<id>-lod0.glb` — high-quality runtime **LOD0**
- `public/assets/cars/lods/<id>-lod1.glb` through `-lod3.glb` — three simplified versions
- `public/assets/cars/collisions/<id>-collision.glb` — a basic convex hull
- `public/assets/cars/rigs/<id>.json` — dimensions, wheel positions/radii/widths, LOD metrics, and collision reference
- Updated catalogue metrics and `public/assets/cars/LICENSES.txt`

Vehicle LODs use Meshopt geometry compression and WebP textures. Named wheel nodes, paint materials, attribution, and applicable node hierarchy are retained. The unused source skin in the sport coupé is pruned; there are no active skinned meshes to remove. The vehicle masters themselves are never written by the build pipeline.

## Rebuild Azurline Circuit

```bash
npm run build:track
npm run validate:track
```

`scripts/build-coastal-track.js` deterministically generates the original master and all derivatives. No third-party environment geometry is used; the environment is **CC0 1.0**. Outputs include:

- `assets-src/tracks/azurline-circuit.glb` — full-detail procedural master
- `public/assets/tracks/lods/azurline-circuit-lod0.glb` through `-lod3.glb`
- `public/assets/tracks/collisions/azurline-circuit-collision.glb`
- `public/assets/tracks/azurline-circuit.json` — reusable layout, grid, checkpoint, sector, camera, and package manifest
- `public/assets/previews/azurline-circuit.webp` — instant illustrated circuit-map poster

The four track LODs are purpose-built from the same centerline rather than aggressively simplifying the road. They preserve the closed driving layout while reducing terrain, ocean, vegetation, and decorative detail.

## Vehicle collection

Triangle counts below are for runtime LOD0 after cleanup. Each vehicle asset-details dialog exposes all four LOD downloads and their exact counts.

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

## Azurline Circuit package

| Metric | Value |
|---|---:|
| Closed lap | 2,799.5 m |
| Road / shoulder width | 14 m / 2 m |
| Elevation change | 64.2 m |
| Grid / checkpoints / sectors | 16 / 12 / 3 |
| LOD0–LOD3 triangles | 133,986 / 83,730 / 43,674 / 23,804 |
| LOD0–LOD3 sizes | 0.9 / 0.6 / 0.4 / 0.2 MB |
| Basic collision | 10,740 triangles |
| License | CC0 1.0 |

The environment includes the elevated road loop, edge markings, red/white curbs, guardrails and tire barriers, start gantry and grid markings, pit garages, grandstand, track lights, brake boards, coastal terrain, ocean and shoreline, rocks, palms, and scrub. The inspector provides overview, start-grid, hairpin, and coast cameras; a live circuit map; working LOD switches; and direct GLB/JSON downloads.

## Repository layout

```text
assets-src/
  cars/                          Untouched vehicle masters + source attribution
  tracks/                        Original procedural environment masters
index.html                       Vehicle showroom
track.html                       Coastal environment inspector
src/
  main.js / style.css            Vehicle viewer and responsive showroom
  track.js / track.css           Environment viewer, map, LOD and camera UI
public/
  assets/
    catalog.json                 Vehicle collection + track-manifest index
    cars/
      lods/                      Vehicle LOD0–LOD3 GLBs
      collisions/                Vehicle convex collision GLBs
      rigs/                      Wheel/dimension/package JSON records
    tracks/
      azurline-circuit.json      Layout, grid, checkpoints, sectors and package data
      lods/                      Track LOD0–LOD3 GLBs
      collisions/                Road, terrain and barrier collision GLB
    previews/                    Vehicle renders + illustrated track poster
    draco/                       Local Draco decoder for compatible assets
scripts/
  build-car-assets.js            Vehicle master → runtime pipeline
  build-coastal-track.js         Original coastal master + runtime generator
  validate-assets.js             Vehicle geometry, LOD, collision and rig validation
  validate-track-assets.js       Track glTF, layout and package validation
  embed_attribution.py           Update vehicle-master credit metadata
tests/
  catalog.test.js                Vehicle collection/package checks
  track.test.js                  Coastal environment/package checks
LICENSES.md                      Full attribution and modification record
```

## Using the assets later

- **Vehicle conventions are baked.** Every vehicle LOD uses metres, Y-up, +Z-forward, horizontal centering, and ground-zero placement. The showroom does not rescale or rotate these assets again.
- **LOD selection is explicit.** Manifests map levels `0`–`3` to local GLB paths and record exact triangle counts and byte sizes. A future game can choose them by camera distance or platform budget.
- **Vehicle collision is a starting point.** Single convex hulls support basic arcade experiments, not final vehicle physics. Suspension, chassis shape, tire behavior, and handling still need validation in the driving prototype.
- **Wheel metadata is reusable.** Rig JSON provides `FL`, `FR`, `RL`, and `RR` records, source node names, positions, radii, widths, and steering/axle labels. It is not an animation or suspension controller.
- **Track race data is reusable.** The manifest provides a closed centerline, start transform, 16 staggered grid slots, 12 ordered checkpoint/respawn transforms, three sectors, road bounds, and camera hints. It does not implement lap validation or race rules.
- **Track collision is separated by role.** The collision GLB contains `collision-road`, `collision-terrain`, `collision-barriers`, and start-structure geometry. Final physics layering and trigger volumes belong to the driving prototype.
- **Paint remains a viewer operation.** Vehicle paint selections are not baked into downloads.
- **Masters remain separate.** Use `assets-src/` for source work and `public/assets/` for runtime deployment. Do not edit generated runtime files directly.
- **Meshopt support is required for runtime visual LODs.** The included Three.js loaders support it; other tools may need a Meshopt-compatible importer. Collision GLBs are intentionally simple uncompressed geometry.

After editing vehicle credits in the catalogue, deliberately update the master metadata and regenerate the runtime packages:

```bash
python scripts/embed_attribution.py
npm run build:cars
npm run validate:assets
```

The attribution script changes only each vehicle-master GLB's JSON metadata chunk and preserves its binary geometry/material data. The build pipeline then carries attribution into every generated runtime LOD and collision asset.

## Production names and marks

The Mercedes-Benz, AMG, BMW, and M names/marks belong to their respective owners. Their model licenses permit reuse with attribution, but model copyright licensing does not grant manufacturer endorsement or separate trademark rights. Azurline Circuit is an original fictional environment. This is an independent asset collection.
