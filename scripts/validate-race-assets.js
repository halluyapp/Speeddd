import fs from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const ROOT = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/race/race-presentation.json'), 'utf8'));
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
  const bytes = await fs.readFile(file);
  const document = readGlbJson(bytes);
  const count = triangles(document);
  const metadata = document.asset?.extras?.velocityRace;
  if (metadata?.pack !== manifest.id || metadata?.id !== asset.id || metadata?.license !== 'CC0-1.0') {
    throw new Error(`${file}: embedded race-pack/CC0 record missing`);
  }
  if (metadata?.lod !== expectedLod || metadata?.role !== expectedRole) throw new Error(`${file}: LOD/role metadata mismatch`);
  if (count !== expectedTriangles) throw new Error(`${file}: expected ${expectedTriangles} triangles, found ${count}`);
  if (expectedRole === 'visual' && file.includes('/public/') && !(document.extensionsUsed || []).includes('EXT_meshopt_compression')) {
    throw new Error(`${file}: runtime LOD is not Meshopt compressed`);
  }
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: path.relative(ROOT, file), maxIssues: 200 });
  for (const issue of report.issues.messages.filter((message) => message.severity <= 1)) {
    console.error(`  ${issue.code}: ${issue.message}`);
  }
  validated += 1;
  issueCount += report.issues.numErrors + report.issues.numWarnings;
  return { document, count, bytes: bytes.length, issues: report.issues.numErrors + report.issues.numWarnings };
}

function requireRoles(document, roles) {
  const present = new Set((document.nodes || []).map((node) => node.extras?.velocityRole));
  for (const role of roles) if (!present.has(role)) throw new Error(`Missing required node role ${role}`);
}

function validateControls(asset, document) {
  const nodes = document.nodes || [];
  if (asset.control.type === 'start-lights') {
    const lamps = nodes.filter((node) => node.extras?.velocityRole === 'start-light');
    const keys = new Set(lamps.map((node) => `${node.extras.startLightIndex}:${node.extras.startLightRow}`));
    if (lamps.length !== 10 || keys.size !== 10) throw new Error(`Expected ten unique addressable start lenses, found ${lamps.length}/${keys.size}`);
    for (const node of lamps) {
      if (!Number.isInteger(node.extras.startLightIndex) || node.extras.startLightIndex < 0 || node.extras.startLightIndex > 4) throw new Error('Invalid start-light index');
      if (![0, 1].includes(node.extras.startLightRow)) throw new Error('Invalid start-light row');
    }
  } else if (asset.control.type === 'flag-display') {
    if (!nodes.some((node) => node.extras?.flagDisplay === true && node.extras?.velocityRole === 'flag-display')) throw new Error('Addressable marshal display is missing');
  }
}

try {
  if (!catalog.presentation?.some((entry) => entry.id === manifest.id && entry.manifest === 'assets/race/race-presentation.json' && entry.page === 'race.html')) {
    throw new Error('Main catalogue does not reference the race presentation package');
  }
  if (manifest.assets.length !== 3 || Object.keys(manifest.graphics.flags).length !== 7) throw new Error('Presentation package inventory is incomplete');
  if (manifest.units !== 'metres' || manifest.upAxis !== '+Y' || manifest.forwardAxis !== '+Z' || !manifest.groundZero) throw new Error('Presentation conventions are incomplete');

  for (const asset of manifest.assets) {
    try {
      const master = await validateGlb(path.join(ROOT, asset.master), asset, 0, 'visual', asset.triangles);
      requireRoles(master.document, asset.id === 'race-start-lights' ? ['frame', 'housing', 'start-light'] : asset.id === 'race-timing-pylon' ? ['frame', 'screen', 'display-text'] : ['frame', 'housing', 'flag-display']);
      validateControls(asset, master.document);
      if (Math.abs(asset.bounds.min[1]) > 0.03 || asset.bounds.size.some((value) => value <= 0)) throw new Error('Ground-zero placement or bounds are invalid');
      let previous = Infinity;
      for (const level of [0, 1, 2, 3]) {
        const result = await validateGlb(path.join(ROOT, 'public', asset.lods[level]), asset, level, 'visual', asset.lodTriangles[level]);
        if (result.count >= previous) throw new Error(`LOD${level} does not reduce geometry`);
        if (asset[`lod${level}Bytes`] !== result.bytes) throw new Error(`LOD${level} byte count is stale`);
        requireRoles(result.document, asset.id === 'race-start-lights' ? ['start-light'] : asset.id === 'race-timing-pylon' ? ['screen'] : ['flag-display']);
        validateControls(asset, result.document);
        previous = result.count;
        console.log(`${result.issues ? 'FAIL' : 'PASS'} ${asset.id} LOD${level}  ${(result.bytes / 1024).toFixed(0)} KB · ${result.count.toLocaleString()} tris`);
      }
      const collision = await validateGlb(path.join(ROOT, 'public', asset.collision), asset, null, 'collision', asset.collisionTriangles);
      requireRoles(collision.document, ['collision-structure']);
      if (collision.count >= asset.lodTriangles[3]) throw new Error('Collision is not simpler than LOD3');
      if (asset.collisionBytes !== collision.bytes) throw new Error('Collision byte count is stale');
      console.log(`${collision.issues ? 'FAIL' : 'PASS'} ${asset.id} collision ${collision.count} tris`);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${asset.id}: ${error.message}`);
    }
  }

  for (const [flag, relative] of Object.entries(manifest.graphics.flags)) {
    const source = await fs.readFile(path.join(ROOT, 'public', relative), 'utf8');
    if (!source.includes('<svg') || /(?:href|src)=["']https?:/i.test(source)) throw new Error(`Flag ${flag} is not a local standalone SVG`);
  }
  const icons = await fs.readFile(path.join(ROOT, 'public', manifest.graphics.iconSprite), 'utf8');
  for (const id of ['flag', 'play', 'timer', 'download']) if (!icons.includes(`id="${id}"`)) throw new Error(`Icon ${id} is missing`);
  for (const [name, config] of Object.entries(manifest.demo.states)) {
    if (!manifest.graphics.flags[config.flag] || !config.status || !config.message || !/^#[0-9a-f]{6}$/i.test(config.panelColor)) throw new Error(`State ${name} is incomplete`);
  }
  if (manifest.demo.standings.length !== 8 || new Set(manifest.demo.standings.map((entry) => entry.position)).size !== 8) throw new Error('Demo timing fixture is invalid');
  if (!manifest.demo.disclaimer.includes('No live timing') || !manifest.gameplayNote.includes('No driving')) throw new Error('Presentation-only scope is not explicit');
  const preview = await fs.stat(path.join(ROOT, 'public', manifest.preview));
  if (preview.size < 1000) throw new Error('Presentation poster is missing');
} catch (error) {
  failed = true;
  console.error(`FAIL ${manifest.id}: ${error.message}`);
}

if (issueCount) failed = true;
console.log(`\nValidated ${validated} race-presentation GLBs, 7 flag graphics, icon sprite, demo fixtures and poster.`);
console.log(`${issueCount ? 'FAIL' : 'PASS'} Khronos validation issues: ${issueCount}`);
if (failed) process.exitCode = 1;
