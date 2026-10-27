import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await fs.readFile(new URL('../public/assets/combat/combat.json', import.meta.url), 'utf8'));

test('catalogue indexes five original combat models and every source/runtime file is local', async () => {
  assert.ok(catalog.version >= 5);
  assert.deepEqual(catalog.combat, [{ id: 'velocity-combat-kit', name: 'Velocity Combat Kit — Arsenal 01', manifest: 'assets/combat/combat.json', preview: 'assets/previews/combat-kit.webp', page: 'combat.html' }]);
  assert.equal(manifest.assets.length, 5);
  assert.equal(manifest.assets.filter((asset) => asset.kind === 'turret').length, 4);
  assert.equal(manifest.assets.filter((asset) => asset.kind === 'projectile').length, 1);
  assert.equal(manifest.license, 'CC0-1.0');
  assert.match(manifest.credit.source, /no third-party models, trademarks or game assets used/);
  const paths = [manifest.preview, 'assets/combat/LICENSE.txt'];
  for (const asset of manifest.assets) paths.push(asset.thumbnail, asset.collision, ...Object.values(asset.lods));
  for (const relative of paths) {
    assert.ok(!relative.startsWith('http'));
    assert.ok((await fs.stat(new URL(`../public/${relative}`, import.meta.url))).size > 44);
  }
  for (const asset of manifest.assets) assert.ok((await fs.stat(new URL(`../${asset.master}`, import.meta.url))).size > 1000);
});

test('combat packages have decreasing LODs, collision budgets and exact reusable rig records', async () => {
  const byId = Object.fromEntries(manifest.assets.map((asset) => [asset.id, asset]));
  assert.equal(byId['rotary-cannon'].muzzles.length, 6);
  assert.equal(byId['twin-repeater'].muzzles.length, 2);
  assert.equal(byId['missile-pod'].muzzles.length, 6);
  assert.equal(byId['pulse-projector'].muzzles.length, 1);
  assert.equal(byId['rotary-cannon'].articulation.spin.continuous, true);
  assert.equal(byId['micro-missile'].articulation, null);
  assert.ok(byId['micro-missile'].bounds.center.every((value) => Math.abs(value) <= 0.001));
  for (const asset of manifest.assets) {
    let previous = Infinity;
    for (const level of [0, 1, 2, 3]) {
      const triangles = asset.lodTriangles[level]; assert.ok(triangles < previous); previous = triangles;
      const bytes = await fs.readFile(new URL(`../public/${asset.lods[level]}`, import.meta.url));
      assert.equal(bytes.length, asset[`lod${level}Bytes`]);
      const jsonLength = bytes.readUInt32LE(12); const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
      assert.ok(document.extensionsUsed.includes('EXT_meshopt_compression'));
      assert.equal(document.asset.extras.velocityCombat.lod, level);
    }
    assert.ok(asset.collisionTriangles < asset.lodTriangles[3]);
    assert.ok(asset.bounds.size.every((value) => value > 0));
    if (asset.kind === 'turret') {
      assert.ok(Math.abs(asset.bounds.min[1]) <= 0.03);
      assert.equal(asset.mount.node, 'MountSocket');
      assert.deepEqual(asset.articulation.yaw.axis, [0, 1, 0]);
      assert.deepEqual(asset.articulation.pitch.axis, [1, 0, 0]);
      for (const muzzle of asset.muzzles) assert.deepEqual(muzzle.direction, [0, 0, 1]);
    }
  }
});

test('combat package preserves conventions and explicitly excludes fire-control and gameplay', () => {
  assert.equal(manifest.units, 'metres'); assert.equal(manifest.upAxis, '+Y'); assert.equal(manifest.forwardAxis, '+Z');
  assert.equal(manifest.conventions.turretOrigin, 'roof mount at ground zero');
  assert.equal(manifest.conventions.projectileOrigin, 'geometric center');
  assert.match(manifest.conventions.positivePitch, /negative X rotation/);
  for (const phrase of ['No firing', 'ammunition', 'targeting', 'ballistics', 'damage', 'health', 'AI', 'combat gameplay']) assert.ok(manifest.gameplayNote.includes(phrase));
});

test('combat inspector is poster-first, local and exposes real rig, LOD and download controls', async () => {
  const [html, script, config, index, track, race, effects, packageJson] = await Promise.all([
    fs.readFile(new URL('../combat.html', import.meta.url), 'utf8'), fs.readFile(new URL('../src/combat.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8'), fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../track.html', import.meta.url), 'utf8'), fs.readFile(new URL('../race.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../effects.html', import.meta.url), 'utf8'), fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="combat-poster"[\s\S]*?src="\/assets\/previews\/combat-kit\.webp"/);
  assert.match(html, /fetchpriority="high"/);
  for (const id of ['combat-yaw', 'combat-pitch', 'combat-lod-list', 'combat-socket-list', 'download-combat-model', 'download-combat-collision']) assert.ok(html.includes(`id="${id}"`));
  assert.match(script, /getObjectByName\('YawPivot'\)/); assert.match(script, /getObjectByName\('PitchPivot'\)/);
  assert.match(script, /currentPivots\.pitch\.rotation\.x = -THREE\.MathUtils\.degToRad/);
  assert.doesNotMatch(`${html}\n${script}`, /unpkg|jsdelivr|googleapis|raw\.githubusercontent/);
  assert.match(config, /combat: resolve\(process\.cwd\(\), 'combat\.html'\)/);
  for (const page of [index, track, race, effects]) assert.match(page, /href="\.\/combat\.html"/);
  assert.match(packageJson, /"build:combat"/); assert.match(packageJson, /"validate:combat"/);
});
