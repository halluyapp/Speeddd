import fs from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const root = process.cwd();
const catalog = JSON.parse(await fs.readFile(path.join(root, 'public/assets/catalog.json'), 'utf8'));
let failed = false;

function readGlbJson(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error('Invalid GLB signature');
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.toString('utf8', 16, 20) !== 'JSON') throw new Error('Missing GLB JSON chunk');
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

function triangleCount(document) {
  let triangles = 0;
  for (const mesh of document.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const accessor = document.accessors?.[accessorIndex];
      if (accessor) triangles += Math.floor(accessor.count / 3);
    }
  }
  return triangles;
}

for (const car of catalog.cars) {
  try {
    const modelPath = path.join(root, 'public', car.model);
    const previewPath = path.join(root, 'public', car.preview);
    const [bytes, preview] = await Promise.all([fs.readFile(modelPath), fs.readFile(previewPath)]);
    if (preview.length < 100) throw new Error('Preview image is empty');

    const document = readGlbJson(bytes);
    const actualTriangles = triangleCount(document);
    if (actualTriangles !== car.triangles) {
      throw new Error(`Catalog triangle count ${car.triangles} does not match GLB count ${actualTriangles}`);
    }
    if (document.asset?.extras?.velocityCollection?.assetId !== car.id) {
      throw new Error('Embedded Velocity attribution record is missing');
    }
    if (!document.asset?.copyright?.includes(car.credit.license)) {
      throw new Error('Embedded license copyright is missing');
    }

    const report = await validator.validateBytes(new Uint8Array(bytes), {
      uri: car.model,
      maxIssues: 200,
    });
    const { numErrors, numWarnings, numInfos } = report.issues;
    for (const issue of report.issues.messages.filter((message) => message.severity <= 1)) {
      console.error(`  ${issue.code}: ${issue.message}`);
    }
    if (numErrors || numWarnings) failed = true;
    console.log(`${numErrors || numWarnings ? 'FAIL' : 'PASS'} ${car.id.padEnd(18)} ${formatBytes(bytes.length).padStart(9)}  ${formatNumber(actualTriangles).padStart(9)} tris  ${numErrors} errors  ${numWarnings} warnings  ${numInfos} infos`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${car.id}: ${error.message}`);
  }
}

console.log(`\nValidated ${catalog.cars.length} local GLB assets and previews.`);
if (failed) process.exitCode = 1;

function formatBytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function formatNumber(number) {
  return new Intl.NumberFormat('en-US').format(number);
}
