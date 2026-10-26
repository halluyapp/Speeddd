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
const TRACK_ID = 'azurline-circuit';
const TRACK_NAME = 'Azurline Circuit';
const MASTER_DIR = path.join(ROOT, 'assets-src/tracks');
const OUTPUT_DIR = path.join(ROOT, 'public/assets/tracks');
const PREVIEW_PATH = path.join(ROOT, 'public/assets/previews/azurline-circuit.webp');
const TARGET_LENGTH = 2800;
const ROAD_WIDTH = 14;
const GRID_COUNT = 16;
const CHECKPOINT_COUNT = 12;
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
  asphalt: material('Asphalt — aggregate variation', '#ffffff', { vertexColors: true, roughness: 0.94 }),
  shoulder: material('Concrete shoulders', '#5c5d5b', { roughness: 0.92 }),
  white: material('Track markings — ivory', '#f1f0df', { roughness: 0.72 }),
  red: material('Curb red', '#c7293c', { roughness: 0.76 }),
  curbWhite: material('Curb white', '#e5e2d7', { roughness: 0.8 }),
  dark: material('Powder-coated graphite', '#20282c', { metalness: 0.55, roughness: 0.42 }),
  metal: material('Galvanized guardrail', '#9ba7a8', { metalness: 0.78, roughness: 0.32 }),
  concrete: material('Warm cast concrete', '#a9a494', { roughness: 0.96 }),
  terrain: material('Coastal terrain', '#ffffff', { vertexColors: true, roughness: 1 }),
  ocean: material('Atlantic water', '#ffffff', { vertexColors: true, roughness: 0.24, metalness: 0.25, transparent: true, opacity: 0.93 }),
  foam: material('Shoreline foam', '#d8f5ed', { transparent: true, opacity: 0.46, depthWrite: false, roughness: 0.5 }),
  trunk: material('Palm trunk', '#79624a', { roughness: 1 }),
  leaf: material('Palm fronds', '#2f7046', { roughness: 0.92, side: THREE.DoubleSide }),
  leafLight: material('Sunlit fronds', '#4b8751', { roughness: 0.9, side: THREE.DoubleSide }),
  shrub: material('Coastal scrub', '#698153', { roughness: 1 }),
  rock: material('Weathered basalt', '#696d69', { roughness: 0.98 }),
  rockLight: material('Salt-worn limestone', '#969588', { roughness: 0.98 }),
  tire: material('Safety tire rubber', '#16191a', { roughness: 0.95 }),
  glass: material('Pit glazing', '#78b7c4', { metalness: 0.25, roughness: 0.18, transparent: true, opacity: 0.68 }),
  lime: material('Velocity chartreuse', '#d7ff3f', { roughness: 0.5, emissive: '#62751f', emissiveIntensity: 0.35 }),
  blue: material('Grandstand ocean blue', '#326a86', { roughness: 0.75 }),
  lamp: material('Track lighting', '#fff4cf', { emissive: '#fff0b5', emissiveIntensity: 1.6, roughness: 0.35 }),
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
    [-420, 14, 180], [-220, 16, 150], [-20, 20, 110], [180, 28, 40],
    [330, 42, -80], [390, 58, -230], [300, 72, -360], [120, 78, -420],
    [-60, 68, -400], [-190, 54, -320], [-150, 45, -220], [-280, 36, -160],
    [-460, 28, -220], [-570, 24, -120], [-540, 18, 40],
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

function coastZ(x) {
  return 310 + Math.sin(x * 0.004) * 55 + Math.sin(x * 0.011) * 25;
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
  const noise = Math.sin(x * 0.018) * 2.8 + Math.cos(z * 0.015) * 2.2 + Math.sin((x + z) * 0.008) * 4.2;
  const coastalBase = 18 + noise + Math.sin(x * 0.003) * 8;
  let height;
  if (distance < 42) height = nearest.point.y - 0.38 - distance * 0.012;
  else {
    const blend = smoothstep(distance, 42, 125);
    height = lerp(nearest.point.y - 1, coastalBase + nearest.point.y * 0.25, blend);
  }
  const shoreDistance = coastZ(x) - z;
  if (shoreDistance < 115) {
    const shoreBlend = smoothstep(shoreDistance, -30, 115);
    height = lerp(-5 - Math.max(0, -shoreDistance) * 0.035, height, shoreBlend);
  }
  return height;
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
  for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
    for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
      const x = (xIndex / segments - 0.5) * size;
      const z = (zIndex / segments - 0.5) * size - 70;
      const y = terrainHeight(x, z, roadSamples);
      positions.push(x, y, z);
      uvs.push(xIndex / segments, zIndex / segments);
      const shore = coastZ(x) - z;
      const rockFactor = clamp((Math.sin(x * 0.033) + Math.cos(z * 0.027)) * 0.18 + 0.25, 0, 0.65);
      if (y < 1.2 || shore < 45) color.set('#c9b98d');
      else if (rockFactor > 0.48 || y > 72) color.set('#7b7e71');
      else color.set('#6f8755').lerp(new THREE.Color('#a39b69'), clamp((y - 20) / 100, 0, 0.45));
      const variation = 0.92 + 0.08 * Math.sin(x * 0.12 + z * 0.09);
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

function createOcean(segments) {
  const size = 4000;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const deep = new THREE.Color('#07516f');
  const shallow = new THREE.Color('#1596a0');
  for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
    for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
      const x = (xIndex / segments - 0.5) * size;
      const z = (zIndex / segments - 0.5) * size;
      const wave = Math.sin(x * 0.026 + z * 0.014) * 0.12 + Math.cos(z * 0.036) * 0.07;
      positions.push(x, wave - 0.08, z);
      uvs.push(xIndex / segments, zIndex / segments);
      const shoreFactor = clamp(1 - Math.max(0, z - coastZ(x)) / 450, 0, 1);
      const color = deep.clone().lerp(shallow, shoreFactor * 0.78);
      colors.push(color.r, color.g, color.b);
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

function addPalm(batch, position, height, yaw, variant = 0) {
  const trunk = new THREE.CylinderGeometry(0.16, 0.34, height, 7, 6);
  const positions = trunk.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    positions.setX(index, positions.getX(index) + Math.sin((y / height + 0.5) * 1.4) * 0.55);
  }
  trunk.computeVertexNormals();
  const trunkMatrix = new THREE.Matrix4().compose(
    position.clone().add(new THREE.Vector3(0, height / 2, 0)),
    new THREE.Quaternion().setFromAxisAngle(UP, yaw),
    new THREE.Vector3(1, 1, 1),
  );
  batch.add('vegetation', MAT.trunk, trunk, trunkMatrix);
  trunk.dispose();

  for (let frond = 0; frond < 9; frond += 1) {
    const angle = yaw + frond / 9 * Math.PI * 2 + variant * 0.17;
    const length = 3.4 + (frond % 3) * 0.45;
    const vertices = [];
    const indices = [];
    const segments = 6;
    for (let step = 0; step <= segments; step += 1) {
      const t = step / segments;
      const radial = length * t;
      const center = new THREE.Vector3(
        Math.cos(angle) * radial + 0.55,
        height + Math.sin(t * Math.PI) * 0.55 - t * t * 1.5,
        Math.sin(angle) * radial,
      );
      const width = Math.sin(t * Math.PI) * 0.52 + 0.03;
      for (const side of [-1, 1]) {
        vertices.push(center.x + Math.cos(angle + Math.PI / 2) * width * side, center.y, center.z + Math.sin(angle + Math.PI / 2) * width * side);
      }
      if (step < segments) {
        const base = step * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const matrix = new THREE.Matrix4().makeTranslation(position.x, position.y, position.z);
    batch.add('vegetation', frond % 3 === 0 ? MAT.leafLight : MAT.leaf, geometry, matrix);
    geometry.dispose();
  }
}

function addTrackStructures(batch, detail, frames) {
  const { frameAt, startDistance, length } = layout;
  const start = frameAt(startDistance);

  // Start/finish checker strip and grid slots.
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 14; column += 1) {
      const frame = frameAt(startDistance + row * 0.7 - 0.35);
      const point = framePoint(frame, -6.5 + column, 0.055);
      batch.box('markings', (row + column) % 2 ? MAT.dark : MAT.white, [0.96, 0.025, 0.68], point, frame.yaw);
    }
  }
  for (let index = 0; index < GRID_COUNT; index += 1) {
    const distance = startDistance - 8 - Math.floor(index / 2) * 7;
    const offset = index % 2 ? 2.8 : -2.8;
    const frame = frameAt(distance);
    for (const side of [-1, 1]) {
      batch.box('markings', MAT.white, [1.7, 0.025, 0.12], framePoint(frame, offset + side * 1.2, 0.055), frame.yaw);
      batch.box('markings', MAT.white, [0.12, 0.025, 1.6], framePoint(frame, offset + side * 2, 0.055), frame.yaw);
    }
  }

  // Gantry, pit garages and grandstand.
  for (const side of [-1, 1]) {
    batch.box('structures', MAT.dark, [0.65, 8.2, 0.65], framePoint(start, side * 9.4, 4.1), start.yaw);
    batch.box('structures', MAT.concrete, [1.5, 0.45, 1.5], framePoint(start, side * 9.4, 0.22), start.yaw);
  }
  batch.box('structures', MAT.dark, [20, 0.65, 0.65], framePoint(start, 0, 7.9), start.yaw);
  batch.box('structures', MAT.lime, [10.5, 1.4, 0.28], framePoint(start, 0, 7.85), start.yaw);
  for (let stripe = -4; stripe <= 4; stripe += 1) {
    batch.box('structures', MAT.dark, [0.28, 1.42, 0.32], framePoint(start, stripe * 1.05, 7.85), start.yaw + 0.35);
  }

  if (detail.structures) {
    for (let unit = 0; unit < 6; unit += 1) {
      const frame = frameAt(startDistance - 62 + unit * 13);
      const center = framePoint(frame, -29, 2.3);
      batch.box('structures', MAT.concrete, [10, 4.6, 12.2], center, frame.yaw);
      batch.box('structures', MAT.dark, [10.8, 0.35, 13], framePoint(frame, -29, 4.75), frame.yaw);
      batch.box('structures', MAT.glass, [0.12, 2.8, 8.8], framePoint(frame, -23.95, 2.1), frame.yaw);
      batch.box('structures', MAT.lime, [0.18, 0.35, 9.2], framePoint(frame, -23.85, 4.05), frame.yaw);
      for (let divider = -1; divider <= 1; divider += 1) {
        batch.box('structures', MAT.dark, [0.18, 3, 0.12], framePoint(frameAt(startDistance - 62 + unit * 13 + divider * 3), -23.8, 2.1), frame.yaw);
      }
    }
    for (let step = 0; step < 6; step += 1) {
      const frame = frameAt(startDistance + 22);
      batch.box('structures', MAT.concrete, [4.2, 0.55 + step * 0.45, 52], framePoint(frame, 25 + step * 2.2, 0.3 + step * 0.22), frame.yaw);
      for (let seat = -11; seat <= 11; seat += 1) {
        const seatFrame = frameAt(startDistance + 22 + seat * 2.1);
        batch.box('structures', seat % 3 ? MAT.blue : MAT.lime, [1.1, 0.45, 0.75], framePoint(seatFrame, 24.5 + step * 2.2, 0.85 + step * 0.45), frame.yaw);
      }
    }
  }

  // Track lighting and corner marker boards.
  for (let distance = 0; distance < length; distance += detail.lightSpacing) {
    const frame = frameAt(distance);
    if (Math.abs(distance - startDistance) < 45) continue;
    const side = Math.floor(distance / detail.lightSpacing) % 2 ? 1 : -1;
    const base = framePoint(frame, side * 13.5, 0);
    const pole = new THREE.CylinderGeometry(0.08, 0.14, 8, 8);
    batch.add('props', MAT.metal, pole, new THREE.Matrix4().makeTranslation(base.x, base.y + 4, base.z));
    pole.dispose();
    batch.box('props', MAT.dark, [2.8, 0.12, 0.12], framePoint(frame, side * 12.3, 7.9), frame.yaw);
    batch.box('props', MAT.lamp, [1.8, 0.18, 0.55], framePoint(frame, side * 11.3, 7.72), frame.yaw);
  }

  let boardIndex = 0;
  for (let distance = 0; distance < length; distance += 160) {
    const frame = frameAt(distance);
    if (Math.abs(frame.curvature) < 0.0025) continue;
    const side = frame.curvature > 0 ? -1 : 1;
    for (let marker = 1; marker <= 3; marker += 1) {
      const boardFrame = frameAt(distance - marker * 35);
      const point = framePoint(boardFrame, side * 11.5, 1.35);
      batch.box('props', MAT.dark, [1.4, 1.1, 0.16], point, boardFrame.yaw);
      for (let bar = 0; bar < 4 - marker; bar += 1) {
        batch.box('props', MAT.white, [0.18, 0.72, 0.18], framePoint(boardFrame, side * 11.5 + (bar - 0.5) * 0.35, 1.35), boardFrame.yaw);
      }
    }
    boardIndex += 1;
    if (boardIndex > 8) break;
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
  const roadSamples = Array.from({ length: 360 }, (_, index) => frameAt(index / 360 * length));

  const asphaltColor = (frame, offset, index) => {
    const value = 0.085 + 0.009 * Math.sin(index * 1.73 + offset) + 0.006 * Math.sin(index * 0.19);
    return new THREE.Color(value, value * 1.02, value * 1.04);
  };
  batch.add('road', MAT.asphalt, ribbon(frames, -ROAD_WIDTH / 2, ROAD_WIDTH / 2, 0, asphaltColor));
  batch.add('road', MAT.shoulder, ribbon(frames, -ROAD_WIDTH / 2 - 2, -ROAD_WIDTH / 2, -0.03));
  batch.add('road', MAT.shoulder, ribbon(frames, ROAD_WIDTH / 2, ROAD_WIDTH / 2 + 2, -0.03));
  batch.add('markings', MAT.white, ribbon(frames, -6.67, -6.52, 0.045));
  batch.add('markings', MAT.white, ribbon(frames, 6.52, 6.67, 0.045));

  for (let index = 0; index < frames.length - 1; index += 1) {
    const frame = frames[index];
    const next = frames[index + 1];
    const step = length / segments;
    const curvature = Math.abs(frame.curvature);
    if (curvature > 0.0024) {
      for (const side of [-1, 1]) {
        const point = framePoint(frame, side * 7.25, 0.09);
        batch.box('curbs', Math.floor(frame.distance / 4) % 2 ? MAT.red : MAT.curbWhite, [0.62, 0.18, step * 1.03], point, frame.yaw);
      }
    }
    const guarded = curvature > 0.002 || frame.point.z > coastZ(frame.point.x) - 165;
    if (guarded) {
      for (const side of [-1, 1]) {
        batch.box('barriers', MAT.metal, [0.16, 0.42, step * 1.04], framePoint(frame, side * 9.5, 0.72), frame.yaw);
        if (index % Math.max(1, Math.round(6 / step)) === 0) {
          batch.box('barriers', MAT.dark, [0.15, 1.05, 0.15], framePoint(frame, side * 9.5, 0.48), frame.yaw);
        }
      }
    }
    if (curvature > 0.004 && detail.tireBarriers && index % 3 === 0) {
      const side = frame.curvature > 0 ? -1 : 1;
      for (let stack = 0; stack < 3; stack += 1) {
        const tire = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 10);
        const point = framePoint(frame, side * 11.2, 0.14 + stack * 0.24);
        batch.add('barriers', MAT.tire, tire, new THREE.Matrix4().makeTranslation(point.x, point.y, point.z));
        tire.dispose();
      }
    }
    void next;
  }

  batch.add('terrain', MAT.terrain, createTerrain(detail, roadSamples));
  batch.add('ocean', MAT.ocean, createOcean(detail.oceanSegments));

  // Static shoreline ribbons and foam traces.
  const shoreFrames = [];
  for (let index = 0; index <= detail.shoreSegments; index += 1) {
    const x = lerp(-1100, 1100, index / detail.shoreSegments);
    shoreFrames.push({
      point: new THREE.Vector3(x, 0.02, coastZ(x) + 4),
      left: new THREE.Vector3(0, 0, 1),
      bank: 0,
      distance: index * 4,
      curvature: 0,
    });
  }
  batch.add('ocean', MAT.foam, ribbon(shoreFrames, -1.2, 1.2, 0));

  addTrackStructures(batch, detail, frames);

  const random = rngFactory(0x51a7c0de);
  for (let index = 0; index < detail.palms; index += 1) {
    const distance = random() * length;
    if (Math.abs(distance - startDistance) < 100) continue;
    const frame = frameAt(distance);
    const side = index % 2 ? 1 : -1;
    const offset = side * (22 + random() * 42);
    const base = framePoint(frame, offset, 0);
    base.y = terrainHeight(base.x, base.z, roadSamples);
    if (base.y < 1) continue;
    addPalm(batch, base, 6.5 + random() * 4.5, random() * Math.PI * 2, index % 5);
  }

  for (let index = 0; index < detail.rocks; index += 1) {
    const x = lerp(-950, 950, random());
    const z = coastZ(x) + (random() - 0.5) * 85;
    const y = terrainHeight(x, z, roadSamples);
    const geometry = new THREE.IcosahedronGeometry(1, detail.name === 'LOD0' ? 1 : 0);
    const scale = new THREE.Vector3(2 + random() * 5, 1.5 + random() * 5, 2 + random() * 4);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, Math.max(-1, y) + scale.y * 0.35, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(random(), random() * Math.PI, random() * 0.3)),
      scale,
    );
    batch.add('terrain-rocks', index % 3 ? MAT.rock : MAT.rockLight, geometry, matrix);
    geometry.dispose();
  }

  for (let index = 0; index < detail.shrubs; index += 1) {
    const frame = frameAt(random() * length);
    const offset = (random() > 0.5 ? 1 : -1) * (18 + random() * 75);
    const point = framePoint(frame, offset, 0);
    point.y = terrainHeight(point.x, point.z, roadSamples);
    if (point.y < 1) continue;
    const geometry = new THREE.ConeGeometry(0.8 + random(), 1.4 + random() * 1.5, 5);
    batch.add('vegetation', MAT.shrub, geometry, new THREE.Matrix4().makeTranslation(point.x, point.y + 0.6, point.z));
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
  const roadSamples = Array.from({ length: 180 }, (_, index) => frameAt(index / 180 * length));
  batch.add('collision-road', collisionRoad, ribbon(frames, -8, 8, -0.02));
  batch.add('collision-terrain', collisionTerrain, createTerrain({ terrainSegments: 38, terrainSize: 2200 }, roadSamples));
  for (let index = 0; index < frames.length - 1; index += 1) {
    const frame = frames[index];
    if (Math.abs(frame.curvature) < 0.002 && frame.point.z < coastZ(frame.point.x) - 165) continue;
    for (const side of [-1, 1]) {
      batch.box('collision-barriers', collisionBarrier, [0.35, 1.15, step * 1.04], framePoint(frame, side * 9.5, 0.55), frame.yaw);
    }
  }
  const start = frameAt(startDistance);
  for (const side of [-1, 1]) batch.box('collision-structures', collisionBarrier, [1.2, 8, 1.2], framePoint(start, side * 9.4, 4), start.yaw);
  batch.flush();
  scene.traverse((object) => {
    if (object.isMesh) object.userData.velocityRole = object.name.split('__')[0];
  });
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
  document.asset.generator = 'Velocity original procedural coastal-track pipeline';
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
    const offset = index % 2 ? 2.8 : -2.8;
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
  return {
    id: TRACK_ID,
    name: TRACK_NAME,
    collection: 'Velocity Environment Library',
    version: 1,
    description: 'An original 2.8 km Atlantic coastal circuit with fast sweepers, a technical inner loop, elevated cliff sections, a pit complex and a 16-car grid.',
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
      startCheckpoint: sector * 4 + 1,
      endCheckpoint: sector === 2 ? 1 : sector * 4 + 5,
      length: round(length / 3),
    })),
    centerline,
    viewpoints: {
      overview: { target: vecArray(bounds.getCenter(new THREE.Vector3())), distance: round(Math.max(size.x, size.z) * 1.48) },
      hairpin: { position: vecArray(framePoint(hairpin, 0, 0)), forward: vecArray(hairpin.tangent) },
    },
    preview: 'assets/previews/azurline-circuit.webp',
    master: 'assets-src/tracks/azurline-circuit.glb',
    collision: 'assets/tracks/collisions/azurline-circuit-collision.glb',
    gameplayNote: 'Layout, spawn and checkpoint metadata only. No driving, lap validation, AI or race logic is implemented.',
  };
}

async function createPoster(metadata) {
  const points = metadata.centerline;
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const project = (point) => {
    const x = 90 + (point[0] - minX) / (maxX - minX) * 780;
    const y = 80 + (point[2] - minZ) / (maxZ - minZ) * 390;
    return [round(x, 1), round(y, 1)];
  };
  const pathData = points.map((point, index) => `${index ? 'L' : 'M'}${project(point).join(',')}`).join(' ') + ' Z';
  const start = project(metadata.start.position);
  const svg = `<svg width="960" height="600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#10191d"/><stop offset="1" stop-color="#071c29"/></linearGradient>
      <linearGradient id="sea" x2="0" y2="1"><stop stop-color="#0b596d" stop-opacity=".1"/><stop offset="1" stop-color="#0b7d8c" stop-opacity=".65"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="960" height="600" fill="url(#bg)"/>
    <path d="M0 350 Q250 280 480 390 T960 350 V600 H0Z" fill="url(#sea)"/>
    <g opacity=".12" stroke="#b9d4d4"><path d="M0 100H960M0 200H960M0 300H960M0 400H960M0 500H960"/><path d="M120 0V600M240 0V600M360 0V600M480 0V600M600 0V600M720 0V600M840 0V600"/></g>
    <path d="${pathData}" fill="none" stroke="#05090b" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${pathData}" fill="none" stroke="#e6e9df" stroke-opacity=".85" stroke-width="15" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${pathData}" fill="none" stroke="#313b3e" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${start[0]}" cy="${start[1]}" r="9" fill="#d7ff3f" filter="url(#glow)"/>
    <text x="64" y="72" fill="#d7ff3f" font-family="Arial,sans-serif" font-size="15" letter-spacing="5">VELOCITY / ENVIRONMENT 02</text>
    <text x="60" y="540" fill="#f2f4ef" font-family="Arial,sans-serif" font-size="52" font-weight="700" letter-spacing="-2">AZURLINE</text>
    <text x="64" y="574" fill="#9db0b4" font-family="Arial,sans-serif" font-size="14" letter-spacing="4">ATLANTIC COAST · ${metadata.length.toFixed(0)} M · 16-CAR GRID</text>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(PREVIEW_PATH);
}

const DETAILS = [
  { level: 0, name: 'LOD0', roadStep: 3, terrainSegments: 126, terrainSize: 2200, oceanSegments: 72, shoreSegments: 220, palms: 92, rocks: 78, shrubs: 280, structures: true, tireBarriers: true, lightSpacing: 140 },
  { level: 1, name: 'LOD1', roadStep: 4.5, terrainSegments: 88, terrainSize: 2200, oceanSegments: 40, shoreSegments: 140, palms: 54, rocks: 44, shrubs: 135, structures: true, tireBarriers: true, lightSpacing: 210 },
  { level: 2, name: 'LOD2', roadStep: 7, terrainSegments: 58, terrainSize: 2200, oceanSegments: 20, shoreSegments: 80, palms: 28, rocks: 24, shrubs: 60, structures: true, tireBarriers: false, lightSpacing: 350 },
  { level: 3, name: 'LOD3', roadStep: 11, terrainSegments: 36, terrainSize: 2200, oceanSegments: 8, shoreSegments: 40, palms: 14, rocks: 12, shrubs: 24, structures: false, tireBarriers: false, lightSpacing: 10000 },
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
await fs.writeFile(path.join(OUTPUT_DIR, 'LICENSE.txt'), attribution);

const catalogPath = path.join(ROOT, 'public/assets/catalog.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
catalog.tracks = [{
  id: TRACK_ID,
  name: TRACK_NAME,
  manifest: `assets/tracks/${TRACK_ID}.json`,
  preview: metadata.preview,
  page: 'track.html',
}];
catalog.version = 2;
catalog.forwardAxis = '+Z (baked into runtime vehicle assets)';
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Collision: ${metadata.collisionTriangles.toLocaleString()} tris · ${GRID_COUNT} grid slots · ${CHECKPOINT_COUNT} checkpoints`);
console.log(`Package written to public/assets/tracks/${TRACK_ID}.json`);
