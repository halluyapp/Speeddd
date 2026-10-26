import fs from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const ROOT = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/combat/combat.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/catalog.json'), 'utf8'));
let failed = false;
let validated = 0;
let issueCount = 0;

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
    if (!mesh) continue;
    for (const primitive of mesh.primitives || []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessor = document.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
      if (accessor) count += Math.floor(accessor.count / 3);
    }
  }
  return count;
}
async function validateGlb(file, asset, expectedLod, expectedRole, expectedTriangles) {
  const bytes = await fs.readFile(file); const document = readGlbJson(bytes); const count = triangles(document); const metadata = document.asset?.extras?.velocityCombat;
  if (metadata?.pack !== manifest.id || metadata?.id !== asset.id || metadata?.license !== 'CC0-1.0') throw new Error(`${file}: embedded combat-pack/CC0 record missing`);
  if (metadata?.lod !== expectedLod || metadata?.role !== expectedRole) throw new Error(`${file}: LOD/role metadata mismatch`);
  if (metadata?.forwardAxis !== '+Z' || metadata?.upAxis !== '+Y') throw new Error(`${file}: coordinate convention missing`);
  if (count !== expectedTriangles) throw new Error(`${file}: expected ${expectedTriangles} triangles, found ${count}`);
  if (expectedRole === 'visual' && file.includes('/public/') && !(document.extensionsUsed || []).includes('EXT_meshopt_compression')) throw new Error(`${file}: runtime LOD is not Meshopt compressed`);
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: path.relative(ROOT, file), maxIssues: 200 });
  for (const issue of report.issues.messages.filter((message) => message.severity <= 1)) console.error(`  ${issue.code}: ${issue.message}`);
  validated += 1; issueCount += report.issues.numErrors + report.issues.numWarnings;
  return { document, count, bytes: bytes.length, issues: report.issues.numErrors + report.issues.numWarnings };
}
function requireRoles(document, roles) {
  const present = new Set((document.nodes || []).map((node) => node.extras?.velocityRole));
  for (const role of roles) if (!present.has(role)) throw new Error(`Missing required node role ${role}`);
}
function nearlyEqual(a, b) { return Math.abs(a - b) < 0.0001; }
function validateRig(asset, document) {
  const nodes = document.nodes || [];
  if (asset.kind === 'projectile') {
    requireRoles(document, ['projectile-root', 'guidance-socket', 'fuselage', 'control-fins']);
    if (asset.articulation !== null || asset.muzzles.length) throw new Error('Projectile should not contain turret articulation or muzzle sockets');
    return;
  }
  requireRoles(document, ['weapon-root', 'mount-socket', 'yaw-pivot', 'pitch-pivot', 'muzzle-socket']);
  const parents = new Map(); nodes.forEach((node, index) => (node.children || []).forEach((child) => parents.set(child, index)));
  for (const [key, config] of Object.entries(asset.articulation)) {
    const index = nodes.findIndex((node) => node.name === config.node && node.extras?.velocityRole === config.role);
    if (index < 0) throw new Error(`Missing ${key} articulation node ${config.node}`);
    const node = nodes[index];
    if (JSON.stringify(node.extras.axis) !== JSON.stringify(config.axis)) throw new Error(`${config.node}: axis mismatch`);
    if (!config.continuous && (node.extras.minDegrees !== config.minDegrees || node.extras.maxDegrees !== config.maxDegrees)) throw new Error(`${config.node}: motion limits mismatch`);
  }
  const muzzles = nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.extras?.velocityRole === 'muzzle-socket');
  if (muzzles.length !== asset.muzzles.length || new Set(muzzles.map(({ node }) => node.extras.muzzleIndex)).size !== asset.muzzles.length) throw new Error(`Expected ${asset.muzzles.length} unique muzzle sockets, found ${muzzles.length}`);
  for (const expected of asset.muzzles) {
    const found = muzzles.find(({ node }) => node.name === expected.name);
    if (!found) throw new Error(`Missing ${expected.name}`);
    const parentIndex = parents.get(found.index); const parentName = parentIndex === undefined ? null : nodes[parentIndex].name;
    if (parentName !== expected.parent) throw new Error(`${expected.name}: expected parent ${expected.parent}, found ${parentName}`);
    if (found.node.extras.direction?.join(',') !== '0,0,1') throw new Error(`${expected.name}: local direction must be +Z`);
    if (!(found.node.translation || [0, 0, 0]).every((value, index) => nearlyEqual(value, expected.position[index]))) throw new Error(`${expected.name}: position mismatch`);
  }
}

try {
  if (!catalog.combat?.some((entry) => entry.id === manifest.id && entry.manifest === 'assets/combat/combat.json' && entry.page === 'combat.html')) throw new Error('Main catalogue does not reference the combat package');
  if (manifest.assets.length !== 5 || manifest.assets.filter((asset) => asset.kind === 'turret').length !== 4 || manifest.assets.filter((asset) => asset.kind === 'projectile').length !== 1) throw new Error('Combat package inventory is incomplete');
  if (manifest.units !== 'metres' || manifest.upAxis !== '+Y' || manifest.forwardAxis !== '+Z') throw new Error('Combat coordinate conventions are incomplete');
  for (const asset of manifest.assets) {
    try {
      const master = await validateGlb(path.join(ROOT, asset.master), asset, 0, 'visual', asset.triangles); validateRig(asset, master.document);
      if (asset.bounds.size.some((value) => value <= 0)) throw new Error('Invalid master bounds');
      if (asset.kind === 'turret' && Math.abs(asset.bounds.min[1]) > 0.03) throw new Error('Turret roof mount is not at ground zero');
      if (asset.kind === 'projectile' && asset.bounds.center.some((value) => Math.abs(value) > 0.002)) throw new Error('Projectile is not centered on its geometric bounds');
      let previous = Infinity;
      for (const level of [0, 1, 2, 3]) {
        const result = await validateGlb(path.join(ROOT, 'public', asset.lods[level]), asset, level, 'visual', asset.lodTriangles[level]);
        if (result.count >= previous) throw new Error(`LOD${level} does not reduce geometry`);
        if (asset[`lod${level}Bytes`] !== result.bytes) throw new Error(`LOD${level} byte count is stale`);
        validateRig(asset, result.document); previous = result.count;
        console.log(`${result.issues ? 'FAIL' : 'PASS'} ${asset.id} LOD${level}  ${(result.bytes / 1024).toFixed(0)} KB · ${result.count.toLocaleString()} tris`);
      }
      const collision = await validateGlb(path.join(ROOT, 'public', asset.collision), asset, null, 'collision', asset.collisionTriangles);
      if (!(collision.document.nodes || []).some((node) => node.extras?.velocityRole?.startsWith('collision-'))) throw new Error('Collision role is missing');
      if (collision.count >= asset.lodTriangles[3]) throw new Error('Collision is not simpler than LOD3');
      if (asset.collisionBytes !== collision.bytes) throw new Error('Collision byte count is stale');
      const thumbnail = await fs.stat(path.join(ROOT, 'public', asset.thumbnail)); if (thumbnail.size < 500) throw new Error('Thumbnail is missing');
      console.log(`${collision.issues ? 'FAIL' : 'PASS'} ${asset.id} collision ${collision.count} tris`);
    } catch (error) { failed = true; console.error(`FAIL ${asset.id}: ${error.message}`); }
  }
  const preview = await fs.stat(path.join(ROOT, 'public', manifest.preview)); if (preview.size < 1000) throw new Error('Combat poster is missing');
  if (!manifest.gameplayNote.includes('No firing') || !manifest.gameplayNote.includes('damage') || !manifest.gameplayNote.includes('combat gameplay')) throw new Error('Asset-only combat scope is not explicit');
  const [html, script] = await Promise.all([fs.readFile(path.join(ROOT, 'combat.html'), 'utf8'), fs.readFile(path.join(ROOT, 'src/combat.js'), 'utf8')]);
  if (/unpkg|jsdelivr|googleapis|raw\.usercontent/i.test(`${html}\n${script}`)) throw new Error('Combat inspector has a remote runtime dependency');
  for (const required of ['YawPivot', 'PitchPivot', 'combat.json']) if (!script.includes(required)) throw new Error(`Inspector does not expose ${required}`);
} catch (error) { failed = true; console.error(`FAIL ${manifest.id}: ${error.message}`); }

if (issueCount) failed = true;
console.log(`\nValidated ${validated} combat GLBs (5 masters + 20 LODs + 5 collision), rigs, sockets, thumbnails and poster.`);
console.log(`${issueCount ? 'FAIL' : 'PASS'} Khronos validation issues: ${issueCount}`);
if (failed) process.exitCode = 1;
