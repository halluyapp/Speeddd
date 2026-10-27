import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// Three's browser exporter uses FileReader for GLB assembly; provide the tiny Node equivalent.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
}

const ROOT = process.cwd();
const TRACK_ID = 'kestrel-ridge';
const TRACK_NAME = 'Kestrel Ridge';
const MASTER_DIR = path.join(ROOT, 'assets-src/tracks');
const OUTPUT_DIR = path.join(ROOT, 'public/assets/tracks');
const PREVIEW_PATH = path.join(ROOT, 'public/assets/previews/kestrel-ridge.webp');
const TARGET_LENGTH = 3200;
const ROAD_WIDTH = 12;
const GRID_COUNT = 16;
const CHECKPOINT_COUNT = 18;
const UP = new THREE.Vector3(0, 1, 0);

await fs.mkdir(MASTER_DIR, { recursive: true });
await fs.mkdir(path.join(OUTPUT_DIR, 'lods'), { recursive: true });
await fs.mkdir(path.join(OUTPUT_DIR, 'collisions'), { recursive: true });
await fs.mkdir(path.dirname(PREVIEW_PATH), { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

function rngFactory(seed = 0x5f3759df) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = THREE.MathUtils.smoothstep;

function round(value, precision = 3) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function vecArray(vector) {
  return [round(vector.x), round(vector.y), round(vector.z)];
}

function material(name, color, options = {}) {
  const value = new THREE.MeshStandardMaterial({
    name,
    color,
    roughness: options.roughness ?? 0.8,
    metalness: options.metalness ?? 0,
    vertexColors: options.vertexColors ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    side: options.side ?? THREE.FrontSide,
  });
  if (options.emissive) {
    value.emissive.set(options.emissive);
    value.emissiveIntensity = options.emissiveIntensity ?? 1;
  }
  return value;
}

const MAT = {
  asphalt: material('Asphalt — cold aggregate variation', '#ffffff', { vertexColors: true, roughness: 0.95 }),
  shoulder: material('Dark gravel shoulders', '#505454', { roughness: 0.98 }),
  white: material('Track markings — alpine ivory', '#ececdf', { roughness: 0.76 }),
  amber: material('Kestrel amber', '#ffb13b', { roughness: 0.62, emissive: '#6b3d0c', emissiveIntensity: 0.24 }),
  curbWhite: material('Weathered curb ivory', '#d8d8ca', { roughness: 0.84 }),
  dark: material('Powder-coated graphite', '#20282c', { metalness: 0.55, roughness: 0.42 }),
  metal: material('Galvanized guardrail', '#9ba7a8', { metalness: 0.78, roughness: 0.32 }),
  concrete: material('Cold cast concrete', '#929994', { roughness: 0.97 }),
  terrain: material('Alpine terrain', '#ffffff', { vertexColors: true, roughness: 1 }),
  trunk: material('Pine bark', '#574a3c', { roughness: 1 }),
  leaf: material('Deep spruce needles', '#29483f', { roughness: 0.96 }),
  leafLight: material('Silver fir needles', '#466355', { roughness: 0.94 }),
  shrub: material('Alpine scrub', '#60715b', { roughness: 1 }),
  rock: material('Weathered granite', '#686e70', { roughness: 0.99 }),
  rockLight: material('Pale fractured granite', '#949a96', { roughness: 0.99 }),
  snow: material('Residual summit snow', '#d8e0dc', { roughness: 0.88 }),
  tire: material('Safety tire rubber', '#16191a', { roughness: 0.95 }),
  glass: material('Lodge glazing', '#8fb6be', { metalness: 0.25, roughness: 0.18, transparent: true, opacity: 0.68 }),
  timber: material('Charred lodge timber', '#3d3730', { roughness: 0.93 }),
  lamp: material('Track lighting', '#fff0c5', { emissive: '#ffe6a0', emissiveIntensity: 1.5, roughness: 0.35 }),
};

class GeometryBatch {
  constructor(scene) {
    this.scene = scene;
    this.batches = new Map();
  }

  add(role, mat, geometry, matrix = new THREE.Matrix4()) {
    const transformed = geometry.clone();
    transformed.applyMatrix4(matrix);
    if (!transformed.getAttribute('normal')) transformed.computeVertexNormals();
    if (!transformed.getAttribute('uv')) {
      transformed.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(transformed.getAttribute('position').count * 2), 2));
    }
    if (mat.vertexColors && !transformed.getAttribute('color')) {
      const colors = new Float32Array(transformed.getAttribute('position').count * 3).fill(1);
      transformed.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    if (!mat.vertexColors && transformed.getAttribute('color')) transformed.deleteAttribute('color');
    const key = `${role}:${mat.uuid}`;
    if (!this.batches.has(key)) this.batches.set(key, { role, mat, geometries: [] });
    this.batches.get(key).geometries.push(transformed);
  }

  box(role, mat, size, position, yaw = 0) {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const matrix = new THREE.Matrix4().compose(
      position,
      new THREE.Quaternion().setFromAxisAngle(UP, yaw),
      new THREE.Vector3(1, 1, 1),
    );
    this.add(role, mat, geometry, matrix);
    geometry.dispose();
  }

  flush() {
    for (const { role, mat, geometries } of this.batches.values()) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) throw new Error(`Could not merge ${role}/${mat.name}`);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${role}__${mat.name.replaceAll(' ', '_')}`;
      mesh.userData.velocityRole = role;
      this.scene.add(mesh);
      geometries.forEach((geometry) => geometry.dispose());
    }
    this.batches.clear();
  }
}

function createLayout() {
  const controls = [
    [-460, 42, 240], [-200, 46, 260], [80, 52, 250], [300, 62, 190],
    [430, 74, 60], [400, 86, -90], [260, 96, -170], [120, 104, -140],
    [80, 110, -40], [170, 116, 40], [30, 122, 120], [-140, 128, 60],
    [-230, 134, -50], [-380, 140, -20], [-480, 132, 100], [-560, 110, 180],
    [-540, 70, 240],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));

  let curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal', 0.5);
  const scale = TARGET_LENGTH / curve.getLength();
  controls.forEach((point) => {
    point.x *= scale;
    point.z *= scale;
  });
  curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal', 0.5);
  const length = curve.getLength();
  const center = new THREE.Box3().setFromPoints(curve.getPoints(300)).getCenter(new THREE.Vector3());
  controls.forEach((point) => {
    point.x -= center.x;
    point.z -= center.z;
  });
  curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal', 0.5);

  const frameAt = (distance) => {
    const wrapped = ((distance % length) + length) % length;
    const u = wrapped / length;
    const point = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    const left = new THREE.Vector3().crossVectors(UP, tangent).normalize();
    const epsilon = 1.5 / length;
    const before = curve.getTangentAt((u - epsilon + 1) % 1).normalize();
    const after = curve.getTangentAt((u + epsilon) % 1).normalize();
    const signedAngle = Math.atan2(before.x * after.z - before.z * after.x, before.x * after.x + before.z * after.z);
    const curvature = signedAngle / 3;
    const bank = clamp(curvature * 0.14, -0.055, 0.055);
    return { point, tangent, left, curvature, bank, distance: wrapped, yaw: Math.atan2(tangent.x, tangent.z) };
  };

  let startDistance = 0;
  let bestCurvature = Infinity;
  for (let distance = 0; distance < length * 0.22; distance += 8) {
    const score = Math.abs(frameAt(distance).curvature);
    if (score < bestCurvature) {
      bestCurvature = score;
      startDistance = distance;
    }
  }

  return { curve, length, frameAt, startDistance, controlPoints: controls };
}

const layout = createLayout();

function framePoint(frame, offset = 0, height = 0) {
  const point = frame.point.clone().addScaledVector(frame.left, offset);
  point.y += -offset * frame.bank + height;
  return point;
}

function terrainHeight(x, z, roadSamples) {
  let nearest = roadSamples[0];
  let nearestDistance = Infinity;
  for (const frame of roadSamples) {
    const dx = x - frame.point.x;
    const dz = z - frame.point.z;
    const distance = dx * dx + dz * dz;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = frame;
    }
  }
  const distance = Math.sqrt(nearestDistance);
  const noise = Math.sin(x * 0.017) * 3.4 + Math.cos(z * 0.014) * 2.8 + Math.sin((x - z) * 0.007) * 5.6;
  const summit = Math.exp(-((x - 260) ** 2 + (z + 180) ** 2) / 260000) * 54;
  const alpineBase = 39 + noise + Math.sin(x * 0.003) * 17 + Math.cos(z * 0.004) * 13 + summit;
  if (distance < 38) return nearest.point.y - 0.42 - distance * 0.016;
  const blend = smoothstep(distance, 38, 138);
  return lerp(nearest.point.y - 1.1, alpineBase + nearest.point.y * 0.24, blend);
}

function ribbon(frames, offsetA, offsetB, height, colorFunction = null) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    for (const offset of [offsetA, offsetB]) {
      const point = framePoint(frame, offset, height + (Math.abs(offset) < ROAD_WIDTH / 2 ? 0.025 * (1 - Math.abs(offset) / (ROAD_WIDTH / 2)) : 0));
      positions.push(point.x, point.y, point.z);
      uvs.push(offset === offsetA ? 0 : 1, index * 0.25);
      if (colorFunction) {
        const color = colorFunction(frame, offset, index);
        colors.push(color.r, color.g, color.b);
      }
    }
    if (index < frames.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colorFunction) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createTerrain(detail, roadSamples) {
  const segments = detail.terrainSegments;
  const size = detail.terrainSize;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const color = new THREE.Color();
  const low = new THREE.Color('#3d5548');
  const high = new THREE.Color('#7b7968');
  for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
    for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
      const x = (xIndex / segments - 0.5) * size;
      const z = (zIndex / segments - 0.5) * size;
      const y = terrainHeight(x, z, roadSamples);
      positions.push(x, y, z);
      uvs.push(xIndex / segments, zIndex / segments);
      const rockFactor = clamp((Math.sin(x * 0.029) + Math.cos(z * 0.025)) * 0.2 + 0.34, 0, 0.8);
      const snowLine = 126 + Math.sin(x * 0.019) * 9 + Math.cos(z * 0.017) * 7;
      if (y > snowLine) color.set('#ccd5d0');
      else if (rockFactor > 0.57 || y > 105) color.set('#707775');
      else color.copy(low).lerp(high, clamp((y - 38) / 105, 0, 0.72));
      const variation = 0.9 + 0.1 * Math.sin(x * 0.11 + z * 0.08);
      colors.push(color.r * variation, color.g * variation, color.b * variation);
    }
  }
  for (let zIndex = 0; zIndex < segments; zIndex += 1) {
    for (let xIndex = 0; xIndex < segments; xIndex += 1) {
      const a = zIndex * (segments + 1) + xIndex;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addPine(batch, position, height, yaw, snowy = false) {
  const trunk = new THREE.CylinderGeometry(0.14, 0.32, height * 0.58, 7);
  const trunkMatrix = new THREE.Matrix4().compose(
    position.clone().add(new THREE.Vector3(0, height * 0.29, 0)),
    new THREE.Quaternion().setFromAxisAngle(UP, yaw),
    new THREE.Vector3(1, 1, 1),
  );
  batch.add('vegetation', MAT.trunk, trunk, trunkMatrix);
  trunk.dispose();
  for (let layer = 0; layer < 3; layer += 1) {
    const radius = height * (0.235 - layer * 0.045);
    const coneHeight = height * (0.5 - layer * 0.055);
    const cone = new THREE.ConeGeometry(radius, coneHeight, 8, 1);
    const matrix = new THREE.Matrix4().compose(
      position.clone().add(new THREE.Vector3(0, height * (0.43 + layer * 0.19), 0)),
      new THREE.Quaternion().setFromAxisAngle(UP, yaw + layer * 0.35),
      new THREE.Vector3(1, 1, 1),
    );
    batch.add('vegetation', layer === 2 ? MAT.leafLight : MAT.leaf, cone, matrix);
    cone.dispose();
  }
  if (snowy) {
    const cap = new THREE.ConeGeometry(height * 0.09, height * 0.18, 8);
    batch.add('vegetation-snow', MAT.snow, cap, new THREE.Matrix4().makeTranslation(position.x, position.y + height * 0.91, position.z));
    cap.dispose();
  }
}

function createPeakGeometry(radius, height, seed) {
  const segments = 9;
  const rings = [0, 0.22, 0.48, 0.72];
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let ring = 0; ring < rings.length; ring += 1) {
    const t = rings[ring];
    const ringRadius = radius * (1 - t) ** 0.78;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const jag = 1 + Math.sin(segment * 2.31 + ring * 1.77 + seed) * 0.14;
      const x = Math.cos(angle) * ringRadius * jag;
      const z = Math.sin(angle) * ringRadius * jag;
      const y = height * t + (ring ? Math.sin(segment * 1.83 + seed) * height * 0.035 : 0);
      positions.push(x, y, z); uvs.push(segment / segments, t);
      if (ring < rings.length - 1) {
        const a = ring * segments + segment;
        const next = ring * segments + (segment + 1) % segments;
        const upper = a + segments;
        const upperNext = next + segments;
        indices.push(a, upper, next, next, upper, upperNext);
      } else {
        const a = ring * segments + segment;
        const next = ring * segments + (segment + 1) % segments;
        const top = rings.length * segments;
        indices.push(a, top, next);
      }
    }
  }
  positions.push(Math.sin(seed) * radius * 0.07, height, Math.cos(seed) * radius * 0.07); uvs.push(0.5, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function addMountainBackdrop(batch, detail, roadSamples) {
  for (let index = 0; index < detail.peaks; index += 1) {
    const angle = index / detail.peaks * Math.PI * 2 + 0.18;
    const radial = 950 + Math.sin(index * 2.17) * 65;
    const x = Math.cos(angle) * radial;
    const z = Math.sin(angle) * radial;
    const base = terrainHeight(x, z, roadSamples) - 18;
    const height = 180 + (Math.sin(index * 1.71) * 0.5 + 0.5) * 170;
    const width = 115 + (Math.cos(index * 1.13) * 0.5 + 0.5) * 85;
    const peak = createPeakGeometry(width, height, index * 1.37);
    const matrix = new THREE.Matrix4().makeTranslation(x, base, z);
    batch.add('mountains', index % 3 ? MAT.rock : MAT.rockLight, peak, matrix);
    const capMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, base + height * 0.7, z),
      new THREE.Quaternion(),
      new THREE.Vector3(0.42, 0.3, 0.42),
    );
    batch.add('mountains-snow', MAT.snow, peak, capMatrix);
    peak.dispose();
  }
}

function addTrackStructures(batch, detail, frames) {
  const { frameAt, startDistance, length } = layout;
  const start = frameAt(startDistance);

  // Start/finish checker strip and sixteen staggered grid slots.
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const frame = frameAt(startDistance + row * 0.7 - 0.35);
      batch.box('markings', (row + column) % 2 ? MAT.dark : MAT.white, [0.96, 0.025, 0.68], framePoint(frame, -5.5 + column, 0.055), frame.yaw);
    }
  }
  for (let index = 0; index < GRID_COUNT; index += 1) {
    const frame = frameAt(startDistance - 8 - Math.floor(index / 2) * 7);
    const offset = index % 2 ? 2.4 : -2.4;
    for (const side of [-1, 1]) {
      batch.box('markings', MAT.white, [1.45, 0.025, 0.12], framePoint(frame, offset + side * 1.05, 0.055), frame.yaw);
      batch.box('markings', MAT.white, [0.12, 0.025, 1.45], framePoint(frame, offset + side * 1.8, 0.055), frame.yaw);
    }
  }

  // Amber start gantry.
  for (const side of [-1, 1]) {
    batch.box('structures', MAT.dark, [0.6, 7.4, 0.6], framePoint(start, side * 8.2, 3.7), start.yaw);
    batch.box('structures', MAT.concrete, [1.4, 0.42, 1.4], framePoint(start, side * 8.2, 0.21), start.yaw);
  }
  batch.box('structures', MAT.dark, [17.6, 0.6, 0.6], framePoint(start, 0, 7.15), start.yaw);
  batch.box('structures', MAT.amber, [9.2, 1.25, 0.25], framePoint(start, 0, 7.1), start.yaw);
  for (let stripe = -4; stripe <= 4; stripe += 1) batch.box('structures', MAT.dark, [0.24, 1.27, 0.28], framePoint(start, stripe, 7.1), start.yaw + 0.35);

  if (detail.structures) {
    // Timber pit lodges and a stepped viewing terrace.
    for (let unit = 0; unit < 5; unit += 1) {
      const frame = frameAt(startDistance - 58 + unit * 13);
      batch.box('structures', MAT.timber, [9.2, 4.3, 12], framePoint(frame, -25, 2.15), frame.yaw);
      batch.box('structures', MAT.dark, [10.2, 0.38, 12.8], framePoint(frame, -25, 4.48), frame.yaw);
      batch.box('structures', MAT.glass, [0.12, 2.55, 8.6], framePoint(frame, -20.35, 1.95), frame.yaw);
      batch.box('structures', MAT.amber, [0.16, 0.3, 9], framePoint(frame, -20.25, 3.75), frame.yaw);
      for (let divider = -1; divider <= 1; divider += 1) batch.box('structures', MAT.dark, [0.17, 2.8, 0.12], framePoint(frameAt(startDistance - 58 + unit * 13 + divider * 3), -20.2, 1.95), frame.yaw);
    }
    for (let step = 0; step < 5; step += 1) {
      const frame = frameAt(startDistance + 22);
      batch.box('structures', MAT.concrete, [3.8, 0.5 + step * 0.42, 42], framePoint(frame, 22 + step * 2, 0.28 + step * 0.21), frame.yaw);
      for (let seat = -9; seat <= 9; seat += 1) {
        const seatFrame = frameAt(startDistance + 22 + seat * 2.1);
        batch.box('structures', seat % 3 ? MAT.timber : MAT.amber, [1, 0.4, 0.72], framePoint(seatFrame, 21.8 + step * 2, 0.8 + step * 0.42), frame.yaw);
      }
    }
  }

  // Open-sided avalanche gallery: a distinctive alpine landmark, not a closed tunnel.
  const galleryStart = (startDistance + length * 0.44) % length;
  for (let portal = 0; portal < detail.gallery; portal += 1) {
    const frame = frameAt(galleryStart + portal * 7);
    for (const side of [-1, 1]) {
      batch.box('structures', MAT.concrete, [0.55, 5.4, 0.55], framePoint(frame, side * 7.35, 2.7), frame.yaw);
      batch.box('structures', MAT.amber, [0.12, 1.2, 0.62], framePoint(frame, side * 7.02, 1.25), frame.yaw);
    }
    batch.box('structures', MAT.concrete, [15.7, 0.48, 6.9], framePoint(frame, 0, 5.35), frame.yaw);
    batch.box('structures', MAT.dark, [15.9, 0.18, 0.22], framePoint(frame, 0, 5.63), frame.yaw);
  }

  // Low-profile lighting and reflective corner boards.
  for (let distance = 0; distance < length; distance += detail.lightSpacing) {
    const frame = frameAt(distance);
    if (Math.abs(distance - startDistance) < 42) continue;
    const side = Math.floor(distance / detail.lightSpacing) % 2 ? 1 : -1;
    const base = framePoint(frame, side * 11.2, 0);
    const pole = new THREE.CylinderGeometry(0.07, 0.12, 6.4, 7);
    batch.add('props', MAT.metal, pole, new THREE.Matrix4().makeTranslation(base.x, base.y + 3.2, base.z));
    pole.dispose();
    batch.box('props', MAT.dark, [2.1, 0.11, 0.11], framePoint(frame, side * 10.35, 6.3), frame.yaw);
    batch.box('props', MAT.lamp, [1.25, 0.16, 0.45], framePoint(frame, side * 9.55, 6.15), frame.yaw);
  }
  let boardIndex = 0;
  for (let distance = 0; distance < length; distance += 135) {
    const frame = frameAt(distance);
    if (Math.abs(frame.curvature) < 0.0022) continue;
    const side = frame.curvature > 0 ? -1 : 1;
    for (let marker = 1; marker <= 3; marker += 1) {
      const boardFrame = frameAt(distance - marker * 30);
      batch.box('props', MAT.dark, [1.35, 1.05, 0.15], framePoint(boardFrame, side * 10, 1.25), boardFrame.yaw);
      for (let bar = 0; bar < 4 - marker; bar += 1) batch.box('props', MAT.amber, [0.17, 0.68, 0.17], framePoint(boardFrame, side * 10 + (bar - 0.5) * 0.32, 1.25), boardFrame.yaw);
    }
    boardIndex += 1;
    if (boardIndex > 10) break;
  }
}

function buildScene(detail) {
  const scene = new THREE.Scene();
  scene.name = `${TRACK_NAME} — procedural detail ${detail.name}`;
  scene.userData.velocityTrack = { id: TRACK_ID, detail: detail.name, units: 'metres', upAxis: '+Y' };
  const batch = new GeometryBatch(scene);
  const { frameAt, length, startDistance } = layout;
  const segments = Math.ceil(length / detail.roadStep);
  const frames = Array.from({ length: segments + 1 }, (_, index) => frameAt(index / segments * length));
  const roadSamples = Array.from({ length: 420 }, (_, index) => frameAt(index / 420 * length));
  const asphaltColor = (frame, offset, index) => {
    const value = 0.072 + 0.009 * Math.sin(index * 1.67 + offset) + 0.005 * Math.sin(index * 0.21);
    return new THREE.Color(value * 0.94, value, value * 1.06);
  };
  batch.add('road', MAT.asphalt, ribbon(frames, -ROAD_WIDTH / 2, ROAD_WIDTH / 2, 0, asphaltColor));
  batch.add('road', MAT.shoulder, ribbon(frames, -ROAD_WIDTH / 2 - 2, -ROAD_WIDTH / 2, -0.03));
  batch.add('road', MAT.shoulder, ribbon(frames, ROAD_WIDTH / 2, ROAD_WIDTH / 2 + 2, -0.03));
  batch.add('markings', MAT.white, ribbon(frames, -5.67, -5.52, 0.045));
  batch.add('markings', MAT.white, ribbon(frames, 5.52, 5.67, 0.045));

  for (let index = 0; index < frames.length - 1; index += 1) {
    const frame = frames[index];
    const step = length / segments;
    const curvature = Math.abs(frame.curvature);
    if (Math.floor(frame.distance / 14) % 2 === 0) batch.box('markings', MAT.amber, [0.11, 0.022, step * 1.02], framePoint(frame, 0, 0.052), frame.yaw);
    if (curvature > 0.0021) {
      for (const side of [-1, 1]) batch.box('curbs', Math.floor(frame.distance / 4) % 2 ? MAT.amber : MAT.curbWhite, [0.58, 0.17, step * 1.03], framePoint(frame, side * 6.25, 0.085), frame.yaw);
    }
    const guarded = curvature > 0.0018 || Math.abs(frame.tangent.y) > 0.04;
    if (guarded) {
      for (const side of [-1, 1]) {
        batch.box('barriers', MAT.metal, [0.15, 0.4, step * 1.04], framePoint(frame, side * 8.4, 0.7), frame.yaw);
        if (index % Math.max(1, Math.round(6 / step)) === 0) batch.box('barriers', MAT.dark, [0.14, 1, 0.14], framePoint(frame, side * 8.4, 0.46), frame.yaw);
      }
    }
    if (curvature > 0.0035 && detail.tireBarriers && index % 3 === 0) {
      const side = frame.curvature > 0 ? -1 : 1;
      for (let stack = 0; stack < 3; stack += 1) {
        const tire = new THREE.CylinderGeometry(0.36, 0.36, 0.23, 10);
        const point = framePoint(frame, side * 9.7, 0.13 + stack * 0.23);
        batch.add('barriers', MAT.tire, tire, new THREE.Matrix4().makeTranslation(point.x, point.y, point.z));
        tire.dispose();
      }
    }
  }

  batch.add('terrain', MAT.terrain, createTerrain(detail, roadSamples));
  addMountainBackdrop(batch, detail, roadSamples);
  addTrackStructures(batch, detail, frames);

  const random = rngFactory(0x4be57ae1);
  for (let index = 0; index < detail.pines; index += 1) {
    const distance = random() * length;
    if (Math.abs(distance - startDistance) < 95) continue;
    const frame = frameAt(distance);
    const offset = (index % 2 ? 1 : -1) * (24 + random() * 92);
    const base = framePoint(frame, offset, 0);
    base.y = terrainHeight(base.x, base.z, roadSamples);
    addPine(batch, base, 7.5 + random() * 8.5, random() * Math.PI * 2, base.y > 112 && index % 3 === 0);
  }
  for (let index = 0; index < detail.rocks; index += 1) {
    const frame = frameAt(random() * length);
    const offset = (random() > 0.5 ? 1 : -1) * (19 + random() * 105);
    const point = framePoint(frame, offset, 0);
    point.y = terrainHeight(point.x, point.z, roadSamples);
    const geometry = new THREE.IcosahedronGeometry(1, detail.name === 'LOD0' ? 1 : 0);
    const scale = new THREE.Vector3(2 + random() * 6, 1.8 + random() * 7, 2 + random() * 5);
    const matrix = new THREE.Matrix4().compose(
      point.clone().add(new THREE.Vector3(0, scale.y * 0.28, 0)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(random(), random() * Math.PI, random() * 0.3)),
      scale,
    );
    batch.add('terrain-rocks', index % 3 ? MAT.rock : MAT.rockLight, geometry, matrix);
    geometry.dispose();
  }
  for (let index = 0; index < detail.shrubs; index += 1) {
    const frame = frameAt(random() * length);
    const offset = (random() > 0.5 ? 1 : -1) * (17 + random() * 82);
    const point = framePoint(frame, offset, 0);
    point.y = terrainHeight(point.x, point.z, roadSamples);
    const geometry = new THREE.ConeGeometry(0.65 + random() * 0.8, 1 + random() * 1.4, 5);
    batch.add('vegetation', MAT.shrub, geometry, new THREE.Matrix4().makeTranslation(point.x, point.y + 0.5, point.z));
    geometry.dispose();
  }
  batch.flush();
  return scene;
}

function createCollisionScene() {
  const scene = new THREE.Scene();
  scene.name = `${TRACK_NAME} — basic collision`;
  const batch = new GeometryBatch(scene);
  const { frameAt, length, startDistance } = layout;
  const step = 8;
  const segments = Math.ceil(length / step);
  const frames = Array.from({ length: segments + 1 }, (_, index) => frameAt(index / segments * length));
  const collisionRoad = material('Collision road', '#808080', { roughness: 1 });
  const collisionTerrain = material('Collision terrain', '#707070', { roughness: 1 });
  const collisionBarrier = material('Collision barriers', '#606060', { roughness: 1 });
  const roadSamples = Array.from({ length: 210 }, (_, index) => frameAt(index / 210 * length));
  batch.add('collision-road', collisionRoad, ribbon(frames, -8, 8, -0.02));
  batch.add('collision-terrain', collisionTerrain, createTerrain({ terrainSegments: 38, terrainSize: 2200 }, roadSamples));
  for (let index = 0; index < frames.length - 1; index += 1) {
    const frame = frames[index];
    if (Math.abs(frame.curvature) < 0.0018 && Math.abs(frame.tangent.y) < 0.04) continue;
    for (const side of [-1, 1]) batch.box('collision-barriers', collisionBarrier, [0.34, 1.1, step * 1.04], framePoint(frame, side * 8.4, 0.53), frame.yaw);
  }
  const start = frameAt(startDistance);
  for (const side of [-1, 1]) batch.box('collision-structures', collisionBarrier, [1.1, 7.4, 1.1], framePoint(start, side * 8.2, 3.7), start.yaw);
  const galleryStart = (startDistance + length * 0.44) % length;
  for (let portal = 0; portal < 4; portal += 1) {
    const frame = frameAt(galleryStart + portal * 14);
    for (const side of [-1, 1]) batch.box('collision-structures', collisionBarrier, [0.8, 5.4, 0.8], framePoint(frame, side * 7.35, 2.7), frame.yaw);
  }
  batch.flush();
  scene.traverse((object) => { if (object.isMesh) object.userData.velocityRole = object.name.split('__')[0]; });
  return scene;
}

async function exportGlb(scene) {
  const exporter = new GLTFExporter();
  const arrayBuffer = await exporter.parseAsync(scene, { binary: true, onlyVisible: true, trs: true });
  return Buffer.from(arrayBuffer);
}

function withAssetMetadata(glb, lod = null, role = 'visual') {
  const jsonLength = glb.readUInt32LE(12);
  const document = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  document.asset.generator = 'Velocity original procedural alpine-track pipeline';
  document.asset.copyright = `${TRACK_NAME}; Velocity original procedural asset; CC0 1.0 Universal`;
  document.asset.extras = {
    ...(document.asset.extras || {}),
    velocityTrack: {
      id: TRACK_ID,
      name: TRACK_NAME,
      license: 'CC0-1.0',
      source: 'Original procedural geometry generated by this repository',
      units: 'metres',
      upAxis: '+Y',
      forwardAxis: '+Z',
      role,
      lod,
    },
  };
  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const remaining = glb.subarray(20 + jsonLength);
  const output = Buffer.alloc(20 + padded.length + remaining.length);
  glb.copy(output, 0, 0, 20);
  output.writeUInt32LE(padded.length, 12);
  padded.copy(output, 20);
  remaining.copy(output, 20 + padded.length);
  output.writeUInt32LE(output.length, 8);
  return output;
}

function triangleCount(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if ((primitive.getMode() ?? 4) !== 4) continue;
      const accessor = primitive.getIndices() || primitive.getAttribute('POSITION');
      if (accessor) triangles += Math.floor(accessor.getCount() / 3);
    }
  }
  return triangles;
}

async function optimize(glb, outputPath, lod) {
  const temporary = path.join(OUTPUT_DIR, `.tmp-${TRACK_ID}-lod${lod}.glb`);
  await fs.writeFile(temporary, glb);
  const document = await io.read(temporary);
  await fs.rm(temporary);
  document.getRoot().getAsset().extras = document.getRoot().getAsset().extras || {};
  await document.transform(
    dedup(),
    weld(),
    prune({ keepLeaves: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizationVolume: 'mesh' }),
  );
  const metadata = document.getRoot().getAsset().extras.velocityTrack || {};
  document.getRoot().getAsset().extras.velocityTrack = { ...metadata, lod, role: 'visual' };
  await io.write(outputPath, document);
  return { triangles: triangleCount(document), bytes: (await fs.stat(outputPath)).size };
}

function createRaceMetadata() {
  const { frameAt, length, startDistance } = layout;
  const startFrame = frameAt(startDistance);
  const checkpoints = Array.from({ length: CHECKPOINT_COUNT }, (_, index) => {
    const distance = (startDistance + index / CHECKPOINT_COUNT * length) % length;
    const frame = frameAt(distance);
    return {
      id: index + 1,
      distance: round(distance),
      position: vecArray(framePoint(frame, 0, 0.1)),
      forward: vecArray(frame.tangent),
      left: vecArray(frame.left),
      halfWidth: ROAD_WIDTH / 2,
      yaw: round(frame.yaw, 5),
      respawn: {
        position: vecArray(framePoint(frame, 0, 0.5)),
        yaw: round(frame.yaw, 5),
      },
    };
  });
  const grid = Array.from({ length: GRID_COUNT }, (_, index) => {
    const frame = frameAt(startDistance - 8 - Math.floor(index / 2) * 7);
    const offset = index % 2 ? 2.4 : -2.4;
    return {
      slot: index + 1,
      position: vecArray(framePoint(frame, offset, 0.15)),
      forward: vecArray(frame.tangent),
      yaw: round(frame.yaw, 5),
    };
  });
  const centerline = Array.from({ length: 361 }, (_, index) => {
    const frame = frameAt(startDistance + index / 360 * length);
    return vecArray(frame.point);
  });
  const roadPoints = Array.from({ length: 720 }, (_, index) => frameAt(index / 720 * length).point);
  const bounds = new THREE.Box3().setFromPoints(roadPoints);
  const size = bounds.getSize(new THREE.Vector3());
  let hairpin = frameAt(0);
  for (let index = 0; index < 720; index += 1) {
    const frame = frameAt(index / 720 * length);
    if (Math.abs(frame.curvature) > Math.abs(hairpin.curvature)) hairpin = frame;
  }
  const scenicFrame = frameAt(startDistance + length * 0.44 + 18);
  return {
    id: TRACK_ID,
    name: TRACK_NAME,
    collection: 'Velocity Environment Library',
    version: 1,
    description: 'An original 3.2 km alpine circuit with technical esses, a granite hairpin, an open avalanche gallery, pine forests and a 16-car mountain grid.',
    license: 'CC0-1.0',
    credit: {
      title: TRACK_NAME,
      author: 'Velocity procedural asset pipeline',
      license: 'CC0 1.0 Universal',
      source: 'Original geometry, layout, materials and race metadata generated by this repository',
      changes: 'No third-party environment geometry is used. Four purpose-built runtime LODs and basic collision are generated from the same deterministic layout.',
    },
    units: 'metres',
    upAxis: '+Y',
    forwardAxis: '+Z',
    closed: true,
    environmentType: 'alpine-circuit',
    region: 'Kestrel mountains / 02',
    tagLine: 'Technical mountain esses. A granite hairpin. An open gallery above the treeline.',
    tags: ['Closed circuit', 'Technical / drift'],
    accent: '#ffb13b',
    scenicLabel: 'Gallery',
    length: round(length),
    roadWidth: ROAD_WIDTH,
    shoulderWidth: 2,
    gridCount: GRID_COUNT,
    checkpointCount: CHECKPOINT_COUNT,
    bounds: { min: vecArray(bounds.min), max: vecArray(bounds.max), size: vecArray(size) },
    elevation: { min: round(bounds.min.y), max: round(bounds.max.y), change: round(size.y) },
    start: {
      distance: round(startDistance),
      position: vecArray(framePoint(startFrame, 0, 0.15)),
      forward: vecArray(startFrame.tangent),
      left: vecArray(startFrame.left),
      yaw: round(startFrame.yaw, 5),
    },
    grid,
    checkpoints,
    sectors: [0, 1, 2].map((sector) => ({
      id: sector + 1,
      startCheckpoint: sector * 6 + 1,
      endCheckpoint: sector === 2 ? 1 : sector * 6 + 7,
      length: round(length / 3),
    })),
    technicalSections: [
      { id: 'ridge-esses', name: 'Ridge Esses', startCheckpoint: 4, endCheckpoint: 7, character: 'Linked direction changes and a rising crown' },
      { id: 'granite-hairpin', name: 'Granite Hairpin', startCheckpoint: 9, endCheckpoint: 12, character: 'Tight rotation with amber curb and rock-face markers' },
      { id: 'gallery-run', name: 'Gallery Run', startCheckpoint: 13, endCheckpoint: 16, character: 'Elevated open-sided avalanche gallery and descent' },
    ],
    gallery: { distance: round((startDistance + length * 0.44) % length), clearHeight: 5.11, masterPortals: 6, openSides: true },
    centerline,
    viewpoints: {
      overview: { target: vecArray(bounds.getCenter(new THREE.Vector3())), distance: round(Math.max(size.x, size.z) * 1.48) },
      hairpin: { position: vecArray(framePoint(hairpin, 0, 0)), forward: vecArray(hairpin.tangent) },
      coast: { position: vecArray(framePoint(scenicFrame, 0, 0)), forward: vecArray(scenicFrame.tangent), cameraOffset: [58, 32, 72], label: 'Gallery' },
    },
    preview: 'assets/previews/kestrel-ridge.webp',
    master: 'assets-src/tracks/kestrel-ridge.glb',
    collision: 'assets/tracks/collisions/kestrel-ridge-collision.glb',
    licenseFile: 'assets/tracks/kestrel-ridge-LICENSE.txt',
    gameplayNote: 'Layout, spawn, checkpoint and visual technical-section metadata only. No driving, drift scoring, lap validation, AI or race logic is implemented.',
  };
}

async function createPoster(metadata) {
  const points = metadata.centerline;
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[2]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  const project = (point) => [round(90 + (point[0] - minX) / (maxX - minX) * 780, 1), round(82 + (point[2] - minZ) / (maxZ - minZ) * 365, 1)];
  const pathData = points.map((point, index) => `${index ? 'L' : 'M'}${project(point).join(',')}`).join(' ') + ' Z';
  const start = project(metadata.start.position);
  const contours = Array.from({ length: 8 }, (_, index) => `<path d="M${-80 + index * 22} ${150 + index * 38} Q240 ${20 + index * 42} 510 ${170 + index * 31} T1040 ${120 + index * 39}"/>`).join('');
  const svg = `<svg width="960" height="600" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#172126"/><stop offset="1" stop-color="#090f14"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="960" height="600" fill="url(#bg)"/>
    <path d="M0 310 140 135 245 280 400 72 535 280 680 120 820 275 960 115V600H0Z" fill="#83918d" opacity=".075"/>
    <path d="m330 150 70-78 55 82-36-22-20 16-18-20Z" fill="#dbe2dc" opacity=".13"/>
    <g fill="none" stroke="#a7b7b1" stroke-width="1" opacity=".09">${contours}</g>
    <path d="${pathData}" fill="none" stroke="#05090b" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${pathData}" fill="none" stroke="#e8e8dc" stroke-opacity=".88" stroke-width="15" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${pathData}" fill="none" stroke="#30383b" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${pathData}" fill="none" stroke="#ffb13b" stroke-opacity=".8" stroke-width="1.5" stroke-dasharray="4 9"/>
    <circle cx="${start[0]}" cy="${start[1]}" r="9" fill="#ffb13b" filter="url(#glow)"/>
    <text x="64" y="72" fill="#ffb13b" font-family="Arial,sans-serif" font-size="15" letter-spacing="5">VELOCITY / ENVIRONMENT 07</text>
    <text x="60" y="526" fill="#f2f4ef" font-family="Arial,sans-serif" font-size="50" font-weight="700" letter-spacing="-2">KESTREL RIDGE</text>
    <text x="64" y="566" fill="#9db0b4" font-family="Arial,sans-serif" font-size="14" letter-spacing="3">ALPINE TECHNICAL · ${metadata.length.toFixed(0)} M · 18 CHECKPOINTS</text>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(PREVIEW_PATH);
}

const DETAILS = [
  { level: 0, name: 'LOD0', roadStep: 3, terrainSegments: 132, terrainSize: 2200, peaks: 12, pines: 210, rocks: 132, shrubs: 280, structures: true, gallery: 6, tireBarriers: true, lightSpacing: 140 },
  { level: 1, name: 'LOD1', roadStep: 4.5, terrainSegments: 92, terrainSize: 2200, peaks: 10, pines: 104, rocks: 64, shrubs: 140, structures: true, gallery: 5, tireBarriers: true, lightSpacing: 210 },
  { level: 2, name: 'LOD2', roadStep: 7, terrainSegments: 60, terrainSize: 2200, peaks: 8, pines: 42, rocks: 26, shrubs: 58, structures: true, gallery: 3, tireBarriers: false, lightSpacing: 350 },
  { level: 3, name: 'LOD3', roadStep: 11, terrainSegments: 36, terrainSize: 2200, peaks: 6, pines: 14, rocks: 9, shrubs: 18, structures: false, gallery: 2, tireBarriers: false, lightSpacing: 10000 },
];

console.log(`Building ${TRACK_NAME}: ${layout.length.toFixed(1)} m closed loop…`);
const masterScene = buildScene(DETAILS[0]);
const masterPath = path.join(MASTER_DIR, `${TRACK_ID}.glb`);
await fs.writeFile(masterPath, withAssetMetadata(await exportGlb(masterScene), 0));
console.log(`Master: ${((await fs.stat(masterPath)).size / 1e6).toFixed(1)} MB`);

const metadata = createRaceMetadata();
metadata.lods = {};
metadata.lodTriangles = {};
for (const detail of DETAILS) {
  const raw = detail.level === 0 ? await fs.readFile(masterPath) : withAssetMetadata(await exportGlb(buildScene(detail)), detail.level);
  const relative = `assets/tracks/lods/${TRACK_ID}-lod${detail.level}.glb`;
  const result = await optimize(raw, path.join(ROOT, 'public', relative), detail.level);
  metadata.lods[detail.level] = relative;
  metadata.lodTriangles[detail.level] = result.triangles;
  metadata[`lod${detail.level}Bytes`] = result.bytes;
  console.log(`${detail.name}: ${(result.bytes / 1e6).toFixed(1)} MB · ${result.triangles.toLocaleString()} tris`);
}

const collisionRelative = metadata.collision;
const collisionPath = path.join(ROOT, 'public', collisionRelative);
await fs.writeFile(collisionPath, withAssetMetadata(await exportGlb(createCollisionScene()), null, 'collision'));
const collisionDocument = await io.read(collisionPath);
metadata.collisionTriangles = triangleCount(collisionDocument);
metadata.collisionBytes = (await fs.stat(collisionPath)).size;
metadata.model = metadata.lods[0];
metadata.triangles = metadata.lodTriangles[0];
metadata.fileSize = `${(metadata.lod0Bytes / 1e6).toFixed(1)} MB`;
await fs.writeFile(path.join(OUTPUT_DIR, `${TRACK_ID}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
await createPoster(metadata);

const attribution = `${TRACK_NAME}\n${metadata.credit.author}\n${metadata.credit.license}\nhttps://creativecommons.org/publicdomain/zero/1.0/\n${metadata.credit.source}\n${metadata.credit.changes}\n`;
await fs.writeFile(path.join(ROOT, 'public', metadata.licenseFile), attribution);

const catalogPath = path.join(ROOT, 'public/assets/catalog.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const catalogEntry = {
  id: TRACK_ID,
  name: TRACK_NAME,
  manifest: `assets/tracks/${TRACK_ID}.json`,
  preview: metadata.preview,
  page: `track.html?track=${TRACK_ID}`,
};
const existingTrack = (catalog.tracks || []).findIndex((entry) => entry.id === TRACK_ID);
if (existingTrack >= 0) catalog.tracks[existingTrack] = catalogEntry;
else catalog.tracks = [...(catalog.tracks || []), catalogEntry];
catalog.version = Math.max(Number(catalog.version) || 1, 7);
catalog.forwardAxis = '+Z (baked into runtime vehicle assets)';
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Collision: ${metadata.collisionTriangles.toLocaleString()} tris · ${GRID_COUNT} grid slots · ${CHECKPOINT_COUNT} checkpoints`);
console.log(`Package written to public/assets/tracks/${TRACK_ID}.json`);
