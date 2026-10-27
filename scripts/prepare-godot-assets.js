import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const root = process.cwd();
const output = path.join(root, 'godot', 'assets');
const assetDestination = (relative) => path.join(output, relative.replace(/^assets\//, ''));
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const catalog = JSON.parse(await fs.readFile(path.join(root, 'public/assets/catalog.json'), 'utf8'));
const media = JSON.parse(await fs.readFile(path.join(root, 'public/assets/media/vfx-audio.json'), 'utf8'));
const starterCar = catalog.cars.find((car) => car.id === 'sport-coupe');
if (!starterCar) throw new Error('APEX DRIVE requires the local Corsa RS starter asset.');
const trackIds = ['azurline-circuit'];
const audioIds = new Set([
  'engine-idle-loop', 'engine-high-loop', 'tire-skid-loop', 'coastal-wind-loop',
  'gear-shift', 'heavy-impact', 'race-countdown', 'race-go', 'ui-confirm',
]);
const tracks = [];

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

async function copyAsset(relative) {
  const destination = assetDestination(relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, 'public', relative), destination);
}

async function convertGLB(relative) {
  const destination = assetDestination(relative);
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
for (const lod of ['1', '2', '3']) glbs.add(starterCar.lods[lod]);
await copyAsset(starterCar.preview);
await copyAsset(starterCar.rig);
for (const id of trackIds) {
  const track = JSON.parse(await fs.readFile(path.join(root, `public/assets/tracks/${id}.json`), 'utf8'));
  tracks.push({
    id: track.id,
    name: id === 'azurline-circuit' ? 'Azure Coast' : track.name,
    sourceName: track.name,
    manifest: `assets/tracks/${id}.json`,
    preview: track.preview,
  });
  await copyAsset(`assets/tracks/${id}.json`);
  await copyAsset(track.preview);
  glbs.add(track.lods['2']);
  glbs.add(track.lods['3']);
  glbs.add(track.collision);
}
const audio = media.audio.filter((sound) => audioIds.has(sound.id));
for (const sound of audio) await copyAsset(sound.runtime);

let converted = 0;
for (const relative of [...glbs].sort()) {
  await convertGLB(relative);
  converted += 1;
  process.stdout.write(`Godot GLB ${converted}/${glbs.size}: ${relative}\n`);
}

const licenseFiles = [
  'assets/cars/LICENSES.txt',
  'assets/tracks/LICENSE.txt',
  'assets/media/LICENSE.txt',
];
const attribution = ['APEX DRIVE — JAG STUDIOS — ASSET ATTRIBUTION', ''];
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
  const destination = assetDestination(relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, source), destination);
}

const content = {
  id: 'apex-drive-content',
  version: 2,
  brand: { studio: 'JAG STUDIOS', title: 'APEX DRIVE', tagline: 'Earn Every Corner.' },
  cars: [{
    id: starterCar.id,
    name: starterCar.name,
    shortName: starterCar.shortName,
    class: 'Sport Coupe',
    driveType: 'RWD',
    preview: starterCar.preview,
    lods: starterCar.lods,
    dimensions: starterCar.dimensions,
    performance: starterCar.performance,
    paintMaterials: starterCar.paintMaterials,
    defaultPaint: starterCar.defaultPaint,
    rig: starterCar.rig,
  }],
  tracks,
  audio,
};
await fs.writeFile(path.join(output, 'content.json'), `${JSON.stringify(content, null, 2)}\n`);
console.log(`Prepared ${converted} Godot-compatible GLBs for the APEX DRIVE vertical slice: one starter car, Azure Coast and ${audio.length} local sounds.`);
