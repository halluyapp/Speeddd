import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const root = process.cwd();
const output = path.join(root, 'godot', 'assets');
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const catalog = JSON.parse(await fs.readFile(path.join(root, 'public/assets/catalog.json'), 'utf8'));
const combat = JSON.parse(await fs.readFile(path.join(root, 'public/assets/combat/combat.json'), 'utf8'));
const media = JSON.parse(await fs.readFile(path.join(root, 'public/assets/media/vfx-audio.json'), 'utf8'));
const trackIds = ['azurline-circuit', 'kestrel-ridge'];
const tracks = [];

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

async function copyAsset(relative) {
  const destination = path.join(output, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, 'public', relative), destination);
}

async function convertGLB(relative) {
  const destination = path.join(output, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const document = await io.read(path.join(root, 'public', relative));
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
  }
  await document.transform(dequantize());
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === 'KHR_mesh_quantization') extension.dispose();
  }
  await io.write(destination, document);
}

const glbs = new Set();
for (const car of catalog.cars) {
  glbs.add(car.lods['2']);
  glbs.add(car.lods['3']);
  await copyAsset(car.preview);
}
for (const id of trackIds) {
  const track = JSON.parse(await fs.readFile(path.join(root, `public/assets/tracks/${id}.json`), 'utf8'));
  tracks.push({ id: track.id, name: track.name, manifest: `assets/tracks/${id}.json`, preview: track.preview });
  await copyAsset(`assets/tracks/${id}.json`);
  await copyAsset(track.preview);
  glbs.add(track.lods['2']);
  glbs.add(track.lods['3']);
  glbs.add(track.collision);
}
for (const weapon of combat.assets) {
  glbs.add(weapon.lods['3']);
  await copyAsset(weapon.thumbnail);
}
for (const effect of media.effects) await copyAsset(effect.runtime);
for (const sound of media.audio) await copyAsset(sound.runtime);

let converted = 0;
for (const relative of [...glbs].sort()) {
  await convertGLB(relative);
  converted += 1;
  process.stdout.write(`Godot GLB ${converted}/${glbs.size}: ${relative}\n`);
}

const licenseFiles = [
  'assets/cars/LICENSES.txt',
  'assets/tracks/LICENSE.txt',
  'assets/combat/LICENSE.txt',
  'assets/media/LICENSE.txt',
  'assets/drivers/LICENSE.txt',
  'assets/progression/LICENSE.txt',
];
const attribution = ['PROJECT VELOCITY — ASSET ATTRIBUTION', ''];
for (const relative of licenseFiles) {
  const text = await fs.readFile(path.join(root, 'public', relative), 'utf8');
  attribution.push(text.trim(), '', '='.repeat(72), '');
}
await fs.writeFile(path.join(output, 'ATTRIBUTION.txt'), attribution.join('\n'));

const fonts = [
  ['node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'assets/fonts/inter.woff2'],
  ['node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2', 'assets/fonts/space-grotesk.woff2'],
];
for (const [source, relative] of fonts) {
  const destination = path.join(output, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, source), destination);
}

const content = {
  id: 'project-velocity-content',
  version: 1,
  cars: catalog.cars.map((car) => ({
    id: car.id,
    name: car.name,
    shortName: car.shortName,
    preview: car.preview,
    lods: car.lods,
    dimensions: car.dimensions,
    performance: car.performance,
    defaultPaint: car.defaultPaint,
  })),
  tracks,
  weapons: combat.assets.filter((asset) => asset.kind === 'turret').map((weapon) => ({
    id: weapon.id,
    name: weapon.name,
    shortName: weapon.shortName,
    category: weapon.category,
    lods: weapon.lods,
  })),
  projectile: combat.assets.find((asset) => asset.id === 'micro-missile'),
  effects: media.effects,
  audio: media.audio,
};
await fs.writeFile(path.join(output, 'content.json'), `${JSON.stringify(content, null, 2)}\n`);
console.log(`Prepared ${converted} Godot-compatible GLBs, ${catalog.cars.length} cars, ${tracks.length} tracks, ${content.weapons.length} weapons, ${media.effects.length} effects and ${media.audio.length} sounds.`);
