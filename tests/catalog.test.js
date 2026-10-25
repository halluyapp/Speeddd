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

test('asset ids, model paths and preview paths are unique', () => {
  for (const key of ['id', 'model', 'preview']) {
    const values = cars.map((car) => car[key]);
    assert.equal(new Set(values).size, cars.length, `Duplicate ${key}`);
  }
});

test('all runtime assets are local and present', async () => {
  for (const car of cars) {
    assert.match(car.model, /^assets\/cars\/[\w-]+\.glb$/);
    assert.match(car.preview, /^assets\/previews\/[\w-]+\.webp$/);
    assert.doesNotMatch(car.model, /^https?:/);
    const [model, preview] = await Promise.all([
      fs.stat(new URL(`../public/${car.model}`, import.meta.url)),
      fs.stat(new URL(`../public/${car.preview}`, import.meta.url)),
    ]);
    assert.ok(model.size > 1000, `${car.id} model is missing or empty`);
    assert.ok(preview.size > 100, `${car.id} preview is missing or empty`);
  }
});

test('every vehicle has useful design metadata and complete attribution', () => {
  for (const car of cars) {
    assert.ok(car.name && car.class && car.description && car.series);
    assert.ok(car.length >= 4 && car.length <= 5.5, `${car.id} has an implausible normalized length`);
    assert.ok(car.triangles > 50000, `${car.id} does not meet the collection detail floor`);
    assert.ok(car.performance.topSpeed >= 200 && car.performance.topSpeed <= 420);
    assert.ok(car.performance.acceleration >= 2 && car.performance.acceleration <= 7);
    assert.ok(car.performance.handling >= 0 && car.performance.handling <= 100);
    assert.ok(car.paintMaterials.length > 0, `${car.id} has no paint mapping`);
    assert.equal(car.credit.license, 'CC BY 4.0');
    assert.ok(car.credit.title && car.credit.author && car.credit.changes);
    assert.match(car.credit.source, /^https:\/\//);
    assert.match(car.credit.distribution, /^https:\/\//);
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
