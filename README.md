# Velocity — Asset Library

A local, reusable asset foundation containing **11 detailed vehicles**, the original **Azurline Circuit** coastal environment, the original **Race Control** presentation kit, and original procedural **VFX and synthesized audio**. Vehicles include untouched masters, four runtime LODs, convex collision meshes, and wheel-rig metadata. The track includes four purpose-built LODs, drive-surface/terrain/barrier collision, and race-layout metadata. Race Control adds modular hardware, addressable light/display nodes, vector flags, and broadcast presentation fixtures. Media Lab adds eight real flipbook/sprite packages and eleven original sounds. The pages are **asset inspectors only**—there are no driving, racing, AI, physics, live-timing, multiplayer, damage, weapon, or combat systems.

## Run the inspectors

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. A local HTTP server is required; do not open the HTML files through `file://`.

- `index.html` — vehicle collection and paint showroom
- `track.html` — Azurline Circuit environment inspector
- `race.html` — Race Control hardware and broadcast-presentation inspector
- `effects.html` — VFX flipbook, blend/camera and isolated audio inspector

```bash
npm run build            # production multi-page site in dist/
npm run preview          # serve the production build
npm test                 # vehicle, track, presentation and media package checks
npm run validate:assets  # all geometry, metadata and media checks
npm run validate:cars    # vehicle checks only
npm run validate:track   # coastal-track checks only
npm run validate:race    # race-presentation checks only
npm run validate:effects # visual/audio format, signal and metadata checks
```

All runtime libraries, fonts, previews, decoders, graphics, and models are served locally. No inspector makes CDN or third-party runtime requests.

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

## Rebuild Race Control presentation assets

```bash
npm run build:race
npm run validate:race
```

`scripts/build-race-presentation.js` deterministically generates the original hardware masters, runtime derivatives, collision meshes, SVG flags/icons, illustrated poster, demo fixtures, and package manifest. All presentation assets are original **CC0 1.0** work. Outputs include:

- `assets-src/race/<asset-id>.glb` — three preserved procedural hardware masters
- `public/assets/race/lods/<asset-id>-lod0.glb` through `-lod3.glb` — 12 Meshopt runtime LODs
- `public/assets/race/collisions/<asset-id>-collision.glb` — three simple structural collision meshes
- `public/assets/race/graphics/` — seven standalone racing flags and a reusable SVG icon sprite
- `public/assets/race/race-presentation.json` — hardware packages, bounds, control records, graphics, and static demo data
- `public/assets/previews/race-presentation.webp` — instant illustrated poster

## Rebuild VFX and audio

```bash
npm run build:effects
npm run validate:effects
```

`scripts/build-vfx-audio.js` uses seeded procedural drawing, SVG/raster composition, and dependency-free Node PCM encoding. It does not need FFmpeg, SoX, Python audio packages, network assets, or third-party samples. All eight visual packages and eleven sounds are original **CC0 1.0** work. Outputs include:

- `assets-src/vfx/*.png` — full-resolution RGBA visual masters, preserved separately
- `assets-src/audio/*.wav` — 48 kHz / 24-bit / stereo PCM audio masters
- `public/assets/vfx/flipbooks/*.webp` and `public/assets/vfx/thumbnails/*.webp`
- `public/assets/audio/runtime/*.wav` — 32 kHz / 16-bit / stereo PCM browser runtimes
- `public/assets/audio/waveforms/*.svg` — deterministic stereo waveform graphics
- `public/assets/media/vfx-audio.json` — atlas, timing, UV/blend, loop, level and package metadata
- `public/assets/previews/vfx-audio.webp` — instant illustrated Media Lab poster

PCM WAV was selected instead of compressed audio for universal browser decoding and gapless loop boundaries. Rebuilding overwrites only generated media derivatives and the media catalogue entry; vehicle, track, and race entries remain intact.

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

## Race Control package

| Hardware | LOD0–LOD3 triangles | Collision triangles | Reusable control |
|---|---|---:|---|
| Five-column start lights | 6,268 / 3,852 / 2,724 / 1,380 | 60 | 10 individually named lenses |
| Trackside timing pylon | 3,988 / 3,476 / 3,380 / 1,894 | 24 | Eight geometric display rows |
| Marshal light panel | 1,276 / 828 / 420 / 276 | 36 | Addressable emissive display |

The package contains three masters, 12 runtime LODs, three collision GLBs, seven racing flags, an icon sprite, poster, and manifest. Hardware uses metres, Y-up, +Z-forward, and ground-zero placement. Start lenses expose `startLightIndex` and `startLightRow`; the marshal display exposes the `flag-display` role, so future runtime code can operate them without editing geometry.

The `race.html` inspector combines the real GLBs with six selectable presentation states, a replayable five-light sequence, flag/status graphics, an eight-row timing tower, telemetry layout, HUD toggle, automatic orbit, responsive cameras, and per-asset LOD/download controls. All timing, speed, gap, and race-state values are **static fictional demo fixtures**. The inspector does not calculate laps, results, flags, physics, AI, or race rules.

## Media Lab package

| Visual package | Frames / atlas | Playback | Blend |
|---|---|---|---|
| Tire smoke | 16 / 1024² | 16 fps loop | Normal alpha |
| Boost flame | 16 / 1024² | 24 fps loop | Additive |
| Spark burst | 16 / 1024² | 28 fps one-shot | Additive |
| Impact flash | 8 / 1024×512 | 24 fps one-shot | Additive |
| Explosion | 64 / 2048² | 24 fps one-shot | Additive |
| Skid mark | Single / 256×1024 | Static decal | Normal alpha |
| Radial glow | Single / 256² | Static sprite | Additive |
| Speed lines | Single / 512×256 | Static overlay | Additive |

The eleven audio packages include engine idle/high-RPM loops, tire skid, coastal wind, boost, gear shift, heavy impact, explosion, countdown, race start, and UI confirmation. Each record provides exact duration, loop state/range, peak/RMS, master/runtime paths, waveform, and direct WAV download.

Flipbooks are row-major from the **top-left** of the atlas. For a frame at column `c`, row `r`, use repeat `(1 / columns, 1 / rows)` and UV offset `(c / columns, 1 - (r + 1) / rows)`. Static sprites use the full texture. Respect each manifest blend mode and `suggestedSize`; do not infer animation from thumbnails. Audio loop runtimes are already rendered on exact sample boundaries—use `loopStart` and `loopEnd` directly without another crossfade.

The `effects.html` inspector displays the actual runtime textures, not substitute animations. It includes frame scrubbing, play/pause/replay, loop and speed controls, three cameras, automatic orbit, blend labels, thumbnails, category filters, volume, waveforms, and downloads. Sound is decoded only after an explicit play gesture; selecting an asset is silent. The validator independently decodes PNG alpha/layout and PCM headers/samples, checks signal-aware loop seams and waveform endpoints, and rejects remote URLs or gameplay scripts.

## Repository layout

```text
assets-src/
  cars/                          Untouched vehicle masters + source attribution
  tracks/                        Original procedural environment masters
  race/                          Original procedural race-hardware masters
  vfx/                           Original full-resolution PNG visual masters
  audio/                         Original 48 kHz / 24-bit stereo WAV masters
index.html                       Vehicle showroom
track.html                       Coastal environment inspector
race.html                        Race hardware + broadcast-presentation inspector
effects.html                     VFX flipbook + isolated audio inspector
src/
  main.js / style.css            Vehicle viewer and responsive showroom
  track.js / track.css           Environment viewer, map, LOD and camera UI
  race.js / race.css             Race hardware, state, HUD, timing and package UI
  effects.js / effects.css       Media playback, UV, camera and gesture-gated audio UI
public/
  assets/
    catalog.json                 Vehicle + track + presentation + media package index
    cars/
      lods/                      Vehicle LOD0–LOD3 GLBs
      collisions/                Vehicle convex collision GLBs
      rigs/                      Wheel/dimension/package JSON records
    tracks/
      azurline-circuit.json      Layout, grid, checkpoints, sectors and package data
      lods/                      Track LOD0–LOD3 GLBs
      collisions/                Road, terrain and barrier collision GLB
    race/
      race-presentation.json     Hardware, graphics, controls and demo fixtures
      lods/                      Race-hardware LOD0–LOD3 GLBs
      collisions/                Structural collision GLBs
      graphics/                  Seven racing flags + SVG icon sprite
    vfx/
      flipbooks/                 Runtime RGBA WebP atlases and sprites
      thumbnails/                Visual-effect catalogue thumbnails
    audio/
      runtime/                   32 kHz / 16-bit stereo PCM WAV runtimes
      waveforms/                 Standalone stereo waveform SVGs
    media/
      vfx-audio.json             Reusable visual/audio manifest and licenses
    previews/                    Vehicle renders + illustrated package posters
    draco/                       Local Draco decoder for compatible assets
scripts/
  build-car-assets.js            Vehicle master → runtime pipeline
  build-coastal-track.js         Original coastal master + runtime generator
  build-race-presentation.js     Original race hardware + graphics generator
  build-vfx-audio.js             Original flipbook/sprite + PCM audio generator
  validate-assets.js             Vehicle geometry, LOD, collision and rig validation
  validate-track-assets.js       Track glTF, layout and package validation
  validate-race-assets.js        Race glTF, controls, graphics and fixture validation
  validate-vfx-audio.js          Independent media format/signal/metadata validation
  embed_attribution.py           Update vehicle-master credit metadata
tests/
  catalog.test.js                Vehicle collection/package checks
  track.test.js                  Coastal environment/package checks
  race.test.js                   Race presentation/package checks
  effects.test.js                VFX/audio package and inspector checks
LICENSES.md                      Full attribution and modification record
```

## Using the assets later

- **Vehicle conventions are baked.** Every vehicle LOD uses metres, Y-up, +Z-forward, horizontal centering, and ground-zero placement. The showroom does not rescale or rotate these assets again.
- **LOD selection is explicit.** Manifests map levels `0`–`3` to local GLB paths and record exact triangle counts and byte sizes. A future game can choose them by camera distance or platform budget.
- **Vehicle collision is a starting point.** Single convex hulls support basic arcade experiments, not final vehicle physics. Suspension, chassis shape, tire behavior, and handling still need validation in the driving prototype.
- **Wheel metadata is reusable.** Rig JSON provides `FL`, `FR`, `RL`, and `RR` records, source node names, positions, radii, widths, and steering/axle labels. It is not an animation or suspension controller.
- **Track race data is reusable.** The manifest provides a closed centerline, start transform, 16 staggered grid slots, 12 ordered checkpoint/respawn transforms, three sectors, road bounds, and camera hints. It does not implement lap validation or race rules.
- **Track collision is separated by role.** The collision GLB contains `collision-road`, `collision-terrain`, `collision-barriers`, and start-structure geometry. Final physics layering and trigger volumes belong to the driving prototype.
- **Race-control nodes are addressable.** Start-light GLBs retain ten lens nodes with zero-based column/row metadata. Marshal panels retain separate base and LED `flag-display` roles. Clone their materials per runtime instance before applying state, as the inspector does.
- **Presentation fixtures are replaceable data.** The race manifest's event, standings, telemetry, and six states demonstrate schema and layout only. Replace them with validated runtime data in a future game; do not treat them as race-rule implementations.
- **Race graphics stay local and reusable.** Standalone flag SVGs can be used in HUDs, trackside displays, or future UI. The icon sprite uses local symbol IDs and requires no icon-font or network service.
- **Flipbook metadata is authoritative.** Atlases are row-major from the top-left. Apply the manifest's repeat/offset convention, timing, alpha mode, and blend mode rather than treating a whole atlas as one sprite. Runtime WebP files are RGBA; PNG masters remain lossless.
- **Audio runtimes are lightweight PCM.** All browser files are 32 kHz / 16-bit stereo WAVs; all preserved masters are 48 kHz / 24-bit stereo WAVs. Respect exact loop ranges and create/resume audio only after a user gesture. No sound starts automatically.
- **Media inspection is not a simulation.** The inspector renders isolated textures and plays individual sounds. Particle emitters, gameplay triggers, mixing, damage, weapons, and race logic remain outside this asset pack.
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

The Mercedes-Benz, AMG, BMW, and M names/marks belong to their respective owners. Their model licenses permit reuse with attribution, but model copyright licensing does not grant manufacturer endorsement or separate trademark rights. Azurline Circuit, Velocity Race Control, and the Velocity Media Lab VFX/audio are original fictional CC0 assets. This is an independent asset collection.
