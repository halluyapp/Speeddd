import fs from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const ROOT = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/drivers/drivers.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/catalog.json'), 'utf8'));
let failed = false;
let validated = 0;
let issueCount = 0;
const clipDefinitions = new Map(manifest.assets[0]?.animations.map((clip) => [clip.name, clip]));

function readGlbJson(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error('Invalid GLB signature');
  const length = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
}
function triangles(document) {
  let count = 0;
  for (const node of document.nodes || []) {
    if (!Number.isInteger(node.mesh)) continue;
    const mesh = document.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives || []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessor = document.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
      if (accessor) count += Math.floor(accessor.count / 3);
    }
  }
  return count;
}
function validateRigAndClips(asset, document) {
  const nodes = document.nodes || [];
  const root = nodes.find((node) => node.name === asset.rig.root && node.extras?.velocityRole === 'driver-root');
  if (!root || root.extras.fictional !== true || root.extras.rigType !== 'rigid-articulated') throw new Error('Fictional rigid DriverRoot is missing');
  for (const name of asset.rig.joints) {
    const matches = nodes.filter((node) => node.name === name && node.extras?.velocityRole === 'driver-joint' && node.extras?.joint === name);
    if (matches.length !== 1) throw new Error(`Expected one articulated joint ${name}`);
  }
  const roles = new Set(nodes.map((node) => node.extras?.velocityRole));
  for (const role of ['suit', 'driver-visor', 'helmet-shell', 'gloves', 'boots', 'harness']) if (!roles.has(role)) throw new Error(`Missing character surface role ${role}`);
  if (!Array.isArray(document.animations) || document.animations.length !== 4) throw new Error('Expected four embedded animation clips');
  for (const expected of asset.animations) {
    const animation = document.animations.find((clip) => clip.name === expected.name);
    if (!animation) throw new Error(`Missing animation clip ${expected.name}`);
    if (animation.channels.length !== asset.rig.trackCount) throw new Error(`${expected.name}: expected ${asset.rig.trackCount} channels`);
    let duration = 0;
    for (const sampler of animation.samplers) {
      const input = document.accessors?.[sampler.input];
      if (!input?.max?.length) throw new Error(`${expected.name}: animation timing accessor is incomplete`);
      duration = Math.max(duration, input.max[0]);
    }
    if (Math.abs(duration - expected.duration) > 0.001) throw new Error(`${expected.name}: expected ${expected.duration}s, found ${duration}s`);
    for (const channel of animation.channels) {
      const target = nodes[channel.target?.node];
      if (!target || channel.target.path === 'rotation' && !asset.rig.joints.includes(target.name)) throw new Error(`${expected.name}: invalid rotation target`);
      if (channel.target.path === 'translation' && target.name !== 'Pelvis') throw new Error(`${expected.name}: invalid translation target`);
    }
  }
}
async function validateGlb(file, asset, expectedLod, expectedRole, expectedTriangles) {
  const bytes = await fs.readFile(file); const document = readGlbJson(bytes); const count = triangles(document);
  const metadata = document.asset?.extras?.velocityDriver;
  if (metadata?.pack !== manifest.id || metadata?.id !== asset.id || metadata?.license !== 'CC0-1.0') throw new Error(`${file}: embedded driver-pack/CC0 record missing`);
  if (metadata?.lod !== expectedLod || metadata?.role !== expectedRole || metadata?.forwardAxis !== '+Z' || metadata?.upAxis !== '+Y') throw new Error(`${file}: LOD/role/convention metadata mismatch`);
  if (count !== expectedTriangles) throw new Error(`${file}: expected ${expectedTriangles} triangles, found ${count}`);
  if (expectedRole === 'visual' && file.includes('/public/') && !(document.extensionsUsed || []).includes('EXT_meshopt_compression')) throw new Error(`${file}: runtime LOD is not Meshopt compressed`);
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: path.relative(ROOT, file), maxIssues: 200 });
  for (const issue of report.issues.messages.filter((message) => message.severity <= 1)) console.error(`  ${issue.code}: ${issue.message}`);
  validated += 1; issueCount += report.issues.numErrors + report.issues.numWarnings;
  return { document, count, bytes: bytes.length, issues: report.issues.numErrors + report.issues.numWarnings };
}

try {
  if (!catalog.drivers?.some((entry) => entry.id === manifest.id && entry.manifest === 'assets/drivers/drivers.json' && entry.page === 'drivers.html')) throw new Error('Main catalogue does not reference the driver package');
  if (manifest.assets.length !== 3 || manifest.cinematics.length !== 4 || manifest.assets.some((asset) => !asset.fictional)) throw new Error('Fictional driver/cinematic inventory is incomplete');
  if (manifest.units !== 'metres' || manifest.upAxis !== '+Y' || manifest.forwardAxis !== '+Z') throw new Error('Driver coordinate conventions are incomplete');
  for (const asset of manifest.assets) {
    try {
      if (asset.rig.jointCount !== 17 || asset.rig.joints.length !== 17 || asset.rig.trackCount !== 18 || asset.animations.length !== 4) throw new Error('Rig/clip manifest counts are stale');
      const master = await validateGlb(path.join(ROOT, asset.master), asset, 0, 'visual', asset.triangles); validateRigAndClips(asset, master.document);
      if (Math.abs(asset.bounds.min[1]) > 0.03 || Math.abs(asset.bounds.size[1] - asset.height) > 0.002 || asset.height < 1.7 || asset.height > 2.2) throw new Error('Driver ground-zero/height bounds are invalid');
      if (asset.capsule.height !== asset.height || asset.capsule.radius <= 0) throw new Error('Capsule dimensions do not match the driver');
      let previousTriangles = Infinity; let previousBytes = Infinity;
      for (const level of [0, 1, 2, 3]) {
        const result = await validateGlb(path.join(ROOT, 'public', asset.lods[level]), asset, level, 'visual', asset.lodTriangles[level]);
        if (result.count >= previousTriangles || result.bytes >= previousBytes) throw new Error(`LOD${level} does not reduce geometry/bytes`);
        if (asset[`lod${level}Bytes`] !== result.bytes) throw new Error(`LOD${level} byte count is stale`);
        validateRigAndClips(asset, result.document); previousTriangles = result.count; previousBytes = result.bytes;
        console.log(`${result.issues ? 'FAIL' : 'PASS'} ${asset.id} LOD${level}  ${(result.bytes / 1024).toFixed(0)} KB · ${result.count.toLocaleString()} tris`);
      }
      const collision = await validateGlb(path.join(ROOT, 'public', asset.collision), asset, null, 'collision', asset.collisionTriangles);
      if (!(collision.document.nodes || []).some((node) => node.extras?.velocityRole === 'collision-capsule')) throw new Error('Capsule collision role is missing');
      if (collision.count >= asset.lodTriangles[3] || asset.collisionBytes !== collision.bytes) throw new Error('Capsule simplicity/byte record is stale');
      const thumbnail = await fs.stat(path.join(ROOT, 'public', asset.thumbnail)); if (thumbnail.size < 500) throw new Error('Driver thumbnail is missing');
    } catch (error) { failed = true; console.error(`FAIL ${asset.id}: ${error.message}`); }
  }
  const trackIds = new Set((catalog.tracks || []).map((track) => track.id));
  for (const shot of manifest.cinematics) {
    const clip = clipDefinitions.get(shot.clip);
    if (!clip || !trackIds.has(shot.environmentId) || shot.duration !== clip.duration || shot.loop !== clip.loop) throw new Error(`${shot.id}: clip/environment reference mismatch`);
    if (shot.camera.position.length !== 3 || shot.camera.target.length !== 3 || ![...shot.camera.position, ...shot.camera.target, shot.camera.fov].every(Number.isFinite) || shot.camera.fov < 20 || shot.camera.fov > 70) throw new Error(`${shot.id}: invalid camera fixture`);
  }
  for (const relative of [manifest.preview, 'assets/drivers/LICENSE.txt']) { const stat = await fs.stat(path.join(ROOT, 'public', relative)); if (stat.size < 100) throw new Error(`${relative} is missing`); }
  if (!manifest.gameplayNote.includes('No locomotion') || !manifest.gameplayNote.includes('seat constraints') || !manifest.gameplayNote.includes('racing logic')) throw new Error('Presentation-only character scope is not explicit');
  const [html, script] = await Promise.all([fs.readFile(path.join(ROOT, 'drivers.html'), 'utf8'), fs.readFile(path.join(ROOT, 'src/drivers.js'), 'utf8')]);
  if (/unpkg|jsdelivr|googleapis|raw\.githubusercontent/i.test(`${html}\n${script}`)) throw new Error('Driver inspector has a remote runtime dependency');
  for (const required of ['AnimationMixer', 'clipAction', 'drivers.json']) if (!script.includes(required)) throw new Error(`Inspector does not expose actual ${required} playback`);
  for (const id of ['driver-asset-list', 'driver-shot-list', 'driver-lod-list', 'driver-timeline', 'download-driver-model']) if (!html.includes(`id="${id}"`)) throw new Error(`Inspector control ${id} is missing`);
} catch (error) { failed = true; console.error(`FAIL ${manifest.id}: ${error.message}`); }

if (issueCount) failed = true;
console.log(`\n${failed ? 'FAIL' : 'PASS'} Validated ${validated} driver GLBs (3 masters + 12 LODs + 3 capsules), rigs, clips, fixtures and inspector. Khronos issues: ${issueCount}.`);
if (failed) process.exitCode = 1;
