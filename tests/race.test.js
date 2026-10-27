import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const race = JSON.parse(await fs.readFile(new URL('../public/assets/race/race-presentation.json', import.meta.url), 'utf8'));

test('catalogue indexes the local race-presentation package and every reusable file', async () => {
  assert.ok(catalog.version >= 3);
  assert.equal(catalog.presentation.length, 1);
  assert.deepEqual(catalog.presentation[0], {
    id: 'race-control-presentation',
    name: 'Velocity Race Control — Presentation 01',
    manifest: 'assets/race/race-presentation.json',
    preview: 'assets/previews/race-presentation.webp',
    page: 'race.html',
  });
  assert.equal(race.assets.length, 3);
  assert.equal(race.license, 'CC0-1.0');
  assert.match(race.credit.source, /Original geometry, vector graphics/);
  for (const asset of race.assets) {
    assert.ok((await fs.stat(new URL(`../${asset.master}`, import.meta.url))).size > 1000);
    for (const level of [0, 1, 2, 3]) {
      const stat = await fs.stat(new URL(`../public/${asset.lods[level]}`, import.meta.url));
      assert.equal(stat.size, asset[`lod${level}Bytes`]);
    }
    assert.ok((await fs.stat(new URL(`../public/${asset.collision}`, import.meta.url))).size > 500);
  }
  for (const relative of [...Object.values(race.graphics.flags), race.graphics.iconSprite, race.preview]) {
    assert.ok(!relative.startsWith('http'));
    assert.ok((await fs.stat(new URL(`../public/${relative}`, import.meta.url))).size > 20);
  }
});

test('hardware has decreasing runtime LODs, simple collision, bounds and reusable control metadata', () => {
  const byId = Object.fromEntries(race.assets.map((asset) => [asset.id, asset]));
  assert.deepEqual(Object.keys(byId).sort(), ['race-marshal-panel', 'race-start-lights', 'race-timing-pylon']);
  for (const asset of race.assets) {
    assert.equal(race.units, 'metres');
    assert.equal(race.upAxis, '+Y');
    assert.equal(race.forwardAxis, '+Z');
    assert.ok(Math.abs(asset.bounds.min[1]) <= 0.03);
    assert.ok(asset.bounds.size.every((value) => value > 0));
    for (const level of [1, 2, 3]) assert.ok(asset.lodTriangles[level] < asset.lodTriangles[level - 1]);
    assert.ok(asset.collisionTriangles < asset.lodTriangles[3]);
  }
  assert.equal(byId['race-start-lights'].control.count, 10);
  assert.equal(byId['race-start-lights'].control.indexExtra, 'startLightIndex');
  assert.equal(byId['race-timing-pylon'].control.rows, 8);
  assert.equal(byId['race-marshal-panel'].control.type, 'flag-display');
});

test('race states, flags and timing fixtures are complete and explicitly not gameplay', () => {
  assert.deepEqual(Object.keys(race.demo.states), ['grid', 'armed', 'green', 'yellow', 'finish', 'results']);
  assert.equal(Object.keys(race.graphics.flags).length, 7);
  assert.equal(race.demo.standings.length, 8);
  assert.deepEqual(race.demo.standings.map((entry) => entry.position), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(race.demo.standings.map((entry) => entry.tag)).size, 8);
  for (const config of Object.values(race.demo.states)) {
    assert.ok(race.graphics.flags[config.flag]);
    assert.match(config.panelColor, /^#[0-9a-f]{6}$/i);
    assert.ok(config.status && config.message && config.detail);
  }
  assert.equal(race.demo.states.armed.lightCount, 5);
  assert.equal(race.demo.states.green.lightCount, 0);
  assert.match(race.demo.disclaimer, /No live timing/);
  assert.match(race.gameplayNote, /No driving, timing computation, race rules, AI, physics or multiplayer/);
});

test('race inspector is local, poster-first and exposes presentation and package controls', async () => {
  const [html, script, config, index, track] = await Promise.all([
    fs.readFile(new URL('../race.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/race.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../track.html', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="race-poster"[\s\S]*?src="\/assets\/previews\/race-presentation\.webp"/);
  assert.match(html, /fetchpriority="high"/);
  assert.equal((html.match(/data-state="/g) || []).length, 6);
  assert.match(html, /id="replay-start"/);
  assert.match(html, /id="race-lod-list"/);
  assert.match(html, /id="download-race-collision"/);
  assert.match(script, /setMeshoptDecoder/);
  assert.match(script, /startLightIndex/);
  assert.match(script, /flag-display-led/);
  assert.doesNotMatch(`${html}\n${script}`, /unpkg|jsdelivr|googleapis|raw\.githubusercontent|WebSocket/);
  assert.match(config, /race: resolve\(process\.cwd\(\), 'race\.html'\)/);
  assert.match(index, /href="\.\/race\.html"/);
  assert.match(track, /href="\.\/race\.html"/);
});
