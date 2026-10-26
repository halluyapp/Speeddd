import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const cars = catalog.cars;

test('collection contains the original concept plus ten additional vehicles', () => {
  assert.equal(cars.length, 11);
  assert.equal(cars[0].id, 'car-concept');
  assert.equal(cars.filter((car) => car.id !== 'car-concept').length, 10);
});

test('asset ids and every reusable asset path are unique', () => {
  for (const key of ['id', 'model', 'preview', 'master', 'rig', 'collision']) {
    const values = cars.map((car) => car[key]);
    assert.equal(new Set(values).size, cars.length, `Duplicate ${key}`);
  }
  const lodPaths = cars.flatMap((car) => Object.values(car.lods));
  assert.equal(lodPaths.length, 44);
  assert.equal(new Set(lodPaths).size, 44);
});

test('all runtime assets, previews and separate masters are local and present', async () => {
  for (const car of cars) {
    assert.match(car.model, /^assets\/cars\/lods\/[\w-]+-lod0\.glb$/);
    assert.match(car.preview, /^assets\/previews\/[\w-]+\.webp$/);
    assert.match(car.master, /^assets-src\/cars\/[\w-]+\.glb$/);
    assert.match(car.rig, /^assets\/cars\/rigs\/[\w-]+\.json$/);
    assert.match(car.collision, /^assets\/cars\/collisions\/[\w-]+-collision\.glb$/);
    assert.doesNotMatch(`${car.model} ${car.master}`, /^https?:/);
    const paths = [car.model, car.preview, car.rig, car.collision, ...Object.values(car.lods)];
    for (const assetPath of paths) {
      const stat = await fs.stat(new URL(`../public/${assetPath}`, import.meta.url));
      assert.ok(stat.size > 100, `${car.id} ${assetPath} is missing or empty`);
    }
    const master = await fs.stat(new URL(`../${car.master}`, import.meta.url));
    assert.ok(master.size > 1000, `${car.id} master is missing or empty`);
  }
});

test('every vehicle has useful design metadata and complete attribution', () => {
  for (const car of cars) {
    assert.ok(car.name && car.class && car.description && car.series);
    assert.ok(car.length >= 4 && car.length <= 5.5, `${car.id} has an implausible normalized length`);
    assert.ok(car.triangles > 50000, `${car.id} does not meet the LOD0 collection detail floor`);
    assert.ok(car.performance.topSpeed >= 200 && car.performance.topSpeed <= 420);
    assert.ok(car.performance.acceleration >= 2 && car.performance.acceleration <= 7);
    assert.ok(car.performance.handling >= 0 && car.performance.handling <= 100);
    assert.ok(car.paintMaterials.length > 0, `${car.id} has no paint mapping`);
    assert.equal(car.credit.license, 'CC BY 4.0');
    assert.ok(car.credit.title && car.credit.author && car.credit.changes && car.credit.runtimeChanges);
    assert.match(car.credit.source, /^https:\/\//);
    assert.match(car.credit.distribution, /^https:\/\//);
  }
});

test('runtime package has four decreasing LODs, baked conventions and four wheel records', async () => {
  assert.equal(catalog.runtimeProfile.lodLevels, 4);
  assert.equal(catalog.runtimeProfile.units, 'metres');
  assert.equal(catalog.runtimeProfile.upAxis, '+Y');
  assert.equal(catalog.runtimeProfile.forwardAxis, '+Z');
  assert.equal(catalog.runtimeProfile.groundY, 0);
  for (const car of cars) {
    assert.equal(car.normalized, true);
    assert.deepEqual(Object.keys(car.lods).sort(), ['0', '1', '2', '3']);
    for (let level = 0; level < 4; level += 1) {
      assert.match(car.lods[level], new RegExp(`^assets/cars/lods/${car.id}-lod${level}\\.glb$`));
      assert.ok(car.lodTriangles[level] > 1000);
      if (level > 0) assert.ok(car.lodTriangles[level] < car.lodTriangles[level - 1], `${car.id} LOD${level} does not decrease`);
    }
    assert.ok(car.dimensions.length >= car.length - 0.03 && car.dimensions.length <= car.length + 0.03);
    assert.ok(car.dimensions.width > 1 && car.dimensions.width < 3.2);
    assert.ok(car.dimensions.height > 0.8 && car.dimensions.height < 2.2);
    const rig = JSON.parse(await fs.readFile(new URL(`../public/${car.rig}`, import.meta.url), 'utf8'));
    assert.equal(rig.normalized, true);
    assert.equal(rig.wheels.length, 4);
    assert.deepEqual(new Set(rig.wheels.map((wheel) => wheel.id)), new Set(['FL', 'FR', 'RL', 'RR']));
    assert.equal(rig.collision.shape, 'convex-hull');
    assert.ok(rig.collision.triangles < car.lodTriangles[3]);
  }
});

test('showcase has no remote runtime model or library dependency', async () => {
  const [html, main] = await Promise.all([
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(html, /unpkg|jsdelivr|googleapis|raw\.githubusercontent/);
  assert.doesNotMatch(main, /unpkg|jsdelivr|raw\.githubusercontent/);
  assert.match(main, /new GLTFLoader/);
  assert.match(main, /setMeshoptDecoder/);
});

test('showcase presents an instant local poster while optimized 3D loads', async () => {
  const [html, main, css] = await Promise.all([
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="stage-poster-image"[^>]+src="\/assets\/previews\/car-concept\.webp"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(main, /Optimized 3D loading in the background/);
  assert.match(main, /stage-poster-image/);
  assert.match(css, /\.stage-poster\.is-hidden/);
});
