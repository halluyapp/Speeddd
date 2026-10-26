# Velocity — Asset Library

A local, reusable asset foundation containing **11 detailed vehicles**, two original environments—**Azurline Circuit** and **Kestrel Ridge**—the original **Race Control** presentation kit, original procedural **VFX and synthesized audio**, the original **Combat Kit** of vehicular weapon/projectile models, the original **Social UI kit**, and the original **Driver Kit** of animated fictional characters. Vehicles include untouched masters, four runtime LODs, convex collision meshes, and wheel-rig metadata. Each environment includes four purpose-built LODs, drive-surface/terrain/barrier collision, and race-layout metadata. Race Control adds modular hardware, addressable light/display nodes, vector flags, and broadcast presentation fixtures. Media Lab adds eight real flipbook/sprite packages and eleven original sounds. Combat Lab adds five models with mounting, articulation and muzzle-socket records. Social Lab adds eight vector emblems, a 24-symbol sprite, four checked palettes, and ten fictional players across three static fixtures. Driver Lab adds three rigid-rigged helmeted drivers, twelve embedded clips, four cinematic camera fixtures, and capsule proxies. The pages are **asset inspectors only**—there are no driving, racing, AI, physics, live-timing, multiplayer, firing, damage, fire-control, combat gameplay, live networking, locomotion, seat-constraint, or cinematic gameplay systems.

## Run the inspectors

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. A local HTTP server is required; do not open the HTML files through `file://`.

- `index.html` — vehicle collection and paint showroom
- `track.html` — Azurline Circuit + Kestrel Ridge environment inspector
- `race.html` — Race Control hardware and broadcast-presentation inspector
- `effects.html` — VFX flipbook, blend/camera and isolated audio inspector
- `combat.html` — weapon/projectile geometry, mounting, socket and articulation inspector
- `social.html` — emblems, palettes, icon sprite and fictional social-presentation inspector
- `drivers.html` — animated rigid-rig, cinematic fixture, LOD and capsule inspector

```bash
npm run build            # production multi-page site in dist/
npm run preview          # serve the production build
npm test                 # all vehicle, environment, presentation, media, combat, social and driver checks
npm run validate:assets  # all geometry, metadata, media, combat, social and driver checks
npm run validate:cars    # vehicle checks only
npm run validate:track   # both environment geometry, layout and license checks
npm run validate:race    # race-presentation checks only
npm run validate:effects # visual/audio format, signal and metadata checks
npm run validate:combat  # combat glTF, rig, socket and package checks
npm run validate:social  # vector safety, contrast, sprite and fixture checks
npm run validate:drivers # driver glTF, rig, clip, cinematic and package checks
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

## Rebuild the environment packages

```bash
npm run build:track   # Azurline Circuit only
npm run build:ridge   # Kestrel Ridge only
npm run build:tracks  # both environments
npm run validate:track
```

`scripts/build-coastal-track.js` and `scripts/build-kestrel-ridge.js` deterministically generate their original masters and all derivatives. No third-party environment geometry is used; both environments are **CC0 1.0**. Each generator preserves sibling catalogue entries and writes a separate license record. Azurline outputs include:

- `assets-src/tracks/azurline-circuit.glb` — full-detail procedural master
- `public/assets/tracks/lods/azurline-circuit-lod0.glb` through `-lod3.glb`
- `public/assets/tracks/collisions/azurline-circuit-collision.glb`
- `public/assets/tracks/azurline-circuit.json` — reusable layout, grid, checkpoint, sector, camera, and package manifest
- `public/assets/previews/azurline-circuit.webp` — instant illustrated circuit-map poster
- `public/assets/tracks/azurline-circuit-LICENSE.txt` — CC0 provenance record

Kestrel outputs include:

- `assets-src/tracks/kestrel-ridge.glb` — preserved full-detail alpine master
- `public/assets/tracks/lods/kestrel-ridge-lod0.glb` through `-lod3.glb`
- `public/assets/tracks/collisions/kestrel-ridge-collision.glb`
- `public/assets/tracks/kestrel-ridge.json` — layout, 18 checkpoints, technical sections, gallery and package records
- `public/assets/previews/kestrel-ridge.webp` and `public/assets/tracks/kestrel-ridge-LICENSE.txt`

Each environment's four LODs are purpose-built from the same centerline rather than aggressively simplifying the road. They preserve the closed driving layout while reducing terrain, scenery, vegetation, and decorative detail.

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

## Rebuild the Combat Kit

```bash
npm run build:combat
npm run validate:combat
```

`scripts/build-combat-assets.js` deterministically generates five original models from procedural geometry. No third-party models, real-world weapon blueprints, network assets or game IP are used. All geometry, thumbnails, poster and metadata are **CC0 1.0**. Outputs include:

- `assets-src/combat/<asset-id>.glb` — five preserved full-detail masters
- `public/assets/combat/lods/<asset-id>-lod0.glb` through `-lod3.glb` — 20 purpose-built Meshopt runtime LODs
- `public/assets/combat/collisions/<asset-id>-collision.glb` — five simple collision proxies
- `public/assets/combat/thumbnails/` — model inventory thumbnails
- `public/assets/combat/combat.json` — bounds, mounting, articulation, muzzle and package records
- `public/assets/previews/combat-kit.webp` — instant illustrated Combat Lab poster

The four turrets retain named `MountSocket`, `YawPivot` and `PitchPivot` nodes plus local-space muzzle sockets. The rotary cannon also retains `SpinPivot`; the micro-missile retains a centered projectile root and guidance socket. Rebuilding changes only generated combat derivatives and the combat catalogue entry.

## Rebuild the Social UI kit

```bash
npm run build:social
npm run validate:social
```

`scripts/build-social-assets.js` deterministically generates eight original abstract emblems, 24 interface symbols, four palettes, ten explicitly fictional players, and three static presentation fixtures. No third-party icons, remote avatars, real player records, network services, or game assets are used. The generated vectors, poster, records, and package metadata are **CC0 1.0**. Outputs include:

- `assets-src/social/emblems/<emblem-id>.svg` — eight readable vector masters with titles, descriptions and CC0 metadata
- `public/assets/social/emblems/<emblem-id>.svg` — compact 128 × 128 runtime emblems
- `assets-src/social/icons.svg` — readable 24-symbol sprite master
- `public/assets/social/icons.svg` — compact reusable 24 × 24 runtime sprite with local symbol IDs
- `public/assets/social/social.json` — palettes, UI tokens, players, fixtures, and package paths
- `public/assets/social/LICENSE.txt` — CC0 dedication and asset-source record
- `public/assets/previews/social-lobby.webp` — instant illustrated Social Lab poster

The independent validator computes both foreground/background contrast pairs for every palette; all eight pairs exceed 4.5:1. `party`, `lobby`, and `ready` are replaceable JSON fixtures linked to `azurline-circuit` and its existing local preview. Rebuilding changes only generated social derivatives and the social catalogue entry.

## Rebuild the Driver Kit

```bash
npm run build:drivers
npm run validate:drivers
```

`scripts/build-driver-assets.js` deterministically generates three original fictional helmeted drivers, their named rigid-joint hierarchies, twelve embedded animation clips, four cinematic camera fixtures, thumbnails, poster, and package metadata. No third-party characters, real-world likenesses, motion captures, trademarks, network assets, or game assets are used. All generated character assets are **CC0 1.0**. Outputs include:

- `assets-src/drivers/<driver-id>.glb` — three preserved full-detail animation masters
- `public/assets/drivers/lods/<driver-id>-lod0.glb` through `-lod3.glb` — 12 purpose-built Meshopt runtime LODs, each retaining all four clips
- `public/assets/drivers/collisions/<driver-id>-capsule.glb` — three 112-triangle capsule proxies
- `public/assets/drivers/thumbnails/` — driver inventory thumbnails
- `public/assets/drivers/drivers.json` — bounds, rig joints, clips, capsules, LODs, and cinematic fixtures
- `public/assets/drivers/LICENSE.txt` — CC0 provenance record
- `public/assets/previews/driver-kit.webp` — instant illustrated Driver Lab poster

The independent validator runs Khronos validation on every master, runtime LOD, and capsule; checks actual exported node-instance triangle counts; verifies all 17 joints and 18 channels per clip; measures animation duration from GLB timing accessors; and validates fixture references, local downloads, and presentation-only scope. Rebuilding changes only generated driver derivatives and the driver catalogue entry.

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

## Kestrel Ridge package

| Metric | Value |
|---|---:|
| Closed lap | 3,193.6 m |
| Road / shoulder width | 12 m / 2 m |
| Elevation change | 101.9 m |
| Grid / checkpoints / sectors | 16 / 18 / 3 |
| LOD0–LOD3 triangles | 153,482 / 95,704 / 48,342 / 27,402 |
| LOD0–LOD3 sizes | 1.1 / 0.7 / 0.4 / 0.3 MB |
| Basic collision | 11,224 triangles |
| License | CC0 1.0 |

The alpine environment includes banked technical esses, a granite hairpin, amber/ivory curbs and dashed markings, guardrails, tire barriers, an open-sided avalanche gallery with 5.11 m clearance, a timber pit lodge, viewing terrace, irregular ridged peaks, residual snow, spruce/fir clusters, granite rocks, and alpine scrub. Three named technical-section records describe the Ridge Esses, Granite Hairpin, and Gallery Run; they do not implement drift detection or scoring.

Open `track.html?track=kestrel-ridge` for its direct poster-first inspector view. The shared Track Lab switches both environments with isolated per-track LOD caches, dynamic maps/stats/cameras/downloads, and a dedicated gallery camera. No driving, drift scoring, lap validation, AI, or race rules are included.

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

## Combat Kit package

| Model | LOD0–LOD3 triangles | Collision | Reusable sockets |
|---|---|---:|---|
| R-6 Rotary Cannon | 13,180 / 5,944 / 2,496 / 1,704 | 36 | Yaw, pitch, spin, 6 muzzles |
| D-2 Twin Repeater | 18,208 / 6,592 / 2,448 / 1,408 | 36 | Yaw, pitch, 2 muzzles |
| H-6 Missile Pod | 11,500 / 5,348 / 2,388 / 1,636 | 36 | Yaw, pitch, 6 cells |
| A-1 Pulse Projector | 11,740 / 4,628 / 1,788 / 1,084 | 36 | Yaw, pitch, 1 output |
| M-6 Micro Missile | 2,256 / 1,080 / 608 / 384 | 56 | Centered root, guidance socket |

All assets use metres, Y-up and +Z-forward. Turret origins are roof-mount ground zero; the projectile origin is its geometric bounds center. Yaw applies around parent Y. Positive manifest pitch raises the muzzle and therefore applies as **negative X rotation** in Three.js. Muzzle positions and directions are local to `PitchPivot`, except rotary muzzles, which are local to `SpinPivot`; use the parent world matrix when attaching future visual effects.

The `combat.html` inspector loads actual Meshopt GLBs and includes all four LODs, four cameras, automatic orbit, socket markers, wireframe, articulation sliders, model/collision downloads and complete manifest access. Sliders demonstrate transforms only. No firing, ammunition, targeting, ballistics, damage, health, AI, animation clips or combat rules are included. Collision GLBs are simple visual-proxy starting points, not a physics implementation.

## Social UI package

The eight emblems are **Vector, Nova, Tide, Echo, Apex, Flux, Orbit, and Hex**. Each is a standalone local SVG with a compact runtime and readable source master. The icon sprite contains `players`, `party`, `invite`, `chat`, `mic`, `mic-off`, `ready`, `not-ready`, `host`, `ping`, `desktop`, `controller`, `deck`, `globe`, `lock`, `check`, `close`, `copy`, `settings`, `leave`, `download`, `shield`, `link`, and `calendar`.

| Palette | Primary / on-primary | Ratio | Secondary / on-secondary | Ratio |
|---|---|---:|---|---:|
| Velocity Lime | `#d7ff3f` / `#111608` | 15.99:1 | `#293616` / `#eff8df` | 11.73:1 |
| Atlantic Cyan | `#66e7ed` / `#081416` | 12.67:1 | `#15363c` / `#e5fbfc` | 12.02:1 |
| Marshal Orange | `#ffb13b` / `#1a1004` | 10.36:1 | `#3c2610` / `#fff1dc` | 12.78:1 |
| Night Violet | `#c5a3ff` / `#160d24` | 9.00:1 | `#2e2144` / `#f2eaff` | 12.69:1 |

The ten demo players are fictional; their tags, host/member roles, platforms, ping, presence, voice, and ready values are presentation records, not live telemetry. The fixtures demonstrate a four-person party with two empty visual slots, an eight-player two-team lobby, and an eight-player all-ready presentation. `DEMO-V84` is deliberately not a joinable room code.

The `social.html` inspector supports fixture selection, player inspection, palette-only accent previews, all 24 icons, and downloads for emblems, sprite, manifest, and CC0 record. Selecting a player or palette does not mutate the fixtures. There is no networking, WebSocket/WebRTC transport, server, authentication, matchmaking, invitation action, chat input/transport, voice, presence service, lobby rule, or multiplayer gameplay.

## Driver Kit package

| Fictional driver | Height | LOD0–LOD3 triangles | Capsule |
|---|---:|---|---:|
| V84 Vector — Circuit / lead | 1.943 m | 8,340 / 3,804 / 1,554 / 1,018 | 112 triangles |
| N09 Nova — Endurance / night | 2.010 m | 8,340 / 3,804 / 1,554 / 1,018 | 112 triangles |
| A17 Apex — Ridge / attack | 1.894 m | 8,340 / 3,804 / 1,554 / 1,018 | 112 triangles |

Every master and runtime LOD contains `DriverRoot`, 17 named rigid joints, and four clips: **Idle** (4 s loop), **Seated** (2 s loop), **Celebrate** (2.4 s one-shot), and **Signal** (2 s one-shot). Each clip has 18 channels: quaternion tracks for all 17 joints plus a Pelvis translation track. Geometry is attached to rigid nodes; there is no skinned deformation or motion-capture source.

| Cinematic fixture | Clip | Environment reference | Presentation |
|---|---|---|---|
| Grid Ready | Idle | Azurline Circuit | Full-body grid portrait |
| Cockpit Check | Seated | Kestrel Ridge | Side-profile seated pose |
| Podium Celebration | Celebrate | Azurline Circuit | Raised-arm one-shot |
| Marshal Signal | Signal | Kestrel Ridge | Front three-quarter signal |

The environment IDs are reusable composition references only; Driver Lab renders an isolated local stage and does not load or modify either track. Fixture cameras are data, not cinematic gameplay or movie rendering. Seated Pelvis offsets are clip poses, not vehicle-seat constraints.

The `drivers.html` inspector plays the actual embedded GLTF clips with play/pause, restart, scrubbing, speed control, four fixture cameras, four additional inspection views, joint markers, wireframe, automatic orbit, all LODs, and direct GLB/capsule/manifest/license downloads. Query parameters such as `drivers.html?driver=n09&shot=podium-celebration&lod=2&view=fixture` provide direct reproducible views. No locomotion, AI, physics, seat constraints, racing logic, cinematic gameplay, or movie rendering is implemented.

## Repository layout

```text
assets-src/
  cars/                          Untouched vehicle masters + source attribution
  tracks/                        Original procedural environment masters
  race/                          Original procedural race-hardware masters
  vfx/                           Original full-resolution PNG visual masters
  audio/                         Original 48 kHz / 24-bit stereo WAV masters
  combat/                        Original weapon/projectile full-detail GLB masters
  social/                        Original readable emblem and icon SVG masters
  drivers/                       Original full-detail rigid-rig animation masters
index.html                       Vehicle showroom
track.html                       Two-environment inspector
race.html                        Race hardware + broadcast-presentation inspector
effects.html                     VFX flipbook + isolated audio inspector
combat.html                      Combat geometry + isolated articulation inspector
social.html                      Social vector + fictional fixture inspector
drivers.html                     Animated driver + cinematic fixture inspector
src/
  main.js / style.css            Vehicle viewer and responsive showroom
  track.js / track.css           Environment viewer, map, LOD and camera UI
  race.js / race.css             Race hardware, state, HUD, timing and package UI
  effects.js / effects.css       Media playback, UV, camera and gesture-gated audio UI
  combat.js / combat.css         Combat model, socket, rig, LOD and camera UI
  social.js / social.css         Social fixture, player, palette and vector UI
  drivers.js / drivers.css       Driver clips, scrubber, cameras, rig and package UI
public/
  assets/
    catalog.json                 Vehicle + track + presentation + media + combat + social + driver index
    cars/
      lods/                      Vehicle LOD0–LOD3 GLBs
      collisions/                Vehicle convex collision GLBs
      rigs/                      Wheel/dimension/package JSON records
    tracks/
      azurline-circuit.json      Coastal layout, grid, checkpoints and package data
      kestrel-ridge.json         Alpine layout, technical sections and gallery data
      *-LICENSE.txt              Separate CC0 records for each environment
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
    combat/
      combat.json                Model bounds, mounts, pivots, muzzles and packages
      lods/                      Combat-model LOD0–LOD3 GLBs
      collisions/                Simple weapon/projectile collision proxies
      thumbnails/                Model inventory thumbnails
    social/
      social.json                Emblems, sprite, palettes, tokens and static fixtures
      emblems/                   Eight compact runtime emblem SVGs
      icons.svg                  Local 24-symbol interface sprite
      LICENSE.txt                CC0 dedication and source-separation notice
    drivers/
      drivers.json               Rigs, clips, capsules, LODs and cinematic fixtures
      lods/                      Animated driver LOD0–LOD3 GLBs
      collisions/                Three simple capsule proxy GLBs
      thumbnails/                Driver inventory thumbnails
      LICENSE.txt                CC0 dedication and original-character record
    previews/                    Vehicle renders + illustrated package posters
    draco/                       Local Draco decoder for compatible assets
scripts/
  build-car-assets.js            Vehicle master → runtime pipeline
  build-coastal-track.js         Original coastal master + runtime generator
  build-kestrel-ridge.js         Original alpine master + runtime generator
  build-race-presentation.js     Original race hardware + graphics generator
  build-vfx-audio.js             Original flipbook/sprite + PCM audio generator
  build-combat-assets.js         Original combat models, rigs and runtime generator
  build-social-assets.js         Original emblems, sprite, palettes and fixture generator
  build-driver-assets.js         Original drivers, rigid rigs, clips and fixture generator
  validate-assets.js             Vehicle geometry, LOD, collision and rig validation
  validate-track-assets.js       Both environments' glTF, layout and license validation
  validate-race-assets.js        Race glTF, controls, graphics and fixture validation
  validate-vfx-audio.js          Independent media format/signal/metadata validation
  validate-combat-assets.js      Combat glTF, hierarchy, socket and package validation
  validate-social-assets.js      Independent vector, contrast, sprite and fixture validation
  validate-driver-assets.js      Khronos, rig, clip, LOD, cinematic and package validation
  embed_attribution.py           Update vehicle-master credit metadata
tests/
  catalog.test.js                Vehicle collection/package checks
  track.test.js                  Both environment/package and selector checks
  race.test.js                   Race presentation/package checks
  effects.test.js                VFX/audio package and inspector checks
  combat.test.js                 Combat model/package and inspector checks
  social.test.js                 Social vector/package and inspector checks
  drivers.test.js                Driver animation/package and inspector checks
LICENSES.md                      Full attribution and modification record
```

## Using the assets later

- **Vehicle conventions are baked.** Every vehicle LOD uses metres, Y-up, +Z-forward, horizontal centering, and ground-zero placement. The showroom does not rescale or rotate these assets again.
- **LOD selection is explicit.** Manifests map levels `0`–`3` to local GLB paths and record exact triangle counts and byte sizes. A future game can choose them by camera distance or platform budget.
- **Vehicle collision is a starting point.** Single convex hulls support basic arcade experiments, not final vehicle physics. Suspension, chassis shape, tire behavior, and handling still need validation in the driving prototype.
- **Wheel metadata is reusable.** Rig JSON provides `FL`, `FR`, `RL`, and `RR` records, source node names, positions, radii, widths, and steering/axle labels. It is not an animation or suspension controller.
- **Track race data is reusable.** Each environment manifest provides a closed centerline, start transform, 16 staggered grid slots, ordered checkpoint/respawn transforms, three sectors, road bounds, and camera hints. Azurline has 12 checkpoints; Kestrel has 18 plus technical-section and gallery records. These files do not implement lap validation, drift scoring, or race rules.
- **Track collision is separated by role.** The collision GLB contains `collision-road`, `collision-terrain`, `collision-barriers`, and start-structure geometry. Final physics layering and trigger volumes belong to the driving prototype.
- **Race-control nodes are addressable.** Start-light GLBs retain ten lens nodes with zero-based column/row metadata. Marshal panels retain separate base and LED `flag-display` roles. Clone their materials per runtime instance before applying state, as the inspector does.
- **Presentation fixtures are replaceable data.** The race manifest's event, standings, telemetry, and six states demonstrate schema and layout only. Replace them with validated runtime data in a future game; do not treat them as race-rule implementations.
- **Race graphics stay local and reusable.** Standalone flag SVGs can be used in HUDs, trackside displays, or future UI. The icon sprite uses local symbol IDs and requires no icon-font or network service.
- **Flipbook metadata is authoritative.** Atlases are row-major from the top-left. Apply the manifest's repeat/offset convention, timing, alpha mode, and blend mode rather than treating a whole atlas as one sprite. Runtime WebP files are RGBA; PNG masters remain lossless.
- **Audio runtimes are lightweight PCM.** All browser files are 32 kHz / 16-bit stereo WAVs; all preserved masters are 48 kHz / 24-bit stereo WAVs. Respect exact loop ranges and create/resume audio only after a user gesture. No sound starts automatically.
- **Media inspection is not a simulation.** The inspector renders isolated textures and plays individual sounds. Particle emitters, gameplay triggers, mixing, damage, weapons, and race logic remain outside this asset pack.
- **Combat mounts and pivots are reusable.** Attach turrets at `MountSocket`, rotate `YawPivot` around Y, and apply positive pitch as negative X rotation to `PitchPivot`. Keep muzzle effects in their recorded parent space; rotary sockets follow `SpinPivot`.
- **Combat metadata contains no weapon balancing.** Models, bounds and socket positions are visual/package data only. Fire rates, ammunition, targeting, recoil, projectile simulation, damage and health must be designed and validated separately if gameplay is approved later.
- **Combat collision is intentionally simple.** The proxy GLBs provide coarse mount/receiver/barrel or projectile shapes for future physics work; they do not implement hit detection, damage or constraints.
- **Social icons inherit `currentColor`.** Reference a symbol with `<svg viewBox="0 0 24 24"><use href="/assets/social/icons.svg#players"></use></svg>` and set the desired CSS color. Keep the sprite local and use only IDs listed in the manifest.
- **Emblem masters remain editable.** Runtime SVGs include their default accent; edit the readable master or its `color` value when creating another treatment. Preserve the 128 × 128 viewBox and do not add remote or executable content.
- **Palette preview is not team assignment.** Social Lab changes only the inspector's accent custom property. A future UI should apply the manifest's primary/on-primary and secondary/on-secondary pairs together rather than deriving low-contrast text colors.
- **Social fixtures are replaceable data, not transport.** Player, room, ping, presence, voice and ready fields demonstrate layout only. A future approved networking layer must supply validated runtime state; these files must not be treated as lobby rules or presence services.
- **Driver clips are embedded in every LOD.** Load `gltf.animations` by the manifest names and play them with an animation mixer; do not infer motion from the poster. Each clip targets the preserved named nodes directly, with no skin retargeting step.
- **Driver rigs are rigid, not skinned.** `DriverRoot` contains 17 articulated joints and rigid mesh children. Preserve the hierarchy when cloning or editing. The +Z-forward, Y-up, metre and ground-zero conventions match the other character-placement assets.
- **Cinematic fixtures are reusable data.** Camera position/target/FOV, clip name, duration, loop state, and environment reference are recorded in `drivers.json`. They are composition hints, not camera splines, gameplay cinematics, seat constraints, or movie-renderer outputs.
- **Driver capsules are simple proxies.** The 112-triangle GLBs are coarse presentation/collision starting shapes only. Character physics, locomotion, vehicle seating, IK, and constraint behavior remain separate future systems.
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

The Mercedes-Benz, AMG, BMW, and M names/marks belong to their respective owners. Their model licenses permit reuse with attribution, but model copyright licensing does not grant manufacturer endorsement or separate trademark rights. Azurline Circuit, Kestrel Ridge, Velocity Race Control, Velocity Media Lab VFX/audio, Velocity Combat Kit, Velocity Social UI, and Velocity Driver Kit are original fictional CC0 assets. This is an independent asset collection.
