import fs from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const ROOT = process.cwd();
const manifestPath = path.join(ROOT, 'public/assets/tracks/azurline-circuit.json');
const track = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/catalog.json'), 'utf8'));
let failed = false;
let validated = 0;

function readGlbJson(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error('Invalid GLB signature');
  const length = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
}

function triangles(document) {
  let count = 0;
  for (const mesh of document.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessor = document.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
      if (accessor) count += Math.floor(accessor.count / 3);
    }
  }
  return count;
}

async function validateGlb(file, expectedLod, expectedRole, expectedTriangles = null) {
  const bytes = await fs.readFile(file);
  const document = readGlbJson(bytes);
  const count = triangles(document);
  const metadata = document.asset?.extras?.velocityTrack;
  if (metadata?.id !== track.id || metadata?.license !== 'CC0-1.0') throw new Error(`${file}: embedded track/CC0 record missing`);
  if (metadata?.lod !== expectedLod || metadata?.role !== expectedRole) throw new Error(`${file}: LOD/role metadata mismatch`);
  if (expectedTriangles !== null && count !== expectedTriangles) throw new Error(`${file}: expected ${expectedTriangles} triangles, found ${count}`);
  if (expectedRole === 'visual' && file.includes('/public/') && !(document.extensionsUsed || []).includes('EXT_meshopt_compression')) {
    throw new Error(`${file}: runtime LOD is not Meshopt compressed`);
  }
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: path.relative(ROOT, file), maxIssues: 200 });
  for (const issue of report.issues.messages.filter((message) => message.severity <= 1)) {
    console.error(`  ${issue.code}: ${issue.message}`);
  }
  validated += 1;
  return { document, count, bytes: bytes.length, issues: report.issues.numErrors + report.issues.numWarnings };
}

function pointSegmentDistance(point, a, b) {
  const ab = b.map((value, index) => value - a[index]);
  const ap = point.map((value, index) => value - a[index]);
  const denominator = ab.reduce((sum, value) => sum + value * value, 0);
  const t = denominator ? Math.max(0, Math.min(1, ap.reduce((sum, value, index) => sum + value * ab[index], 0) / denominator)) : 0;
  const closest = a.map((value, index) => value + ab[index] * t);
  return Math.hypot(...point.map((value, index) => value - closest[index]));
}

function distanceToCenterline(point) {
  let distance = Infinity;
  for (let index = 0; index < track.centerline.length - 1; index += 1) {
    distance = Math.min(distance, pointSegmentDistance(point, track.centerline[index], track.centerline[index + 1]));
  }
  return distance;
}

try {
  if (!catalog.tracks?.some((entry) => entry.id === track.id && entry.manifest === `assets/tracks/${track.id}.json`)) {
    throw new Error('Main catalogue does not reference the track manifest');
  }
  if (!track.closed || track.gridCount !== 16 || track.checkpointCount !== 12 || track.roadWidth !== 14) {
    throw new Error('Track layout metadata is incomplete');
  }
  if (track.length < 2700 || track.length > 2900 || track.elevation.change < 50) {
    throw new Error('Track dimensions are outside the intended coastal-circuit envelope');
  }
  const first = track.centerline[0];
  const last = track.centerline.at(-1);
  if (Math.hypot(...first.map((value, index) => value - last[index])) > 0.01) throw new Error('Centerline is not closed');
  for (const grid of track.grid) {
    if (distanceToCenterline(grid.position) > 3.2) throw new Error(`Grid slot ${grid.slot} is off the road centerline`);
    if (Math.abs(Math.hypot(...grid.forward) - 1) > 0.002) throw new Error(`Grid slot ${grid.slot} forward vector is invalid`);
  }
  for (const checkpoint of track.checkpoints) {
    if (distanceToCenterline(checkpoint.position) > 0.2) throw new Error(`Checkpoint ${checkpoint.id} is off the road centerline`);
    if (checkpoint.halfWidth !== track.roadWidth / 2) throw new Error(`Checkpoint ${checkpoint.id} width mismatch`);
  }
  if (Math.abs(track.sectors.reduce((sum, sector) => sum + sector.length, 0) - track.length) > 0.01) {
    throw new Error('Sector lengths do not close the lap');
  }

  const master = await validateGlb(path.join(ROOT, track.master), 0, 'visual', track.triangles);
  let issues = master.issues;
  const requiredRoles = new Set(['road', 'markings', 'terrain', 'ocean', 'structures', 'vegetation', 'barriers']);
  const masterRoles = new Set((master.document.nodes || []).map((node) => node.extras?.velocityRole));
  for (const role of requiredRoles) {
    if (!masterRoles.has(role)) throw new Error(`Master is missing environment role ${role}`);
  }

  let previous = Infinity;
  for (const level of [0, 1, 2, 3]) {
    const result = await validateGlb(path.join(ROOT, 'public', track.lods[level]), level, 'visual', track.lodTriangles[level]);
    if (result.count >= previous) throw new Error(`LOD${level} does not reduce geometry`);
    if (track[`lod${level}Bytes`] !== result.bytes) throw new Error(`LOD${level} byte count is stale`);
    previous = result.count;
    issues += result.issues;
    console.log(`${result.issues ? 'FAIL' : 'PASS'} ${track.id} LOD${level}  ${(result.bytes / 1e6).toFixed(1)} MB · ${result.count.toLocaleString()} tris`);
  }
  const collision = await validateGlb(path.join(ROOT, 'public', track.collision), null, 'collision', track.collisionTriangles);
  issues += collision.issues;
  if (collision.count >= track.lodTriangles[3]) throw new Error('Collision mesh is not simpler than LOD3');
  const collisionRoles = new Set((collision.document.nodes || []).map((node) => node.extras?.velocityRole));
  for (const role of ['collision-road', 'collision-terrain', 'collision-barriers']) {
    if (!collisionRoles.has(role)) throw new Error(`Collision is missing ${role}`);
  }
  const preview = await fs.stat(path.join(ROOT, 'public', track.preview));
  if (preview.size < 1000) throw new Error('Track poster is missing');
  if (issues) failed = true;
  console.log(`${issues ? 'FAIL' : 'PASS'} collision ${(collision.bytes / 1e6).toFixed(2)} MB · ${collision.count.toLocaleString()} tris`);
  console.log(`PASS ${track.grid.length} grid slots and ${track.checkpoints.length} checkpoints lie on the closed centerline`);
} catch (error) {
  failed = true;
  console.error(`FAIL ${track.id}: ${error.message}`);
}

console.log(`\nValidated ${validated} coastal-track GLBs plus layout metadata and poster.`);
if (failed) process.exitCode = 1;
