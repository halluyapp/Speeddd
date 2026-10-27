import './drivers.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE_URL = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE_URL}${path.replace(/^\//, '')}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const query = new URLSearchParams(window.location.search);
const queryLod = Number(query.get('lod'));
const CAMERA_VIEWS = ['fixture', 'iso', 'front', 'profile', 'top'];
const dom = Object.fromEntries([
  'driver-stage', 'driver-canvas', 'driver-poster', 'driver-loader', 'driver-loader-title', 'driver-loader-detail', 'driver-loader-progress',
  'driver-error', 'driver-error-message', 'retry-driver', 'driver-asset-list', 'selected-driver-discipline', 'selected-driver-name',
  'selected-driver-description', 'selected-driver-height', 'selected-driver-capsule', 'selected-driver-master', 'stage-driver-lod',
  'stage-driver-name', 'stage-driver-class', 'toggle-driver-joints', 'toggle-driver-wireframe', 'toggle-driver-orbit', 'reset-driver-view',
  'driver-shot-label', 'driver-clip-name', 'driver-clip-state', 'toggle-driver-play', 'restart-driver-clip', 'driver-timeline', 'driver-time',
  'driver-speed', 'driver-shot-list', 'package-driver-name', 'package-driver-triangles', 'package-driver-size', 'driver-lod-list',
  'package-driver-master-tris', 'package-driver-collision', 'download-driver-model', 'download-driver-collision', 'driver-rig-list',
  'package-driver-master', 'active-driver-file',
].map((id) => [id, document.getElementById(id)]));

const state = {
  manifest: null, ready: false, selected: query.get('driver') || 'v84', lod: [0, 1, 2, 3].includes(queryLod) ? queryLod : 0,
  shot: query.get('shot') || 'grid-ready', view: CAMERA_VIEWS.includes(query.get('view')) ? query.get('view') : 'fixture',
  joints: false, wireframe: false, autoRotate: false, playing: !reducedMotion, playhead: 0, speed: 1,
  loadToken: 0, cameraTween: null,
};
const cache = new Map();
const pending = new Map();
const lodSelections = new Map();
let renderer;
let scene;
let camera;
let controls;
let loader;
let modelAnchor;
let currentModel = null;
let currentClips = [];
let mixer = null;
let currentAction = null;
let resizeObserver;
let jointMarkerGeometry;
let jointMarkerMaterial;
let lastFrameTime = 0;

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);
const formatBytes = (bytes) => bytes < 1e6 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1e6).toFixed(1)} MB`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
const selectedAsset = () => state.manifest?.assets.find((asset) => asset.id === state.selected);
const selectedShot = () => state.manifest?.cinematics.find((shot) => shot.id === state.shot);
const selectedClipDefinition = () => selectedAsset()?.animations.find((clip) => clip.name === selectedShot()?.clip);

function initScene() {
  const width = Math.max(1, dom['driver-stage'].clientWidth); const height = Math.max(1, dom['driver-stage'].clientHeight);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6)); renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; dom['driver-canvas'].appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color('#101a1e'); scene.fog = new THREE.Fog('#101a1e', 12, 32);
  camera = new THREE.PerspectiveCamera(34, width / height, 0.025, 80); camera.position.set(2.2, 1.35, 3.4);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.enablePan = true; controls.minDistance = 0.8; controls.maxDistance = 12; controls.minPolarAngle = 0.04; controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotateSpeed = 0.5; controls.target.set(0, 0.95, 0); controls.addEventListener('start', () => { state.cameraTween = null; });

  const pmrem = new THREE.PMREMGenerator(renderer); const room = new RoomEnvironment(); scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.9; room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xe8f5f0, 0x18262c, 1.6));
  const key = new THREE.DirectionalLight(0xf4f5e9, 3.4); key.position.set(3.5, 6, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 4, bottom: -2, near: 0.4, far: 16 }); key.shadow.bias = -0.0002; scene.add(key);
  const fill = new THREE.DirectionalLight(0x72dbe5, 1.45); fill.position.set(-4, 3, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd7ff3f, 1.2); rim.position.set(1, 4, -4); scene.add(rim);

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.45, 0.12, 72), new THREE.MeshStandardMaterial({ color: '#17252a', metalness: 0.55, roughness: 0.57 }));
  floor.position.y = -0.075; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(4.6, 16, '#456064', '#293e43'); grid.position.y = -0.008; grid.material.transparent = true; grid.material.opacity = 0.28; scene.add(grid);
  for (const [radius, color, opacity] of [[1.8, '#7f9b98', 0.34], [2.15, '#66e7ed', 0.16]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.012, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.006; scene.add(ring);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.008, 5, 96), new THREE.MeshBasicMaterial({ color: '#7ca4a5', transparent: true, opacity: 0.17 }));
  halo.position.set(0, 1.25, -0.85); scene.add(halo);
  modelAnchor = new THREE.Group(); modelAnchor.name = 'Isolated animated driver preview'; modelAnchor.position.y = 0.008; scene.add(modelAnchor);
  jointMarkerGeometry = new THREE.SphereGeometry(0.026, 10, 7);
  jointMarkerMaterial = new THREE.MeshBasicMaterial({ color: '#d7ff3f', depthTest: false, transparent: true, opacity: 0.95 });
  loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  resizeObserver = new ResizeObserver(onResize); resizeObserver.observe(dom['driver-stage']); window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, dom['driver-stage'].clientWidth); const height = Math.max(1, dom['driver-stage'].clientHeight);
  camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; if (currentModel) setView(state.view, true);
}

function prepareObject(source) {
  const object = source.clone(true);
  object.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true; node.receiveShadow = true;
      node.material = Array.isArray(node.material) ? node.material.map((material) => material.clone()) : node.material.clone();
    }
    if (node.userData.velocityRole === 'driver-joint') {
      const marker = new THREE.Mesh(jointMarkerGeometry, jointMarkerMaterial); marker.name = `Preview_${node.name}`; marker.userData.previewJointMarker = true;
      marker.visible = state.joints; marker.renderOrder = 30; node.add(marker);
    }
  });
  return object;
}
async function loadModel(asset, level) {
  const key = `${asset.id}:${level}`;
  if (!cache.has(key)) {
    if (!pending.has(key)) {
      const promise = loader.loadAsync(assetUrl(asset.lods[level]), (event) => {
        if (event.total) dom['driver-loader-progress'].style.width = `${Math.max(4, event.loaded / event.total * 100)}%`;
      }).then((gltf) => {
        if (!gltf.animations || gltf.animations.length !== 4) throw new Error(`${asset.id} LOD${level} did not retain four clips`);
        cache.set(key, gltf); pending.delete(key); return gltf;
      }).catch((error) => { pending.delete(key); throw error; });
      pending.set(key, promise);
    }
    await pending.get(key);
  }
  return cache.get(key);
}
function disposePreview(object) {
  object.traverse((node) => {
    if (!node.material || node.userData.previewJointMarker) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material]; materials.forEach((material) => material.dispose());
  });
}
function setLoading(visible, title = 'Preparing Driver Lab', detail = 'Illustrated preview · rig loading…') {
  dom['driver-loader'].classList.toggle('is-complete', !visible); dom['driver-loader-title'].textContent = title; dom['driver-loader-detail'].textContent = detail;
  if (visible) dom['driver-loader-progress'].style.width = '4%';
}
function syncQuery() {
  const url = new URL(window.location.href); url.searchParams.set('driver', state.selected); url.searchParams.set('shot', state.shot); url.searchParams.set('lod', String(state.lod)); url.searchParams.set('view', state.view);
  window.history.replaceState(null, '', url);
}

function buildAssetList() {
  dom['driver-asset-list'].innerHTML = state.manifest.assets.map((asset, index) => `
    <button type="button" data-asset="${asset.id}" class="${asset.id === state.selected ? 'active' : ''}" aria-pressed="${asset.id === state.selected}">
      <img src="${assetUrl(asset.thumbnail)}" width="55" height="48" alt="" loading="lazy" /><span><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.discipline)}</small></span><b>${String(index + 1).padStart(2, '0')}</b>
    </button>`).join('');
  dom['driver-asset-list'].querySelectorAll('[data-asset]').forEach((button) => button.addEventListener('click', () => selectAsset(button.dataset.asset)));
}
function buildShotList() {
  dom['driver-shot-list'].innerHTML = state.manifest.cinematics.map((shot) => `
    <button type="button" data-shot="${shot.id}" class="${shot.id === state.shot ? 'active' : ''}" aria-pressed="${shot.id === state.shot}" title="${escapeHtml(shot.description)}">
      <strong>${escapeHtml(shot.name)}</strong><small>${shot.clip} · ${shot.duration.toFixed(1)} s${shot.loop ? ' · loop' : ''}</small>
    </button>`).join('');
  dom['driver-shot-list'].querySelectorAll('[data-shot]').forEach((button) => button.addEventListener('click', () => selectShot(button.dataset.shot)));
}
function buildLodList() {
  const asset = selectedAsset(); if (!asset) return;
  dom['driver-lod-list'].innerHTML = [0, 1, 2, 3].map((level) => `<button type="button" data-lod="${level}" class="${level === state.lod ? 'active' : ''}" aria-pressed="${level === state.lod}" title="${formatNumber(asset.lodTriangles[level])} triangles · ${formatBytes(asset[`lod${level}Bytes`])}">${`LOD${level}`}</button>`).join('');
  dom['driver-lod-list'].querySelectorAll('[data-lod]').forEach((button) => button.addEventListener('click', () => selectLod(Number(button.dataset.lod))));
}
function buildRigList() {
  const asset = selectedAsset(); if (!asset) return;
  dom['driver-rig-list'].innerHTML = [asset.rig.root, ...asset.rig.joints].map((name) => `<span>${name}</span>`).join('');
}
function updatePlaybackUI() {
  const shot = selectedShot(); const definition = selectedClipDefinition(); if (!shot || !definition) return;
  dom['driver-shot-label'].textContent = shot.name.toUpperCase(); dom['driver-clip-name'].textContent = definition.name;
  dom['driver-clip-state'].textContent = `${definition.loop ? 'LOOP' : 'ONCE'} · ${definition.duration.toFixed(1)} S`;
  dom['driver-timeline'].max = String(definition.duration); dom['driver-timeline'].value = String(Math.min(state.playhead, definition.duration));
  dom['driver-time'].textContent = `${Math.min(state.playhead, definition.duration).toFixed(2)} / ${definition.duration.toFixed(2)}`;
  const ended = !definition.loop && state.playhead >= definition.duration - 0.001;
  dom['toggle-driver-play'].textContent = state.playing ? 'Pause' : ended ? 'Replay' : 'Play'; dom['toggle-driver-play'].setAttribute('aria-label', state.playing ? 'Pause animation' : ended ? 'Replay animation' : 'Play animation');
  document.body.dataset.playing = String(state.playing); document.body.dataset.clip = definition.name; document.body.dataset.shot = shot.id;
  document.body.dataset.clipTime = Math.min(state.playhead, definition.duration).toFixed(2); document.body.dataset.speed = String(state.speed);
}
function updatePackage() {
  const asset = selectedAsset(); if (!asset) return;
  const relative = asset.lods[state.lod]; const filename = relative.split('/').at(-1);
  document.body.dataset.asset = asset.id; document.body.dataset.lod = String(state.lod); document.body.dataset.view = state.view;
  dom['selected-driver-discipline'].textContent = asset.discipline.toUpperCase(); dom['selected-driver-name'].textContent = asset.name;
  dom['selected-driver-description'].textContent = asset.description; dom['selected-driver-height'].textContent = `${asset.height.toFixed(3)} m`;
  dom['selected-driver-capsule'].textContent = `${formatNumber(asset.collisionTriangles)} triangles`; dom['selected-driver-master'].textContent = asset.master;
  dom['stage-driver-lod'].textContent = `${asset.shortName.toUpperCase()} / LOD${state.lod}`; dom['stage-driver-name'].textContent = asset.name;
  dom['stage-driver-class'].textContent = `${asset.discipline.toUpperCase()} · +Z FORWARD`;
  dom['package-driver-name'].textContent = `${asset.name} / LOD${state.lod}`; dom['package-driver-triangles'].textContent = formatNumber(asset.lodTriangles[state.lod]);
  dom['package-driver-size'].textContent = formatBytes(asset[`lod${state.lod}Bytes`]); dom['package-driver-master-tris'].textContent = formatNumber(asset.triangles);
  dom['package-driver-collision'].textContent = `${formatNumber(asset.collisionTriangles)} tris`; dom['package-driver-master'].textContent = asset.master;
  dom['download-driver-model'].href = assetUrl(relative); dom['download-driver-model'].download = filename; dom['download-driver-model'].innerHTML = `Download LOD${state.lod} GLB <span>↓</span>`;
  dom['download-driver-collision'].href = assetUrl(asset.collision); dom['download-driver-collision'].download = asset.collision.split('/').at(-1);
  dom['active-driver-file'].textContent = relative; buildAssetList(); buildShotList(); buildLodList(); buildRigList(); updatePlaybackUI(); syncQuery();
}

function applyWireframe() {
  currentModel?.traverse((node) => {
    if (!node.isMesh || !node.material || node.userData.previewJointMarker) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => { if (material.isMeshStandardMaterial) material.wireframe = state.wireframe; });
  });
  document.body.dataset.wireframe = String(state.wireframe); dom['toggle-driver-wireframe'].setAttribute('aria-pressed', String(state.wireframe));
}
function applyJoints() {
  currentModel?.traverse((node) => { if (node.userData.previewJointMarker) node.visible = state.joints; });
  document.body.dataset.joints = state.joints ? 'visible' : 'hidden'; dom['toggle-driver-joints'].setAttribute('aria-pressed', String(state.joints));
}
function activateClip() {
  const shot = selectedShot(); const definition = selectedClipDefinition(); if (!mixer || !shot || !definition) return;
  const clip = currentClips.find((item) => item.name === shot.clip); if (!clip) throw new Error(`Embedded clip ${shot.clip} is unavailable`);
  mixer.stopAllAction(); currentAction = mixer.clipAction(clip); currentAction.reset();
  currentAction.setLoop(definition.loop ? THREE.LoopRepeat : THREE.LoopOnce, definition.loop ? Infinity : 1);
  currentAction.clampWhenFinished = true; currentAction.timeScale = state.speed; currentAction.time = Math.min(state.playhead, definition.duration);
  currentAction.paused = !state.playing; currentAction.play(); mixer.update(0); updatePlaybackUI();
}
async function showSelected(focus = false) {
  const asset = selectedAsset(); if (!asset) return;
  const token = ++state.loadToken; const level = state.lod; if (focus) state.playhead = 0;
  setLoading(true, `Loading ${asset.shortName}`, `LOD${level} · four embedded clips · local GLB`); dom['driver-error'].hidden = true;
  try {
    const gltf = await loadModel(asset, level);
    if (token !== state.loadToken || state.selected !== asset.id || state.lod !== level) return;
    if (currentModel) { modelAnchor.remove(currentModel); disposePreview(currentModel); }
    currentModel = prepareObject(gltf.scene); modelAnchor.add(currentModel); currentClips = gltf.animations; mixer = new THREE.AnimationMixer(currentModel);
    applyWireframe(); applyJoints(); activateClip();
    state.ready = true; document.body.dataset.assetReady = 'true'; dom['driver-poster'].classList.add('is-hidden'); setLoading(false);
    dom['driver-loader-progress'].style.width = '100%'; setView(state.view, true);
  } catch (error) {
    if (token !== state.loadToken) return;
    console.error('Driver asset loading failed', error); setLoading(false); dom['driver-error-message'].textContent = error.message; dom['driver-error'].hidden = false;
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
function selectShot(id) {
  const shot = state.manifest?.cinematics.find((item) => item.id === id); if (!shot) return;
  state.shot = id; state.view = 'fixture'; state.playhead = 0; state.playing = true; updatePackage(); activateClip(); setView('fixture');
}
function setPlaying(playing) {
  const definition = selectedClipDefinition(); if (!definition) return;
  if (playing && !definition.loop && state.playhead >= definition.duration - 0.001) {
    state.playhead = 0; currentAction?.reset(); if (currentAction) currentAction.play();
  }
  state.playing = playing; if (currentAction) currentAction.paused = !playing; updatePlaybackUI();
}
function restartClip() {
  state.playhead = 0; state.playing = true;
  if (currentAction) { currentAction.reset(); currentAction.timeScale = state.speed; currentAction.paused = false; currentAction.play(); mixer.update(0); }
  updatePlaybackUI();
}

const CAMERA_DIRECTIONS = {
  iso: new THREE.Vector3(1, 0.42, 1.35).normalize(), front: new THREE.Vector3(0, 0.15, 1).normalize(),
  profile: new THREE.Vector3(1, 0.16, 0.04).normalize(), top: new THREE.Vector3(0.06, 1, 0.15).normalize(),
};
function setView(view, instant = false) {
  if (!CAMERA_VIEWS.includes(view)) return;
  state.view = view; document.body.dataset.view = view;
  document.querySelectorAll('.driver-camera-dock [data-view]').forEach((button) => { const active = button.dataset.view === view; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  syncQuery(); if (!currentModel) return;
  let position; let target;
  if (view === 'fixture') {
    const shot = selectedShot(); if (!shot) return;
    camera.fov = shot.camera.fov; position = new THREE.Vector3(...shot.camera.position); target = new THREE.Vector3(...shot.camera.target);
  } else {
    camera.fov = 36; currentModel.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(currentModel); const size = bounds.getSize(new THREE.Vector3()); target = bounds.getCenter(new THREE.Vector3());
    target.y = Math.max(0.7, target.y); const radius = size.length() * 0.5;
    const distance = Math.max(2.4, radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.5); position = CAMERA_DIRECTIONS[view].clone().multiplyScalar(distance).add(target);
  }
  camera.updateProjectionMatrix(); controls.minDistance = 0.65; controls.maxDistance = 12;
  if (instant || reducedMotion) { camera.position.copy(position); controls.target.copy(target); controls.update(); state.cameraTween = null; }
  else state.cameraTween = { start: performance.now(), fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), position, target };
}
function animate(time) {
  const delta = lastFrameTime ? Math.min(0.05, Math.max(0, (time - lastFrameTime) / 1000)) : 0; lastFrameTime = time;
  if (state.cameraTween) {
    const tween = state.cameraTween; const progress = Math.min(1, (time - tween.start) / 460); const eased = 1 - (1 - progress) ** 3;
    camera.position.lerpVectors(tween.fromPosition, tween.position, eased); controls.target.lerpVectors(tween.fromTarget, tween.target, eased); if (progress >= 1) state.cameraTween = null;
  }
  if (mixer && currentAction && state.playing) {
    mixer.update(delta); const definition = selectedClipDefinition();
    if (definition) {
      state.playhead = Math.min(currentAction.time, definition.duration);
      if (!definition.loop && currentAction.time >= definition.duration - 0.0001) { state.playhead = definition.duration; state.playing = false; currentAction.paused = true; }
      updatePlaybackUI();
    }
  }
  controls.autoRotate = state.autoRotate && !reducedMotion; controls.update(); renderer.render(scene, camera);
}

dom['toggle-driver-play'].addEventListener('click', () => setPlaying(!state.playing));
dom['restart-driver-clip'].addEventListener('click', restartClip);
dom['driver-timeline'].addEventListener('input', () => {
  const definition = selectedClipDefinition(); if (!definition) return;
  state.playing = false; state.playhead = THREE.MathUtils.clamp(Number(dom['driver-timeline'].value), 0, definition.duration);
  if (currentAction) { currentAction.paused = true; currentAction.time = state.playhead; mixer.update(0); } updatePlaybackUI();
});
dom['driver-speed'].addEventListener('change', () => {
  state.speed = Number(dom['driver-speed'].value); if (currentAction) currentAction.timeScale = state.speed; updatePlaybackUI();
});
dom['toggle-driver-joints'].addEventListener('click', () => { state.joints = !state.joints; applyJoints(); });
dom['toggle-driver-wireframe'].addEventListener('click', () => { state.wireframe = !state.wireframe; applyWireframe(); });
dom['toggle-driver-orbit'].addEventListener('click', () => { state.autoRotate = !state.autoRotate; dom['toggle-driver-orbit'].setAttribute('aria-pressed', String(state.autoRotate)); document.body.dataset.autoOrbit = String(state.autoRotate); });
dom['reset-driver-view'].addEventListener('click', () => { state.autoRotate = false; dom['toggle-driver-orbit'].setAttribute('aria-pressed', 'false'); document.body.dataset.autoOrbit = 'false'; setView('fixture'); });
dom['retry-driver'].addEventListener('click', () => showSelected(false));
document.querySelectorAll('.driver-camera-dock [data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

async function init() {
  try {
    initScene(); const response = await fetch(assetUrl('assets/drivers/drivers.json')); if (!response.ok) throw new Error(`Manifest returned HTTP ${response.status}`);
    state.manifest = await response.json(); if (!Array.isArray(state.manifest.assets) || !Array.isArray(state.manifest.cinematics)) throw new Error('Driver package inventory is invalid');
    if (!state.manifest.assets.some((asset) => asset.id === state.selected)) state.selected = state.manifest.assets[0]?.id;
    if (!state.manifest.cinematics.some((shot) => shot.id === state.shot)) state.shot = state.manifest.cinematics[0]?.id;
    if (!selectedAsset()) throw new Error('No fictional drivers are present in the manifest');
    updatePackage(); await showSelected(true);
  } catch (error) {
    console.error('Driver Lab initialization failed', error); setLoading(false); dom['driver-error-message'].textContent = error.message; dom['driver-error'].hidden = false;
  }
}
init();
