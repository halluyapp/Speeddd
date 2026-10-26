import fs from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const ROOT = process.cwd();
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/catalog.json'), 'utf8'));
const tracks = await Promise.all((catalog.tracks || []).map(async (entry) => JSON.parse(await fs.readFile(path.join(ROOT, 'public', entry.manifest), 'utf8'))));
const envelopes = {
  'azurline-circuit': { minLength: 2700, maxLength: 2900, width: 14, checkpoints: 12, elevation: 50, roles: ['road', 'markings', 'terrain', 'ocean', 'structures', 'vegetation', 'barriers'] },
  'kestrel-ridge': { minLength: 3100, maxLength: 3300, width: 12, checkpoints: 18, elevation: 75, roles: ['road', 'markings', 'terrain', 'mountains', 'structures', 'vegetation', 'barriers'] },
};
let failed = false;
let validated = 0;
let totalIssues = 0;

function readGlbJson(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error('Invalid GLB signature');
  const length = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
}
function triangles(document) {
  let count = 0;
  for (const mesh of document.meshes || []) for (const primitive of mesh.primitives || []) {
    if ((primitive.mode ?? 4) !== 4) continue;
    const accessor = document.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
    if (accessor) count += Math.floor(accessor.count / 3);
  }
  return count;
}
async function validateGlb(track, file, expectedLod, expectedRole, expectedTriangles = null) {
  const bytes = await fs.readFile(file);
  const document = readGlbJson(bytes);
  const count = triangles(document);
  const metadata = document.asset?.extras?.velocityTrack;
  if (metadata?.id !== track.id || metadata?.license !== 'CC0-1.0') throw new Error(`${file}: embedded track/CC0 record missing`);
  if (metadata?.lod !== expectedLod || metadata?.role !== expectedRole) throw new Error(`${file}: LOD/role metadata mismatch`);
  if (expectedTriangles !== null && count !== expectedTriangles) throw new Error(`${file}: expected ${expectedTriangles} triangles, found ${count}`);
  if (expectedRole === 'visual' && file.includes('/public/') && !(document.extensionsUsed || []).includes('EXT_meshopt_compression')) throw new Error(`${file}: runtime LOD is not Meshopt compressed`);
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: path.relative(ROOT, file), maxIssues: 200 });
  for (const issue of report.issues.messages.filter((message) => message.severity <= 1)) console.error(`  ${issue.code}: ${issue.message}`);
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
function distanceToCenterline(track, point) {
  let distance = Infinity;
  for (let index = 0; index < track.centerline.length - 1; index += 1) distance = Math.min(distance, pointSegmentDistance(point, track.centerline[index], track.centerline[index + 1]));
  return distance;
}

for (const track of tracks) {
  try {
    const envelope = envelopes[track.id];
    const catalogEntry = catalog.tracks.find((entry) => entry.id === track.id);
    if (!envelope || !catalogEntry || catalogEntry.manifest !== `assets/tracks/${track.id}.json`) throw new Error('Unknown environment or stale catalogue reference');
    if (!track.closed || track.gridCount !== 16 || track.checkpointCount !== envelope.checkpoints || track.roadWidth !== envelope.width) throw new Error('Track layout metadata is incomplete');
    if (track.length < envelope.minLength || track.length > envelope.maxLength || track.elevation.change < envelope.elevation) throw new Error('Track dimensions are outside its intended environment envelope');
    if (track.grid.length !== 16 || track.checkpoints.length !== envelope.checkpoints || track.sectors.length !== 3) throw new Error('Grid/checkpoint/sector inventory is stale');
    const first = track.centerline[0]; const last = track.centerline.at(-1);
    if (Math.hypot(...first.map((value, index) => value - last[index])) > 0.01) throw new Error('Centerline is not closed');
    for (const grid of track.grid) {
      if (distanceToCenterline(track, grid.position) > 3.2) throw new Error(`Grid slot ${grid.slot} is off the road centerline`);
      if (Math.abs(Math.hypot(...grid.forward) - 1) > 0.002) throw new Error(`Grid slot ${grid.slot} forward vector is invalid`);
    }
    let previousCheckpointDistance = -1;
    for (const [index, checkpoint] of track.checkpoints.entries()) {
      if (checkpoint.id !== index + 1 || distanceToCenterline(track, checkpoint.position) > 0.2) throw new Error(`Checkpoint ${checkpoint.id} is invalid or off the centerline`);
      if (checkpoint.halfWidth !== track.roadWidth / 2) throw new Error(`Checkpoint ${checkpoint.id} width mismatch`);
      const relative = (checkpoint.distance - track.start.distance + track.length) % track.length;
      if (relative <= previousCheckpointDistance || relative >= track.length) throw new Error('Checkpoints are not ordered around the lap');
      previousCheckpointDistance = relative;
    }
    if (Math.abs(track.sectors.reduce((sum, sector) => sum + sector.length, 0) - track.length) > 0.01) throw new Error('Sector lengths do not close the lap');
    if (track.id === 'kestrel-ridge') {
      if (track.technicalSections?.length !== 3 || track.technicalSections.some((section) => section.startCheckpoint < 1 || section.endCheckpoint > 18 || section.startCheckpoint > section.endCheckpoint)) throw new Error('Technical-section checkpoint references are invalid');
      if (!track.gallery?.openSides || track.gallery.clearHeight < 4.5 || track.gallery.masterPortals !== 6) throw new Error('Gallery clearance/presentation record is invalid');
    }

    const master = await validateGlb(track, path.join(ROOT, track.master), 0, 'visual', track.triangles);
    let issues = master.issues;
    const masterRoles = new Set((master.document.nodes || []).map((node) => node.extras?.velocityRole));
    for (const role of envelope.roles) if (!masterRoles.has(role)) throw new Error(`Master is missing environment role ${role}`);
    let previousTriangles = Infinity; let previousBytes = Infinity;
    for (const level of [0, 1, 2, 3]) {
      const result = await validateGlb(track, path.join(ROOT, 'public', track.lods[level]), level, 'visual', track.lodTriangles[level]);
      if (result.count >= previousTriangles || result.bytes >= previousBytes) throw new Error(`LOD${level} does not reduce geometry/bytes`);
      if (track[`lod${level}Bytes`] !== result.bytes) throw new Error(`LOD${level} byte count is stale`);
      previousTriangles = result.count; previousBytes = result.bytes; issues += result.issues;
      console.log(`${result.issues ? 'FAIL' : 'PASS'} ${track.id} LOD${level}  ${(result.bytes / 1e6).toFixed(1)} MB · ${result.count.toLocaleString()} tris`);
    }
    const collision = await validateGlb(track, path.join(ROOT, 'public', track.collision), null, 'collision', track.collisionTriangles);
    issues += collision.issues;
    if (collision.count >= track.lodTriangles[3]) throw new Error('Collision mesh is not simpler than LOD3');
    const collisionRoles = new Set((collision.document.nodes || []).map((node) => node.extras?.velocityRole));
    for (const role of ['collision-road', 'collision-terrain', 'collision-barriers']) if (!collisionRoles.has(role)) throw new Error(`Collision is missing ${role}`);
    const poster = await fs.stat(path.join(ROOT, 'public', track.preview));
    if (poster.size < 1000) throw new Error(`${track.preview} is missing or incomplete`);
    const license = await fs.stat(path.join(ROOT, 'public', track.licenseFile || 'assets/tracks/LICENSE.txt'));
    if (license.size < 100) throw new Error('CC0 license record is missing or incomplete');
    totalIssues += issues;
    if (issues) failed = true;
    console.log(`${issues ? 'FAIL' : 'PASS'} ${track.id} collision ${collision.count.toLocaleString()} tris · ${track.grid.length} grid slots · ${track.checkpoints.length} ordered checkpoints`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${track.id}: ${error.message}`);
  }
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} Validated ${validated} environment GLBs across ${tracks.length} tracks, plus layout metadata, licenses and posters. Khronos issues: ${totalIssues}.`);
if (failed) process.exitCode = 1;
