import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await fs.readFile(new URL('../public/assets/drivers/drivers.json', import.meta.url), 'utf8'));
function readGlb(buffer) {
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
  return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
}

test('catalogue indexes three original fictional drivers and every package path is local', async () => {
  assert.ok(catalog.version >= 8);
  assert.deepEqual(catalog.drivers, [{ id: 'velocity-driver-kit', name: 'Velocity Driver Kit — Character 01', manifest: 'assets/drivers/drivers.json', preview: 'assets/previews/driver-kit.webp', page: 'drivers.html' }]);
  assert.equal(manifest.id, 'velocity-driver-kit'); assert.equal(manifest.license, 'CC0-1.0'); assert.equal(manifest.assets.length, 3);
  assert.deepEqual(manifest.assets.map((asset) => asset.id), ['v84', 'n09', 'a17']);
  for (const asset of manifest.assets) {
    assert.equal(asset.fictional, true); assert.equal(asset.rig.type, 'rigid-articulated'); assert.equal(asset.rig.jointCount, 17); assert.equal(asset.rig.joints.length, 17);
    assert.equal(asset.animations.length, 4); assert.equal(asset.collisionTriangles, 112); assert.ok(asset.height >= 1.7 && asset.height <= 2.2);
    const paths = [asset.master, asset.collision, asset.thumbnail, ...Object.values(asset.lods)];
    for (const relative of paths) {
      assert.ok(!relative.startsWith('http')); const file = new URL(relative.startsWith('assets-src/') ? `../${relative}` : `../public/${relative}`, import.meta.url);
      assert.ok((await fs.stat(file)).size > 100);
    }
    const master = await fs.readFile(new URL(`../${asset.master}`, import.meta.url));
    assert.equal(master.toString('utf8', 0, 4), 'glTF');
  }
  for (const relative of [manifest.preview, 'assets/drivers/LICENSE.txt']) assert.ok((await fs.stat(new URL(`../public/${relative}`, import.meta.url))).size > 100);
});

test('every preserved master and runtime LOD retains the named rig and four real animation clips', async () => {
  const expected = new Map([['Idle', 4], ['Seated', 2], ['Celebrate', 2.4], ['Signal', 2]]);
  for (const asset of manifest.assets) {
    let previousTriangles = Infinity; let previousBytes = Infinity;
    for (const [label, relative] of [['master', asset.master], ...[0, 1, 2, 3].map((level) => [`lod${level}`, asset.lods[level]])]) {
      const bytes = await fs.readFile(new URL(relative.startsWith('assets-src/') ? `../${relative}` : `../public/${relative}`, import.meta.url)); const document = readGlb(bytes);
      assert.equal(document.asset.extras.velocityDriver.license, 'CC0-1.0'); assert.equal(document.asset.extras.velocityDriver.rigType, 'rigid-articulated');
      const nodes = document.nodes || []; assert.equal(nodes.filter((node) => node.extras?.velocityRole === 'driver-joint').length, 17);
      assert.equal(document.animations.length, 4);
      for (const animation of document.animations) {
        assert.ok(expected.has(animation.name)); assert.equal(animation.channels.length, 18);
        const duration = Math.max(...animation.samplers.map((sampler) => document.accessors[sampler.input].max[0])); assert.ok(Math.abs(duration - expected.get(animation.name)) < 0.001);
        for (const channel of animation.channels) assert.ok(nodes[channel.target.node]?.name, 'every channel must target a preserved named node');
      }
      if (label !== 'master') {
        const level = Number(label.at(-1)); assert.ok((document.extensionsUsed || []).includes('EXT_meshopt_compression'));
        assert.ok(asset.lodTriangles[level] < previousTriangles); assert.ok(asset[`lod${level}Bytes`] < previousBytes); assert.equal(bytes.length, asset[`lod${level}Bytes`]);
        previousTriangles = asset.lodTriangles[level]; previousBytes = asset[`lod${level}Bytes`];
      }
    }
    const collision = readGlb(await fs.readFile(new URL(`../public/${asset.collision}`, import.meta.url)));
    assert.ok(collision.nodes.some((node) => node.extras?.velocityRole === 'collision-capsule'));
  }
});

test('cinematic fixtures reference valid clips and environments while remaining presentation-only', () => {
  assert.equal(manifest.cinematics.length, 4); const environments = new Set(catalog.tracks.map((track) => track.id));
  assert.deepEqual(manifest.cinematics.map((shot) => shot.clip), ['Idle', 'Seated', 'Celebrate', 'Signal']);
  for (const shot of manifest.cinematics) {
    const clip = manifest.assets[0].animations.find((animation) => animation.name === shot.clip);
    assert.ok(clip); assert.equal(shot.duration, clip.duration); assert.equal(shot.loop, clip.loop); assert.ok(environments.has(shot.environmentId));
    assert.equal(shot.camera.position.length, 3); assert.equal(shot.camera.target.length, 3); assert.ok(shot.camera.fov >= 20 && shot.camera.fov <= 70);
  }
  for (const phrase of ['No locomotion', 'AI', 'physics', 'seat constraints', 'racing logic', 'cinematic gameplay', 'movie rendering']) assert.ok(manifest.gameplayNote.includes(phrase));
});

test('Driver Lab is poster-first, responsive, downloadable and wired into every inspector', async () => {
  const [html, script, styles, config, index, track, race, effects, combat, social, packageJson] = await Promise.all([
    fs.readFile(new URL('../drivers.html', import.meta.url), 'utf8'), fs.readFile(new URL('../src/drivers.js', import.meta.url), 'utf8'), fs.readFile(new URL('../src/drivers.css', import.meta.url), 'utf8'),
    fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8'), fs.readFile(new URL('../index.html', import.meta.url), 'utf8'), fs.readFile(new URL('../track.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../race.html', import.meta.url), 'utf8'), fs.readFile(new URL('../effects.html', import.meta.url), 'utf8'), fs.readFile(new URL('../combat.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../social.html', import.meta.url), 'utf8'), fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="driver-poster"[\s\S]*?src="\/assets\/previews\/driver-kit\.webp"/); assert.match(html, /fetchpriority="high"/);
  for (const id of ['driver-asset-list', 'driver-shot-list', 'driver-lod-list', 'driver-timeline', 'toggle-driver-play', 'driver-speed', 'download-driver-model', 'download-driver-collision']) assert.ok(html.includes(`id="${id}"`));
  assert.match(script, /new THREE\.AnimationMixer/); assert.match(script, /mixer\.clipAction\(clip\)/); assert.match(script, /mixer\.update\(delta\)/); assert.match(script, /gltf\.animations\.length !== 4/);
  assert.doesNotMatch(`${html}\n${script}`, /unpkg|jsdelivr|googleapis|raw\.githubusercontent|WebSocket|RTCPeerConnection/);
  assert.match(styles, /@media \(max-width: 700px\)/); assert.match(styles, /@media \(max-width: 390px\)/); assert.match(config, /drivers: resolve\(process\.cwd\(\), 'drivers\.html'\)/);
  for (const page of [index, track, race, effects, combat, social]) assert.match(page, /href="\.\/drivers\.html"/);
  assert.match(packageJson, /"build:drivers"/); assert.match(packageJson, /"validate:drivers"/); assert.match(packageJson, /validate:social && npm run validate:drivers/);
});
