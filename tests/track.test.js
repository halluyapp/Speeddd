import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const track = JSON.parse(await fs.readFile(new URL('../public/assets/tracks/azurline-circuit.json', import.meta.url), 'utf8'));

test('main catalogue references one local coastal environment manifest', () => {
  assert.equal(catalog.version, 2);
  assert.equal(catalog.tracks.length, 1);
  assert.deepEqual(catalog.tracks[0], {
    id: 'azurline-circuit',
    name: 'Azurline Circuit',
    manifest: 'assets/tracks/azurline-circuit.json',
    preview: 'assets/previews/azurline-circuit.webp',
    page: 'track.html',
  });
});

test('coastal master, four LODs, collision and poster are present and decreasing', async () => {
  assert.equal(track.id, 'azurline-circuit');
  assert.equal(track.license, 'CC0-1.0');
  assert.equal(track.credit.license, 'CC0 1.0 Universal');
  assert.match(track.credit.source, /Original geometry/);
  assert.equal(track.master, 'assets-src/tracks/azurline-circuit.glb');
  assert.ok((await fs.stat(new URL(`../${track.master}`, import.meta.url))).size > 1e6);
  for (const level of [0, 1, 2, 3]) {
    assert.equal(track.lods[level], `assets/tracks/lods/azurline-circuit-lod${level}.glb`);
    const stat = await fs.stat(new URL(`../public/${track.lods[level]}`, import.meta.url));
    assert.equal(stat.size, track[`lod${level}Bytes`]);
    if (level > 0) {
      assert.ok(track.lodTriangles[level] < track.lodTriangles[level - 1]);
      assert.ok(track[`lod${level}Bytes`] < track[`lod${level - 1}Bytes`]);
    }
  }
  assert.ok(track.collisionTriangles < track.lodTriangles[3]);
  assert.ok((await fs.stat(new URL(`../public/${track.collision}`, import.meta.url))).size > 1000);
  assert.ok((await fs.stat(new URL(`../public/${track.preview}`, import.meta.url))).size > 1000);
});

test('circuit has a closed centerline, staggered grid, ordered checkpoints and three sectors', () => {
  assert.equal(track.closed, true);
  assert.ok(track.length > 2700 && track.length < 2900);
  assert.equal(track.roadWidth, 14);
  assert.equal(track.gridCount, 16);
  assert.equal(track.grid.length, 16);
  assert.equal(track.checkpointCount, 12);
  assert.equal(track.checkpoints.length, 12);
  assert.equal(track.sectors.length, 3);
  assert.deepEqual(track.centerline[0], track.centerline.at(-1));
  assert.deepEqual(track.checkpoints.map((checkpoint) => checkpoint.id), Array.from({ length: 12 }, (_, index) => index + 1));
  for (const item of [...track.grid, ...track.checkpoints, track.start]) {
    assert.equal(item.position.length, 3);
    assert.ok(item.position.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...item.forward) - 1) < 0.002);
  }
  assert.ok(Math.abs(track.sectors.reduce((sum, sector) => sum + sector.length, 0) - track.length) < 0.01);
  assert.match(track.gameplayNote, /No driving/);
});

test('track inspector is local, instant-loading and exposes all runtime packages', async () => {
  const [html, script, config] = await Promise.all([
    fs.readFile(new URL('../track.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/track.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="track-poster-image"[^>]+src="\/assets\/previews\/azurline-circuit\.webp"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /id="lod-list"/);
  assert.match(html, /id="download-collision"/);
  assert.match(script, /setMeshoptDecoder/);
  assert.match(script, /Map preview · optimized 3D loading/);
  assert.doesNotMatch(`${html}\n${script}`, /unpkg|jsdelivr|googleapis|raw\.githubusercontent/);
  assert.match(config, /track: resolve\(process\.cwd\(\), 'track\.html'\)/);
});
