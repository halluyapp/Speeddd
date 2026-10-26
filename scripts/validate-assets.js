import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import validator from 'gltf-validator';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

const root = process.cwd();
const catalog = JSON.parse(await fs.readFile(path.join(root, 'public/assets/catalog.json'), 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;
let failed = false;
let validatedGlbCount = 0;

function readGlbJson(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error('Invalid GLB signature');
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.toString('utf8', 16, 20) !== 'JSON') throw new Error('Missing GLB JSON chunk');
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

function triangleCount(document) {
  let triangles = 0;
  for (const mesh of document.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const accessor = document.accessors?.[accessorIndex];
      if (accessor) triangles += Math.floor(accessor.count / 3);
    }
  }
  return triangles;
}

async function validateGlb(bytes, uri) {
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri, maxIssues: 200 });
  const { numErrors, numWarnings } = report.issues;
  for (const issue of report.issues.messages.filter((message) => message.severity <= 1)) {
    console.error(`  ${uri}: ${issue.code}: ${issue.message}`);
  }
  validatedGlbCount += 1;
  return numErrors + numWarnings;
}

function isHidden(node, hiddenNames) {
  for (let current = node; current; current = current.getParentNode()) {
    if (hiddenNames.some((name) => current.getName().includes(name))) return true;
  }
  return false;
}

async function measureRuntime(car) {
  const document = await io.read(path.join(root, 'public', car.model));
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const element = [];
  for (const scene of document.getRoot().listScenes()) {
    scene.traverse((node) => {
      if (isHidden(node, car.hideNodes || []) || !node.getMesh()) return;
      matrix.fromArray(node.getWorldMatrix());
      for (const primitive of node.getMesh().listPrimitives()) {
        const position = primitive.getAttribute('POSITION');
        if (!position) continue;
        const array = position.getArray();
        const fast = array instanceof Float32Array && !position.getNormalized();
        for (let index = 0; index < position.getCount(); index += 1) {
          if (fast) point.set(array[index * 3], array[index * 3 + 1], array[index * 3 + 2]);
          else {
            position.getElement(index, element);
            point.set(element[0], element[1], element[2]);
          }
          box.expandByPoint(point.applyMatrix4(matrix));
        }
      }
    });
  }
  if (box.isEmpty()) throw new Error('No visible runtime geometry');
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { box, size, center };
}

function assertClose(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected.toFixed(4)} ± ${tolerance}, received ${actual.toFixed(4)}`);
  }
}

function validateRig(rig, car) {
  if (rig.id !== car.id || !rig.normalized || rig.units !== 'metres' || rig.upAxis !== '+Y' || rig.forwardAxis !== '+Z') {
    throw new Error('Rig normalization metadata is incomplete');
  }
  if (rig.wheels?.length !== 4) throw new Error(`Rig has ${rig.wheels?.length || 0} wheels instead of four`);
  const ids = new Set(rig.wheels.map((wheel) => wheel.id));
  for (const id of ['FL', 'FR', 'RL', 'RR']) {
    if (!ids.has(id)) throw new Error(`Rig is missing wheel ${id}`);
  }
  for (const wheel of rig.wheels) {
    if (!wheel.sourceNode || wheel.position?.length !== 3 || wheel.position.some((value) => !Number.isFinite(value))) {
      throw new Error(`Wheel ${wheel.id} has invalid source/position metadata`);
    }
    if (!(wheel.radius > 0.1 && wheel.radius < 0.8 && wheel.width > 0.05 && wheel.width < 1)) {
      throw new Error(`Wheel ${wheel.id} has implausible dimensions`);
    }
    if (wheel.id[0] === 'F' && wheel.position[2] <= 0) throw new Error(`${wheel.id} is not on the +Z front axle`);
    if (wheel.id[0] === 'R' && wheel.position[2] >= 0) throw new Error(`${wheel.id} is not on the rear axle`);
    if (wheel.id[1] === 'L' && wheel.position[0] <= 0) throw new Error(`${wheel.id} is not on the left side`);
    if (wheel.id[1] === 'R' && wheel.position[0] >= 0) throw new Error(`${wheel.id} is not on the right side`);
  }
  if (rig.collision?.path !== car.collision || rig.collision.shape !== 'convex-hull') {
    throw new Error('Rig collision reference is inconsistent');
  }
}

for (const car of catalog.cars) {
  try {
    if (!car.normalized || !car.master?.startsWith('assets-src/cars/')) throw new Error('Master/runtime split metadata is missing');
    const modelPath = path.join(root, 'public', car.model);
    const previewPath = path.join(root, 'public', car.preview);
    const masterPath = path.join(root, car.master);
    const rigPath = path.join(root, 'public', car.rig);
    const [preview, masterBytes, rigBytes] = await Promise.all([
      fs.readFile(previewPath),
      fs.readFile(masterPath),
      fs.readFile(rigPath),
    ]);
    if (preview.length < 100) throw new Error('Preview image is empty');
    const masterDocument = readGlbJson(masterBytes);
    if (!masterDocument.asset?.copyright?.includes(car.credit.license)) throw new Error('Master attribution is missing');
    const rig = JSON.parse(rigBytes.toString('utf8'));
    validateRig(rig, car);

    let issueCount = 0;
    let previousTriangles = Infinity;
    let lod0Bytes = 0;
    const wheelNames = rig.wheels.map((wheel) => wheel.sourceNode);
    for (const level of [0, 1, 2, 3]) {
      const lodPath = car.lods?.[level];
      if (!lodPath) throw new Error(`LOD${level} path is missing`);
      const bytes = await fs.readFile(path.join(root, 'public', lodPath));
      if (level === 0) lod0Bytes = bytes.length;
      const document = readGlbJson(bytes);
      const actualTriangles = triangleCount(document);
      const expectedTriangles = level === 0 ? car.triangles : car.lodTriangles[level];
      if (actualTriangles !== expectedTriangles || car.lodTriangles[level] !== actualTriangles) {
        throw new Error(`LOD${level} triangle count ${actualTriangles} does not match catalogue ${expectedTriangles}`);
      }
      if (actualTriangles >= previousTriangles) throw new Error(`LOD${level} does not reduce geometry`);
      previousTriangles = actualTriangles;
      const metadata = document.asset?.extras?.velocityCollection;
      if (metadata?.assetId !== car.id || metadata?.lod !== level || !metadata?.normalized) {
        throw new Error(`LOD${level} embedded Velocity/runtime record is missing`);
      }
      if (!document.asset?.copyright?.includes(car.credit.license)) throw new Error(`LOD${level} license copyright is missing`);
      if (!(document.extensionsUsed || []).includes('EXT_meshopt_compression')) throw new Error(`LOD${level} is not Meshopt compressed`);
      if ((document.images || []).some((image) => image.mimeType && image.mimeType !== 'image/webp')) {
        throw new Error(`LOD${level} contains a non-WebP runtime texture`);
      }
      const nodeNames = new Set((document.nodes || []).map((node) => node.name));
      for (const wheelName of wheelNames) {
        if (!nodeNames.has(wheelName)) throw new Error(`LOD${level} lost wheel node ${wheelName}`);
      }
      issueCount += await validateGlb(bytes, lodPath);
    }

    const collisionBytes = await fs.readFile(path.join(root, 'public', car.collision));
    const collisionDocument = readGlbJson(collisionBytes);
    const collisionTriangles = triangleCount(collisionDocument);
    const collisionMetadata = collisionDocument.asset?.extras?.velocityCollection;
    if (collisionMetadata?.assetId !== car.id || collisionMetadata?.role !== 'collision' || collisionMetadata?.shape !== 'convex-hull') {
      throw new Error('Collision metadata is missing');
    }
    if (collisionTriangles !== rig.collision.triangles || collisionTriangles >= car.lodTriangles[3]) {
      throw new Error(`Collision triangle count ${collisionTriangles} is inconsistent or too complex`);
    }
    issueCount += await validateGlb(collisionBytes, car.collision);

    const { box, size, center } = await measureRuntime(car);
    assertClose(size.z, car.length, 0.03, 'Baked length');
    assertClose(size.x, car.dimensions.width, 0.03, 'Baked width');
    assertClose(size.y, car.dimensions.height, 0.03, 'Baked height');
    assertClose(box.min.y, 0, 0.02, 'Ground minimum');
    assertClose(center.x, 0, 0.02, 'Horizontal center X');
    assertClose(center.z, 0, 0.02, 'Horizontal center Z');
    if (issueCount) failed = true;
    console.log(`${issueCount ? 'FAIL' : 'PASS'} ${car.id.padEnd(18)} ${formatBytes(lod0Bytes).padStart(8)} · 4 LODs · ${collisionTriangles.toString().padStart(4)} collision tris · 4 wheels · baked bounds`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${car.id}: ${error.message}`);
  }
}

console.log(`\nValidated ${catalog.cars.length} masters/rigs/previews and ${validatedGlbCount} runtime GLBs (44 LODs + 11 collision meshes).`);
if (failed) process.exitCode = 1;

function formatBytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
