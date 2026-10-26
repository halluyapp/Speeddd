import './combat.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE_URL = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE_URL}${path.replace(/^\//, '')}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dom = Object.fromEntries([
  'combat-stage', 'combat-canvas', 'combat-poster', 'combat-loader', 'combat-loader-title', 'combat-loader-detail', 'combat-loader-progress',
  'combat-error', 'combat-error-message', 'retry-combat', 'combat-asset-list', 'selected-combat-category', 'selected-combat-name',
  'selected-combat-description', 'selected-combat-dimensions', 'selected-combat-mount', 'selected-combat-muzzles', 'selected-combat-origin',
  'selected-combat-master', 'stage-combat-lod', 'stage-combat-name', 'stage-combat-class', 'toggle-combat-markers', 'toggle-combat-wireframe',
  'toggle-combat-orbit', 'reset-combat-view', 'turret-rig-controls', 'projectile-rig-note', 'combat-yaw', 'combat-pitch', 'combat-yaw-value',
  'combat-pitch-value', 'reset-combat-rig', 'package-combat-name', 'package-combat-triangles', 'package-combat-size', 'combat-lod-list',
  'package-combat-master-tris', 'package-combat-collision', 'download-combat-model', 'download-combat-collision', 'socket-count',
  'combat-socket-list', 'package-combat-master', 'active-combat-file',
].map((id) => [id, document.getElementById(id)]));

const state = {
  manifest: null, ready: false, selected: 'rotary-cannon', lod: 0, view: 'iso', markers: false, wireframe: false,
  autoRotate: false, loadToken: 0, cameraTween: null, yaw: 0, pitch: 0,
};
const cache = new Map();
const pending = new Map();
const lodSelections = new Map();
const rigSelections = new Map();
let renderer;
let scene;
let camera;
let controls;
let loader;
let modelAnchor;
let currentModel = null;
let currentPivots = { yaw: null, pitch: null };
let resizeObserver;

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);
const formatBytes = (bytes) => bytes < 1e6 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1e6).toFixed(1)} MB`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
const selectedAsset = () => state.manifest?.assets.find((asset) => asset.id === state.selected);

function initScene() {
  const width = Math.max(1, dom['combat-stage'].clientWidth); const height = Math.max(1, dom['combat-stage'].clientHeight);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6)); renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; dom['combat-canvas'].appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color('#111c20'); scene.fog = new THREE.Fog('#111c20', 16, 42);
  camera = new THREE.PerspectiveCamera(38, width / height, 0.03, 100); camera.position.set(5, 3.4, 6.5);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.enablePan = true; controls.minDistance = 1.2; controls.maxDistance = 28; controls.minPolarAngle = 0.06; controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotateSpeed = 0.55; controls.target.set(0, 0.8, 0.4); controls.addEventListener('start', () => { state.cameraTween = null; });

  const pmrem = new THREE.PMREMGenerator(renderer); const room = new RoomEnvironment(); scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.85; room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xe5f6f1, 0x1c292e, 1.65));
  const key = new THREE.DirectionalLight(0xf2f6e9, 3.2); key.position.set(5, 8, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 25 }); key.shadow.bias = -0.00025; scene.add(key);
  const fill = new THREE.DirectionalLight(0x7fd5da, 1.25); fill.position.set(-6, 4, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd7ff3f, 0.65); rim.position.set(1, 5, -6); scene.add(rim);

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.16, 72), new THREE.MeshStandardMaterial({ color: '#172429', metalness: 0.52, roughness: 0.6 }));
  floor.position.y = -0.1; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.65, 3.68, 96), new THREE.MeshBasicMaterial({ color: '#7d9995', transparent: true, opacity: 0.36, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);
  const grid = new THREE.GridHelper(8, 16, '#3b5456', '#24383c'); grid.position.y = 0.004; grid.material.transparent = true; grid.material.opacity = 0.32; scene.add(grid);
  for (const radius of [2.75, 3.25]) {
    const points = []; for (let index = 0; index <= 96; index += 1) { const angle = index / 96 * Math.PI * 2; points.push(new THREE.Vector3(Math.sin(angle) * radius, 0.008, Math.cos(angle) * radius)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#3e5a5c', transparent: true, opacity: 0.28 })); scene.add(line);
  }
  modelAnchor = new THREE.Group(); modelAnchor.name = 'Isolated combat asset preview'; modelAnchor.position.y = 0.015; scene.add(modelAnchor);
  loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  resizeObserver = new ResizeObserver(onResize); resizeObserver.observe(dom['combat-stage']); window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, dom['combat-stage'].clientWidth); const height = Math.max(1, dom['combat-stage'].clientHeight);
  camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; if (currentModel) setView(state.view, true);
}

function makeSocketMarker(target, role) {
  const group = new THREE.Group(); group.name = 'PreviewSocketMarker'; group.userData.previewSocketMarker = true; group.visible = state.markers;
  const color = role === 'muzzle-socket' ? 0xd7ff3f : role === 'guidance-socket' ? 0x66e7ed : 0xffad45;
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(role === 'mount-socket' ? 0.055 : 0.035, 12, 8), material); sphere.renderOrder = 20; group.add(sphere);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(role === 'mount-socket' ? 0.09 : 0.065, 0.008, 5, 20), material.clone()); ring.renderOrder = 20; group.add(ring);
  if (role === 'muzzle-socket' || role === 'guidance-socket') {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.26)]), new THREE.LineBasicMaterial({ color, depthTest: false }));
    line.renderOrder = 20; group.add(line);
  }
  target.add(group);
}
function prepareObject(source) {
  const object = source.clone(true); const markers = [];
  object.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true; node.receiveShadow = true;
      node.material = Array.isArray(node.material) ? node.material.map((material) => material.clone()) : node.material.clone();
    }
    if (['muzzle-socket', 'mount-socket', 'guidance-socket'].includes(node.userData.velocityRole)) markers.push(node);
  });
  markers.forEach((marker) => makeSocketMarker(marker, marker.userData.velocityRole));
  return object;
}
async function loadModel(asset, level) {
  const key = `${asset.id}:${level}`;
  if (!cache.has(key)) {
    if (!pending.has(key)) {
      const promise = loader.loadAsync(assetUrl(asset.lods[level]), (event) => {
        if (event.total) dom['combat-loader-progress'].style.width = `${Math.max(4, event.loaded / event.total * 100)}%`;
      }).then((gltf) => { cache.set(key, gltf.scene); pending.delete(key); return gltf.scene; }).catch((error) => { pending.delete(key); throw error; });
      pending.set(key, promise);
    }
    await pending.get(key);
  }
  return prepareObject(cache.get(key));
}
function disposePreview(object) {
  object.traverse((node) => {
    if (!node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material]; materials.forEach((material) => material.dispose());
  });
}
function setLoading(visible, title = 'Preparing Combat Lab', detail = 'Illustrated preview · 3D loading…') {
  dom['combat-loader'].classList.toggle('is-complete', !visible); dom['combat-loader-title'].textContent = title; dom['combat-loader-detail'].textContent = detail;
  if (visible) dom['combat-loader-progress'].style.width = '4%';
}

function buildAssetList() {
  dom['combat-asset-list'].innerHTML = state.manifest.assets.map((asset, index) => `
    <button type="button" data-asset="${asset.id}" class="${asset.id === state.selected ? 'active' : ''}" aria-pressed="${asset.id === state.selected}">
      <img src="${assetUrl(asset.thumbnail)}" width="55" height="48" alt="" loading="lazy" /><span><strong>${escapeHtml(asset.shortName)}</strong><small>${escapeHtml(asset.class)}</small></span><b>${String(index + 1).padStart(2, '0')}</b>
    </button>`).join('');
  dom['combat-asset-list'].querySelectorAll('[data-asset]').forEach((button) => button.addEventListener('click', () => selectAsset(button.dataset.asset)));
}
function buildLodList() {
  const asset = selectedAsset(); if (!asset) return;
  dom['combat-lod-list'].innerHTML = [0, 1, 2, 3].map((level) => `<button type="button" data-lod="${level}" class="${level === state.lod ? 'active' : ''}" aria-pressed="${level === state.lod}" title="${formatNumber(asset.lodTriangles[level])} triangles · ${formatBytes(asset[`lod${level}Bytes`])}">LOD${level}</button>`).join('');
  dom['combat-lod-list'].querySelectorAll('[data-lod]').forEach((button) => button.addEventListener('click', () => selectLod(Number(button.dataset.lod))));
}
function buildSocketList(asset) {
  if (asset.kind === 'projectile') {
    dom['socket-count'].textContent = '1 guidance'; dom['combat-socket-list'].innerHTML = '<div><span>GuidanceSocket</span><code>+Z / nose</code></div><p>Centered origin and forward axis are recorded in the manifest.</p>'; return;
  }
  dom['socket-count'].textContent = `${asset.muzzles.length} outputs`;
  dom['combat-socket-list'].innerHTML = asset.muzzles.map((muzzle) => `<div><span>${muzzle.name}</span><code>${muzzle.position.map((value) => value.toFixed(2)).join(' / ')}</code></div>`).join('');
}
function updateRigUI() {
  const asset = selectedAsset(); if (!asset) return;
  const turret = asset.kind === 'turret'; dom['turret-rig-controls'].hidden = !turret; dom['projectile-rig-note'].hidden = turret;
  const values = rigSelections.get(asset.id) || { yaw: 0, pitch: 0 }; state.yaw = values.yaw; state.pitch = values.pitch;
  if (turret) {
    for (const [key, config] of [['yaw', asset.articulation.yaw], ['pitch', asset.articulation.pitch]]) {
      const input = dom[`combat-${key}`]; input.min = config.minDegrees; input.max = config.maxDegrees; input.value = values[key]; dom[`combat-${key}-value`].textContent = `${values[key]}°`;
    }
  }
  document.body.dataset.yaw = String(state.yaw); document.body.dataset.pitch = String(state.pitch);
}
function updatePackage() {
  const asset = selectedAsset(); if (!asset) return;
  const relative = asset.lods[state.lod]; const filename = relative.split('/').at(-1); const dimensions = asset.bounds.size;
  document.body.dataset.asset = asset.id; document.body.dataset.lod = String(state.lod);
  dom['selected-combat-category'].textContent = `${asset.category.toUpperCase()} / ${asset.kind.toUpperCase()}`;
  dom['selected-combat-name'].textContent = asset.name; dom['selected-combat-description'].textContent = asset.description;
  dom['selected-combat-dimensions'].textContent = `${dimensions.map((value) => value.toFixed(2)).join(' × ')} m`;
  dom['selected-combat-mount'].textContent = asset.kind === 'turret' ? 'Roof ring' : 'Centered reference';
  dom['selected-combat-muzzles'].textContent = asset.kind === 'turret' ? String(asset.muzzles.length) : 'Guidance only';
  dom['selected-combat-origin'].textContent = asset.kind === 'turret' ? 'Mount zero' : 'Geometric center'; dom['selected-combat-master'].textContent = asset.master;
  dom['stage-combat-lod'].textContent = `${asset.shortName.toUpperCase()} / LOD${state.lod}`; dom['stage-combat-name'].textContent = asset.name;
  dom['stage-combat-class'].textContent = `${asset.class.toUpperCase()} / +Z FORWARD`;
  dom['package-combat-name'].textContent = `${asset.name} / LOD${state.lod}`; dom['package-combat-triangles'].textContent = formatNumber(asset.lodTriangles[state.lod]);
  dom['package-combat-size'].textContent = formatBytes(asset[`lod${state.lod}Bytes`]); dom['package-combat-master-tris'].textContent = formatNumber(asset.triangles);
  dom['package-combat-collision'].textContent = `${formatNumber(asset.collisionTriangles)} tris`; dom['package-combat-master'].textContent = asset.master;
  dom['download-combat-model'].href = assetUrl(relative); dom['download-combat-model'].download = filename; dom['download-combat-model'].innerHTML = `Download LOD${state.lod} GLB <span>↓</span>`;
  dom['download-combat-collision'].href = assetUrl(asset.collision); dom['download-combat-collision'].download = asset.collision.split('/').at(-1);
  dom['active-combat-file'].textContent = relative; buildAssetList(); buildLodList(); buildSocketList(asset); updateRigUI();
}

function applyRig() {
  if (currentPivots.yaw) currentPivots.yaw.rotation.y = THREE.MathUtils.degToRad(state.yaw);
  if (currentPivots.pitch) currentPivots.pitch.rotation.x = -THREE.MathUtils.degToRad(state.pitch);
  currentModel?.updateMatrixWorld(true);
}
function applyWireframe() {
  currentModel?.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => { if (material.isMeshStandardMaterial) material.wireframe = state.wireframe; });
  });
  document.body.dataset.wireframe = String(state.wireframe); dom['toggle-combat-wireframe'].setAttribute('aria-pressed', String(state.wireframe));
}
function applyMarkers() {
  currentModel?.traverse((node) => { if (node.userData.previewSocketMarker) node.visible = state.markers; });
  document.body.dataset.markers = state.markers ? 'visible' : 'hidden'; dom['toggle-combat-markers'].setAttribute('aria-pressed', String(state.markers));
}
async function showSelected(focus = false) {
  const asset = selectedAsset(); if (!asset) return;
  const token = ++state.loadToken; const level = state.lod;
  setLoading(true, `Loading ${asset.shortName}`, `LOD${level} · ${formatNumber(asset.lodTriangles[level])} triangles · local GLB`); dom['combat-error'].hidden = true;
  try {
    const object = await loadModel(asset, level);
    if (token !== state.loadToken || state.selected !== asset.id || state.lod !== level) return;
    if (currentModel) { modelAnchor.remove(currentModel); disposePreview(currentModel); }
    currentModel = object; currentPivots = { yaw: object.getObjectByName('YawPivot') || null, pitch: object.getObjectByName('PitchPivot') || null };
    modelAnchor.add(currentModel); applyRig(); applyWireframe(); applyMarkers();
    state.ready = true; document.body.dataset.assetReady = 'true'; dom['combat-poster'].classList.add('is-hidden'); setLoading(false);
    dom['combat-loader-progress'].style.width = '100%'; if (focus) setView('iso', true); else setView(state.view, true);
  } catch (error) {
    if (token !== state.loadToken) return;
    console.error('Combat asset loading failed', error); setLoading(false); dom['combat-error-message'].textContent = error.message; dom['combat-error'].hidden = false;
  }
}
function selectAsset(id) {
  if (!state.manifest?.assets.some((asset) => asset.id === id) || id === state.selected && currentModel) return;
  state.selected = id; state.lod = lodSelections.get(id) ?? 0; updatePackage(); showSelected(true);
}
function selectLod(level) {
  const asset = selectedAsset(); if (!asset || ![0, 1, 2, 3].includes(level) || level === state.lod && currentModel) return;
  state.lod = level; lodSelections.set(asset.id, level); updatePackage(); showSelected(false);
}

const CAMERA_DIRECTIONS = { iso: new THREE.Vector3(1, 0.62, 1.35).normalize(), side: new THREE.Vector3(1, 0.24, 0.04).normalize(), front: new THREE.Vector3(0, 0.2, 1).normalize(), top: new THREE.Vector3(0.08, 1, 0.28).normalize() };
function setView(view, instant = false) {
  if (!currentModel || !CAMERA_DIRECTIONS[view]) return;
  state.view = view; document.body.dataset.view = view;
  document.querySelectorAll('.combat-camera-dock [data-view]').forEach((button) => { const active = button.dataset.view === view; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  currentModel.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(currentModel); const size = bounds.getSize(new THREE.Vector3()); const target = bounds.getCenter(new THREE.Vector3());
  target.y = Math.max(0.35, target.y); const radius = size.length() * 0.5;
  const distance = Math.max(2.2, radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.16);
  const position = CAMERA_DIRECTIONS[view].clone().multiplyScalar(distance).add(target); controls.minDistance = Math.max(0.8, distance * 0.25); controls.maxDistance = distance * 3.2;
  if (instant || reducedMotion) { camera.position.copy(position); controls.target.copy(target); controls.update(); state.cameraTween = null; }
  else state.cameraTween = { start: performance.now(), fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), position, target };
}
function animate(time) {
  if (state.cameraTween) {
    const tween = state.cameraTween; const progress = Math.min(1, (time - tween.start) / 460); const eased = 1 - (1 - progress) ** 3;
    camera.position.lerpVectors(tween.fromPosition, tween.position, eased); controls.target.lerpVectors(tween.fromTarget, tween.target, eased); if (progress >= 1) state.cameraTween = null;
  }
  controls.autoRotate = state.autoRotate && !reducedMotion; controls.update(); renderer.render(scene, camera);
}

for (const key of ['yaw', 'pitch']) dom[`combat-${key}`].addEventListener('input', () => {
  const asset = selectedAsset(); if (!asset || asset.kind !== 'turret') return;
  state[key] = Number(dom[`combat-${key}`].value); rigSelections.set(asset.id, { yaw: state.yaw, pitch: state.pitch });
  dom[`combat-${key}-value`].textContent = `${state[key]}°`; document.body.dataset[key] = String(state[key]); applyRig();
});
dom['reset-combat-rig'].addEventListener('click', () => { const asset = selectedAsset(); if (!asset) return; rigSelections.set(asset.id, { yaw: 0, pitch: 0 }); updateRigUI(); applyRig(); });
dom['toggle-combat-markers'].addEventListener('click', () => { state.markers = !state.markers; applyMarkers(); });
dom['toggle-combat-wireframe'].addEventListener('click', () => { state.wireframe = !state.wireframe; applyWireframe(); });
dom['toggle-combat-orbit'].addEventListener('click', () => { state.autoRotate = !state.autoRotate; dom['toggle-combat-orbit'].setAttribute('aria-pressed', String(state.autoRotate)); document.body.dataset.autoOrbit = String(state.autoRotate); });
dom['reset-combat-view'].addEventListener('click', () => { state.autoRotate = false; dom['toggle-combat-orbit'].setAttribute('aria-pressed', 'false'); document.body.dataset.autoOrbit = 'false'; setView('iso'); });
dom['retry-combat'].addEventListener('click', () => showSelected(false));
document.querySelectorAll('.combat-camera-dock [data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

async function init() {
  try {
    initScene(); const response = await fetch(assetUrl('assets/combat/combat.json')); if (!response.ok) throw new Error(`Manifest returned HTTP ${response.status}`);
    state.manifest = await response.json(); if (!Array.isArray(state.manifest.assets) || !state.manifest.assets.some((asset) => asset.id === state.selected)) throw new Error('Combat package inventory is invalid');
    updatePackage(); await showSelected(true);
  } catch (error) {
    console.error('Combat Lab initialization failed', error); setLoading(false); dom['combat-error-message'].textContent = error.message; dom['combat-error'].hidden = false;
  }
}
init();
