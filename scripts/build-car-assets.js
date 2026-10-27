import fs from 'node:fs/promises';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  cloneDocument,
  dedup,
  meshopt,
  prune,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, 'public/assets/catalog.json');
const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);

const LEVELS = [
  { level: 0, ratio: 1, error: 0, textureSize: 2048, quality: 88 },
  { level: 1, ratio: 0.5, error: 0.0015, textureSize: 1024, quality: 85 },
  { level: 2, ratio: 0.22, error: 0.004, textureSize: 512, quality: 83 },
  { level: 3, ratio: 0.08, error: 0.012, textureSize: 256, quality: 82 },
];

const WHEEL_MATCHERS = {
  'car-concept': (name) => /^Wheel(Front|Rear)(L|R)$/.test(name),
  hypercar: collectWheel,
  wedge: collectWheel,
  'rally-raid': collectWheel,
  endurance: collectWheel,
  streamliner: collectWheel,
  'sport-coupe': (name) => /^Coupe-Wheel\.(Ft|Bk)\.(L|R)(?:_|$)/.test(name),
  'grand-sedan': (name) => /^Name-Wheel\.(Ft|Bk)\.(L|R)(?:_|$)/.test(name),
  'v12-goblin': (name) => /^car_wheel_(FL|FR|BL|BR)$/.test(name),
  'mercedes-sl63': (name) => /^SL63_wheel(?:\.\d+)?$/.test(name),
  'bmw-m4-csl': (name) => /^M4xNME_wheels_enkeif(?:\.\d+)?$/.test(name),
};

function collectWheel(name) {
  return /_Wheel_(FL|FR|RL|RR)_Tyre$/.test(name);
}

function round(value, precision = 4) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function formatBytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function countTriangles(document) {
  let count = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if ((primitive.getMode() ?? 4) !== 4) continue;
      const accessor = primitive.getIndices() || primitive.getAttribute('POSITION');
      if (accessor) count += Math.floor(accessor.getCount() / 3);
    }
  }
  return count;
}

function isHidden(node, hiddenNames) {
  for (let current = node; current; current = current.getParentNode()) {
    if (hiddenNames.some((name) => current.getName().includes(name))) return true;
  }
  return false;
}

function visitSceneNodes(document, callback) {
  const visited = new Set();
  for (const scene of document.getRoot().listScenes()) {
    scene.traverse((node) => {
      if (!visited.has(node)) {
        visited.add(node);
        callback(node);
      }
    });
  }
}

function foreachPosition(document, callback, { hiddenNames = [], filterNode = null } = {}) {
  const point = new THREE.Vector3();
  const element = [];
  const world = new THREE.Matrix4();
  const visit = (node) => {
    if (isHidden(node, hiddenNames)) return;
    const mesh = node.getMesh();
    if (!mesh) return;
    world.fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const array = position.getArray();
      const fast = array instanceof Float32Array && !position.getNormalized();
      for (let index = 0; index < position.getCount(); index += 1) {
        if (fast) {
          point.set(array[index * 3], array[index * 3 + 1], array[index * 3 + 2]);
        } else {
          position.getElement(index, element);
          point.set(element[0], element[1], element[2]);
        }
        point.applyMatrix4(world);
        callback(point, node, primitive);
      }
    }
  };
  if (filterNode) {
    const visitSubtree = (node) => {
      visit(node);
      node.listChildren().forEach(visitSubtree);
    };
    visitSubtree(filterNode);
  } else {
    visitSceneNodes(document, visit);
  }
}

function initialBounds(document, car) {
  const box = new THREE.Box3();
  foreachPosition(document, (point) => box.expandByPoint(point), { hiddenNames: car.hideNodes || [] });
  if (box.isEmpty()) throw new Error(`${car.id}: no visible vertices found`);
  return box;
}

function normalizationMatrix(document, car) {
  const sourceBounds = initialBounds(document, car);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  let yaw = 0;
  if (car.forward === '-Z') yaw = Math.PI;
  else if (car.orientation === 'auto' && sourceSize.x > sourceSize.z) yaw = Math.PI / 2;

  const rotation = new THREE.Matrix4().makeRotationY(yaw);
  const orientedBounds = new THREE.Box3();
  foreachPosition(document, (point) => orientedBounds.expandByPoint(point.applyMatrix4(rotation)), {
    hiddenNames: car.hideNodes || [],
  });
  const size = orientedBounds.getSize(new THREE.Vector3());
  const scale = car.length / Math.max(size.z, 0.0001);
  const scaling = new THREE.Matrix4().makeScale(scale, scale, scale);
  const transform = scaling.clone().multiply(rotation);
  const scaledBounds = orientedBounds.clone().applyMatrix4(scaling);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  const translation = new THREE.Matrix4().makeTranslation(-center.x, -scaledBounds.min.y, -center.z);
  return { matrix: translation.multiply(transform), yaw, scale, sourceBounds };
}

function normalizeDocument(document, car, normalization) {
  for (const scene of document.getRoot().listScenes()) {
    const children = [...scene.listChildren()];
    const root = document.createNode(`Velocity_${car.id}`)
      .setMatrix(normalization.matrix.elements)
      .setExtras({
        role: 'vehicle-root',
        normalized: true,
        units: 'metres',
        upAxis: '+Y',
        forwardAxis: '+Z',
        groundY: 0,
        targetLength: car.length,
      });
    scene.addChild(root);
    children.forEach((child) => root.addChild(child));
  }
  const asset = document.getRoot().getAsset();
  asset.extras = asset.extras || {};
  asset.extras.velocityCollection = {
    ...(asset.extras.velocityCollection || {}),
    assetId: car.id,
    normalized: true,
    runtime: true,
    units: 'metres',
    upAxis: '+Y',
    forwardAxis: '+Z',
    groundY: 0,
    note: 'Runtime geometry normalization is baked; paint remains a runtime material operation.',
  };
}

function nodeWheel(document, car, node, normalization) {
  const box = new THREE.Box3();
  foreachPosition(document, (point) => box.expandByPoint(point.applyMatrix4(normalization.matrix)), {
    hiddenNames: car.hideNodes || [],
    filterNode: node,
  });
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  if (size.y < 0.2 || size.y > 1.5 || size.x > 1.5 || size.z > 1.5) return null;
  const side = center.x >= 0 ? 'L' : 'R';
  const axle = center.z >= 0 ? 'F' : 'R';
  return {
    id: `${axle}${side}`,
    sourceNode: node.getName(),
    position: [round(center.x), round(center.y), round(center.z)],
    radius: round(size.y / 2),
    width: round(size.x),
    axle: axle === 'F' ? 'front' : 'rear',
    side: side === 'L' ? 'left' : 'right',
    steering: axle === 'F',
  };
}

function findWheels(document, car, normalization) {
  const matcher = WHEEL_MATCHERS[car.id];
  if (!matcher) throw new Error(`${car.id}: no wheel matcher configured`);
  const wheels = [];
  visitSceneNodes(document, (node) => {
    if (matcher(node.getName())) {
      const wheel = nodeWheel(document, car, node, normalization);
      if (wheel) wheels.push(wheel);
    }
  });
  const unique = new Map();
  for (const wheel of wheels) {
    if (!unique.has(wheel.id)) unique.set(wheel.id, wheel);
  }
  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function createCollisionDocument(car, sourceDocument, normalization, copyright) {
  const points = [];
  const extremes = Array.from({ length: 6 }, () => null);
  const sampleLimit = 1600;
  let randomState = 0x6d2b79f5;
  let index = 0;
  foreachPosition(sourceDocument, (point) => {
    const normalized = point.applyMatrix4(normalization.matrix);
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    if (points.length < sampleLimit) points.push(normalized.clone());
    else {
      const replacement = randomState % (index + 1);
      if (replacement < sampleLimit) points[replacement] = normalized.clone();
    }
    for (let axis = 0; axis < 3; axis += 1) {
      const component = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
      if (!extremes[axis * 2] || normalized[component] < extremes[axis * 2][component]) {
        extremes[axis * 2] = normalized.clone();
      }
      if (!extremes[axis * 2 + 1] || normalized[component] > extremes[axis * 2 + 1][component]) {
        extremes[axis * 2 + 1] = normalized.clone();
      }
    }
    index += 1;
  }, { hiddenNames: car.hideNodes || [] });

  // Preserve exact bounds while sampling densely enough to retain the outer silhouette.
  const sampled = [...points, ...extremes];
  if (sampled.length < 4) throw new Error(`${car.id}: not enough points for collision hull`);
  const geometry = new ConvexGeometry(sampled);
  const positions = geometry.getAttribute('position').array;
  const normals = geometry.getAttribute('normal').array;

  const document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor('collision_positions')
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  const normal = document.createAccessor('collision_normals')
    .setType('VEC3')
    .setArray(new Float32Array(normals))
    .setBuffer(buffer);
  const material = document.createMaterial('collision_material')
    .setBaseColorFactor([0.3, 0.35, 0.4, 1])
    .setRoughnessFactor(1)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setMaterial(material);
  const mesh = document.createMesh(`${car.id}_convex_hull`).addPrimitive(primitive);
  const node = document.createNode(`${car.id}_collision`).setMesh(mesh);
  const scene = document.createScene(`${car.id}_collision_scene`).addChild(node);
  document.getRoot().setDefaultScene(scene);
  const asset = document.getRoot().getAsset();
  asset.generator = 'Velocity convex collision pipeline';
  asset.copyright = copyright;
  asset.extras = {
    velocityCollection: {
      assetId: car.id,
      role: 'collision',
      shape: 'convex-hull',
      normalized: true,
      units: 'metres',
      upAxis: '+Y',
      forwardAxis: '+Z',
    },
  };
  geometry.dispose();
  return document;
}

async function optimizeAndWrite(document, car, level, outputPath) {
  const transforms = [dedup(), weld()];
  if (level.level > 0) {
    transforms.push(simplify({
      simplifier: MeshoptSimplifier,
      ratio: level.ratio,
      error: level.error,
      lockBorder: true,
    }));
  }
  transforms.push(
    prune({ keepLeaves: true }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [level.textureSize, level.textureSize],
      quality: level.quality,
      effort: 60,
    }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  await document.transform(...transforms);
  const asset = document.getRoot().getAsset();
  asset.extras = asset.extras || {};
  asset.extras.velocityCollection = {
    ...(asset.extras.velocityCollection || {}),
    assetId: car.id,
    lod: level.level,
    runtime: true,
    normalized: true,
  };
  await io.write(outputPath, document);
  const bytes = await fs.stat(outputPath);
  return { size: bytes.size, triangles: countTriangles(document) };
}

async function buildCar(car) {
  const sourceName = path.basename(car.master || car.model);
  const masterPath = path.join(ROOT, car.master || `assets-src/cars/${sourceName}`);
  const source = await io.read(masterPath);
  const normalization = normalizationMatrix(source, car);
  const wheels = findWheels(source, car, normalization);
  if (wheels.length !== 4) {
    throw new Error(`${car.id}: expected four usable wheel rigs, found ${wheels.length} (${wheels.map((wheel) => wheel.id).join(', ')})`);
  }

  const normalizedBounds = initialBounds(source, car).applyMatrix4(normalization.matrix);
  const dimensionsVector = normalizedBounds.getSize(new THREE.Vector3());
  const dimensions = {
    length: round(dimensionsVector.z, 3),
    width: round(dimensionsVector.x, 3),
    height: round(dimensionsVector.y, 3),
  };
  const collision = createCollisionDocument(car, source, normalization, source.getRoot().getAsset().copyright || '');
  const collisionPath = path.join(ROOT, `public/assets/cars/collisions/${car.id}-collision.glb`);
  await io.write(collisionPath, collision);
  const collisionStats = await fs.stat(collisionPath);

  const normalizedSource = cloneDocument(source);
  normalizeDocument(normalizedSource, car, normalization);

  const lodResults = {};
  for (const level of LEVELS) {
    const document = cloneDocument(normalizedSource);
    const relativeOutput = `assets/cars/lods/${car.id}-lod${level.level}.glb`;
    const outputPath = path.join(ROOT, 'public', relativeOutput);
    const result = await optimizeAndWrite(document, car, level, outputPath);
    lodResults[level.level] = {
      path: relativeOutput,
      ...result,
    };
    console.log(`  LOD${level.level}: ${formatBytes(result.size).padStart(8)} · ${result.triangles.toLocaleString()} tris`);
  }

  const rig = {
    id: car.id,
    units: 'metres',
    upAxis: '+Y',
    forwardAxis: '+Z',
    groundY: 0,
    normalized: true,
    dimensions,
    wheels,
    collision: {
      path: `assets/cars/collisions/${car.id}-collision.glb`,
      shape: 'convex-hull',
      triangles: countTriangles(collision),
      bytes: collisionStats.size,
      note: 'Basic single-hull collision asset for arcade physics. Wheel suspension and chassis tuning must be validated in the driving prototype.',
    },
    lods: Object.fromEntries(Object.entries(lodResults).map(([level, result]) => [level, {
      path: result.path,
      triangles: result.triangles,
      bytes: result.size,
    }])),
  };
  const rigPath = path.join(ROOT, `public/assets/cars/rigs/${car.id}.json`);
  await fs.writeFile(rigPath, `${JSON.stringify(rig, null, 2)}\n`);

  car.master = `assets-src/cars/${sourceName}`;
  car.model = lodResults[0].path;
  car.masterFileSize = car.masterFileSize || car.fileSize;
  car.fileSize = formatBytes(lodResults[0].size);
  car.triangles = lodResults[0].triangles;
  car.normalized = true;
  car.dimensions = dimensions;
  car.rig = `assets/cars/rigs/${car.id}.json`;
  car.collision = rig.collision.path;
  car.lods = Object.fromEntries(Object.entries(lodResults).map(([level, result]) => [level, result.path]));
  car.lodTriangles = Object.fromEntries(Object.entries(lodResults).map(([level, result]) => [level, result.triangles]));
  car.credit.runtimeChanges = 'Master retained separately. Runtime copies are normalized to metres/Y-up/+Z-forward/ground-zero, Meshopt-compressed and WebP-textured. LOD1–3 are simplified derivatives; a convex collision hull and wheel-rig metadata were generated.';
  console.log(`${car.id}: ${wheels.length} wheels · ${dimensions.length} × ${dimensions.width} × ${dimensions.height} m · collision ${rig.collision.triangles} tris`);
}

const cars = only ? catalog.cars.filter((car) => car.id === only) : catalog.cars;
if (!cars.length) throw new Error(`No car matched ${only}`);
for (const car of cars) {
  console.log(`\nBuilding ${car.id}…`);
  await buildCar(car);
  await fs.writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

catalog.runtimeProfile = {
  masterDirectory: 'assets-src/cars',
  runtimeDirectory: 'public/assets/cars',
  normalized: true,
  units: 'metres',
  upAxis: '+Y',
  forwardAxis: '+Z',
  groundY: 0,
  geometryCompression: 'EXT_meshopt_compression',
  textureFormat: 'WebP',
  lodLevels: 4,
  collision: 'single convex hull per vehicle',
  rigMetadata: 'public/assets/cars/rigs',
};
await fs.writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
const licenseSummary = [
  'VELOCITY — VEHICLE ASSET ATTRIBUTION',
  '',
  'All 11 vehicles are CC BY 4.0. Attribution is required for masters, runtime derivatives, collision meshes and rendered previews.',
  'License: https://creativecommons.org/licenses/by/4.0/',
  '',
  'Runtime LODs are normalized to metres, Y-up, +Z-forward and ground-zero; Meshopt compressed and WebP textured.',
  'Untouched masters are stored outside the public runtime directory in assets-src/cars/.',
  'Collision meshes are basic convex hulls. Wheel-rig JSON is metadata for future driving-prototype tuning, not a completed physics setup.',
  '',
  ...catalog.cars.flatMap((car, index) => [
    `${String(index + 1).padStart(2, '0')}. ${car.name}`,
    `Source: ${car.credit.title} — ${car.credit.author}`,
    `License: ${car.credit.license}`,
    `Original record: ${car.credit.source}`,
    `Distribution: ${car.credit.distribution}`,
    `Master: ${car.master}`,
    `Runtime LOD0: public/${car.model}`,
    `Source/master changes: ${car.credit.changes}`,
    `Runtime changes: ${car.credit.runtimeChanges}`,
    ...(car.credit.notice ? [`Additional notice: ${car.credit.notice}`] : []),
    '',
  ]),
].join('\n');
await fs.writeFile(path.join(ROOT, 'public/assets/cars/LICENSES.txt'), `${licenseSummary.trimEnd()}\n`);
console.log(`\nBuilt ${cars.length} vehicle asset package${cars.length === 1 ? '' : 's'}.`);
