import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const track = JSON.parse(await fs.readFile(new URL('../public/assets/tracks/azurline-circuit.json', import.meta.url), 'utf8'));
const ridge = JSON.parse(await fs.readFile(new URL('../public/assets/tracks/kestrel-ridge.json', import.meta.url), 'utf8'));

test('main catalogue references both local environment manifests', () => {
  assert.ok(catalog.version >= 7);
  assert.equal(catalog.tracks.length, 2);
  assert.deepEqual(catalog.tracks, [{
    id: 'azurline-circuit',
    name: 'Azurline Circuit',
    manifest: 'assets/tracks/azurline-circuit.json',
    preview: 'assets/previews/azurline-circuit.webp',
    page: 'track.html',
  }, {
    id: 'kestrel-ridge',
    name: 'Kestrel Ridge',
    manifest: 'assets/tracks/kestrel-ridge.json',
    preview: 'assets/previews/kestrel-ridge.webp',
    page: 'track.html?track=kestrel-ridge',
  }]);
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

test('track inspector is local, poster-first and switches isolated environment packages', async () => {
  const [html, script, config] = await Promise.all([
    fs.readFile(new URL('../track.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/track.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="track-poster-image"[^>]+data-default-src="\/assets\/previews\/azurline-circuit\.webp"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /URLSearchParams\(window\.location\.search\)[\s\S]*?kestrel-ridge\.webp/);
  assert.match(html, /id="lod-list"/);
  assert.match(html, /id="download-collision"/);
  assert.match(html, /id="environment-list"/);
  assert.match(html, /data-track-id="kestrel-ridge"/);
  assert.match(html, /id="download-track-license"/);
  assert.match(script, /setMeshoptDecoder/);
  assert.match(script, /assets\/catalog\.json/);
  assert.match(script, /params\.get\('track'\)/);
  assert.match(script, /`\$\{manifest\.id\}:\$\{level\}`/);
  assert.match(script, /Map preview · optimized 3D loading/);
  assert.doesNotMatch(`${html}\n${script}`, /unpkg|jsdelivr|googleapis|raw\.githubusercontent/);
  assert.match(config, /track: resolve\(process\.cwd\(\), 'track\.html'\)/);
});

test('Kestrel master, four Meshopt LODs, collision, poster and CC0 record are local and decreasing', async () => {
  assert.equal(ridge.id, 'kestrel-ridge');
  assert.equal(ridge.license, 'CC0-1.0');
  assert.equal(ridge.credit.license, 'CC0 1.0 Universal');
  assert.equal(ridge.master, 'assets-src/tracks/kestrel-ridge.glb');
  assert.ok((await fs.stat(new URL(`../${ridge.master}`, import.meta.url))).size > 1e6);
  for (const level of [0, 1, 2, 3]) {
    assert.equal(ridge.lods[level], `assets/tracks/lods/kestrel-ridge-lod${level}.glb`);
    const stat = await fs.stat(new URL(`../public/${ridge.lods[level]}`, import.meta.url));
    assert.equal(stat.size, ridge[`lod${level}Bytes`]);
    if (level > 0) {
      assert.ok(ridge.lodTriangles[level] < ridge.lodTriangles[level - 1]);
      assert.ok(ridge[`lod${level}Bytes`] < ridge[`lod${level - 1}Bytes`]);
    }
  }
  assert.ok(ridge.collisionTriangles < ridge.lodTriangles[3]);
  for (const relative of [ridge.collision, ridge.preview, ridge.licenseFile]) assert.ok((await fs.stat(new URL(`../public/${relative}`, import.meta.url))).size > 100);
});

test('Kestrel has a closed technical layout, ordered checkpoints and reusable gallery metadata', () => {
  assert.equal(ridge.closed, true);
  assert.equal(ridge.environmentType, 'alpine-circuit');
  assert.ok(ridge.length > 3100 && ridge.length < 3300);
  assert.equal(ridge.roadWidth, 12);
  assert.ok(ridge.elevation.change > 100);
  assert.equal(ridge.grid.length, 16);
  assert.equal(ridge.checkpoints.length, 18);
  assert.deepEqual(ridge.checkpoints.map((checkpoint) => checkpoint.id), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.deepEqual(ridge.centerline[0], ridge.centerline.at(-1));
  assert.equal(ridge.sectors.length, 3);
  assert.ok(Math.abs(ridge.sectors.reduce((sum, sector) => sum + sector.length, 0) - ridge.length) < 0.01);
  assert.equal(ridge.technicalSections.length, 3);
  for (const section of ridge.technicalSections) {
    assert.ok(section.startCheckpoint >= 1 && section.startCheckpoint <= section.endCheckpoint && section.endCheckpoint <= 18);
    assert.ok(section.name.length > 3 && section.character.length > 12);
  }
  assert.equal(ridge.gallery.openSides, true);
  assert.equal(ridge.gallery.masterPortals, 6);
  assert.ok(ridge.gallery.clearHeight >= 5);
  assert.equal(ridge.viewpoints.coast.label, 'Gallery');
  assert.equal(ridge.viewpoints.coast.cameraOffset.length, 3);
  assert.match(ridge.gameplayNote, /No driving, drift scoring/);
});

test('environment rebuilders preserve sibling catalogue entries and separate license records', async () => {
  const [coastalSource, ridgeSource] = await Promise.all([
    fs.readFile(new URL('../scripts/build-coastal-track.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../scripts/build-kestrel-ridge.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [coastalSource, ridgeSource]) {
    assert.match(source, /findIndex\(\(entry\) => entry\.id === TRACK_ID\)/);
    assert.match(source, /metadata\.licenseFile/);
    assert.doesNotMatch(source, /https?:\/\/(?:unpkg|jsdelivr|raw\.githubusercontent)/);
  }
  assert.notEqual(track.licenseFile, ridge.licenseFile);
  assert.notEqual(track.preview, ridge.preview);
});
