import './race.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE_URL = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE_URL}${path.replace(/^\//, '')}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dom = Object.fromEntries([
  'race-stage', 'race-canvas', 'race-poster', 'race-loader', 'race-loader-title', 'race-loader-detail', 'race-loader-progress',
  'race-error', 'race-error-message', 'retry-race', 'race-state-list', 'race-flag', 'race-flag-status', 'race-flag-message',
  'race-flag-detail', 'replay-start', 'race-hud', 'hud-event', 'hud-circuit', 'hud-lap', 'hud-total-laps', 'hud-status',
  'hud-message', 'start-sequence-hud', 'telemetry-position', 'telemetry-number', 'telemetry-tag', 'telemetry-vehicle',
  'telemetry-gap', 'telemetry-speed', 'telemetry-gear', 'telemetry-rpm', 'toggle-race-hud', 'toggle-race-orbit',
  'reset-race-view', 'stage-race-lod', 'timing-event', 'timing-rows', 'timing-best', 'timing-last', 'race-asset-list',
  'package-asset-name', 'package-triangles', 'package-size', 'race-lod-list', 'download-race-model', 'download-race-collision',
  'package-collision', 'package-control', 'package-master-path', 'active-race-file',
].map((id) => [id, document.getElementById(id)]));

const PLACEMENTS = {
  'race-start-lights': { position: [0, 0, -0.8], yaw: 0 },
  'race-timing-pylon': { position: [-6.5, 0, 0.2], yaw: 0.16 },
  'race-marshal-panel': { position: [6.7, 0, 0.6], yaw: -0.18 },
};
const CAMERA_DIRECTIONS = {
  overview: new THREE.Vector3(0.55, 0.42, 1).normalize(),
  'race-start-lights': new THREE.Vector3(0.5, 0.27, 1).normalize(),
  'race-timing-pylon': new THREE.Vector3(0.4, 0.2, 1).normalize(),
  'race-marshal-panel': new THREE.Vector3(-0.38, 0.22, 1).normalize(),
};

const state = {
  manifest: null,
  ready: false,
  selected: 'race-start-lights',
  lod: 0,
  view: 'overview',
  objects: new Map(),
  lods: new Map(),
  raceState: 'grid',
  lightCount: 0,
  autoRotate: false,
  hud: true,
  cameraTween: null,
  loadToken: 0,
  sequenceRunning: false,
  sequenceTimers: [],
};
const cache = new Map();
const pending = new Map();
const progress = new Map();

let renderer;
let scene;
let camera;
let controls;
let loader;
let kitGroup;
let resizeObserver;

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);
const formatBytes = (bytes) => bytes < 1e6 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1e6).toFixed(1)} MB`;

function initScene() {
  const width = Math.max(1, dom['race-stage'].clientWidth);
  const height = Math.max(1, dom['race-stage'].clientHeight);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  dom['race-canvas'].appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#111c20');
  scene.fog = new THREE.Fog('#111c20', 32, 72);
  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 140);
  camera.position.set(13, 10, 22);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = true;
  controls.minDistance = 3;
  controls.maxDistance = 65;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotateSpeed = 0.45;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.78;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xe5f6f1, 0x243036, 1.5));
  const key = new THREE.DirectionalLight(0xf2f6e9, 2.8);
  key.position.set(7, 13, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 45 });
  key.shadow.bias = -0.0003;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7fd5da, 1.15);
  fill.position.set(-10, 6, 5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd7ff3f, 0.65);
  rim.position.set(0, 7, -10);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(11.5, 11.5, 0.22, 72),
    new THREE.MeshStandardMaterial({ color: '#172429', metalness: 0.55, roughness: 0.58 }),
  );
  floor.position.y = -0.13;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(10.75, 10.79, 96),
    new THREE.MeshBasicMaterial({ color: '#6d8c88', transparent: true, opacity: 0.38, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.006;
  scene.add(ring);
  const grid = new THREE.GridHelper(21, 21, '#3b5456', '#24383c');
  grid.position.y = 0.008;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  kitGroup = new THREE.Group();
  kitGroup.name = 'Race Control runtime package';
  scene.add(kitGroup);
  loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(dom['race-stage']);
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, dom['race-stage'].clientWidth);
  const height = Math.max(1, dom['race-stage'].clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  if (state.ready) setView(state.view, true);
}

function prepareObject(object, id) {
  const placement = PLACEMENTS[id];
  object.position.fromArray(placement.position);
  object.rotation.y = placement.yaw;
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.userData.velocityRole === 'start-light' || node.userData.velocityRole === 'flag-display' || node.userData.velocityRole === 'flag-display-led') {
      node.material = node.material.clone();
    }
  });
  return object;
}

async function loadModel(asset, level) {
  const key = `${asset.id}:${level}`;
  if (!cache.has(key)) {
    if (!pending.has(key)) {
      progress.set(asset.id, 0);
      const promise = loader.loadAsync(assetUrl(asset.lods[level]), (event) => {
        if (event.total) progress.set(asset.id, event.loaded / event.total);
        const values = [...progress.values()];
        const total = values.length ? values.reduce((sum, value) => sum + value, 0) / Math.max(3, values.length) : 0;
        dom['race-loader-progress'].style.width = `${Math.max(4, total * 100)}%`;
      }).then((gltf) => {
        cache.set(key, gltf.scene);
        progress.set(asset.id, 1);
        pending.delete(key);
        return gltf.scene;
      }).catch((error) => {
        pending.delete(key);
        throw error;
      });
      pending.set(key, promise);
    }
    await pending.get(key);
  }
  return prepareObject(cache.get(key).clone(true), asset.id);
}

function setLoading(visible, title = 'Preparing Race Control', detail = 'Illustrated preview · 3D loading…') {
  dom['race-loader'].classList.toggle('is-complete', !visible);
  dom['race-loader-title'].textContent = title;
  dom['race-loader-detail'].textContent = detail;
}

function selectedAsset() {
  return state.manifest?.assets.find((asset) => asset.id === state.selected);
}

function buildAssetList() {
  dom['race-asset-list'].innerHTML = state.manifest.assets.map((asset) => `
    <button type="button" data-asset="${asset.id}" class="${asset.id === state.selected ? 'active' : ''}" aria-pressed="${asset.id === state.selected}">
      <span>${asset.shortName}</span><small>${formatNumber(asset.triangles)} tris</small>
    </button>
  `).join('');
  dom['race-asset-list'].querySelectorAll('[data-asset]').forEach((button) => {
    button.addEventListener('click', () => selectAsset(button.dataset.asset));
  });
}

function buildLodList() {
  const asset = selectedAsset();
  if (!asset) return;
  dom['race-lod-list'].innerHTML = [0, 1, 2, 3].map((level) => `
    <button type="button" data-lod="${level}" class="${level === state.lod ? 'active' : ''}" aria-pressed="${level === state.lod}" title="${formatNumber(asset.lodTriangles[level])} triangles · ${formatBytes(asset[`lod${level}Bytes`])}">LOD${level}</button>
  `).join('');
  dom['race-lod-list'].querySelectorAll('[data-lod]').forEach((button) => {
    button.addEventListener('click', () => selectLod(Number(button.dataset.lod)));
  });
}

function updatePackage() {
  const asset = selectedAsset();
  if (!asset) return;
  const level = state.lods.get(asset.id) ?? state.lod ?? 0;
  const relative = asset.lods[level];
  const filename = relative.split('/').at(-1);
  dom['package-asset-name'].textContent = `${asset.name} / LOD${level}`;
  dom['package-triangles'].textContent = formatNumber(asset.lodTriangles[level]);
  dom['package-size'].textContent = formatBytes(asset[`lod${level}Bytes`]);
  dom['download-race-model'].href = assetUrl(relative);
  dom['download-race-model'].download = filename;
  dom['download-race-model'].innerHTML = `Download LOD${level} GLB <span>↓</span>`;
  dom['download-race-collision'].href = assetUrl(asset.collision);
  dom['download-race-collision'].download = asset.collision.split('/').at(-1);
  dom['package-collision'].textContent = `${formatNumber(asset.collisionTriangles)} tris`;
  dom['package-control'].textContent = asset.control.type === 'start-lights' ? '10 named lenses' : asset.control.type === 'flag-display' ? 'Addressable display' : '8 static rows';
  dom['package-master-path'].textContent = asset.master;
  dom['active-race-file'].textContent = relative;
  dom['stage-race-lod'].textContent = `${asset.shortName.toUpperCase()} / LOD${level}`;
  document.body.dataset.lod = String(level);
  buildLodList();
  buildAssetList();
}

function selectAsset(id, focus = true) {
  if (!state.manifest?.assets.some((asset) => asset.id === id)) return;
  state.selected = id;
  state.lod = state.lods.get(id) ?? 0;
  updatePackage();
  if (focus) setView(id);
}

async function selectLod(level) {
  const asset = selectedAsset();
  if (!asset || !state.ready || level === (state.lods.get(asset.id) ?? 0)) return;
  const previous = state.lods.get(asset.id) ?? 0;
  const token = ++state.loadToken;
  state.lod = level;
  buildLodList();
  setLoading(true, `Loading ${asset.shortName}`, `LOD${level} · ${formatNumber(asset.lodTriangles[level])} triangles`);
  dom['race-error'].hidden = true;
  try {
    const object = await loadModel(asset, level);
    if (token !== state.loadToken || state.selected !== asset.id) return;
    const old = state.objects.get(asset.id);
    if (old) kitGroup.remove(old);
    kitGroup.add(object);
    state.objects.set(asset.id, object);
    state.lods.set(asset.id, level);
    state.lod = level;
    applyLightAndPanelState();
    updatePackage();
    setLoading(false);
  } catch (error) {
    console.error('Failed to load race asset LOD', error);
    state.lod = previous;
    buildLodList();
    setLoading(false);
    dom['race-error-message'].textContent = error.message || 'The local presentation GLB could not be read.';
    dom['race-error'].hidden = false;
  }
}

function setView(view, instant = false) {
  if (!state.ready || !camera || !controls) return;
  state.view = view;
  document.body.dataset.view = view;
  document.querySelectorAll('.race-camera-dock [data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const bounds = new THREE.Box3();
  if (view === 'overview') {
    for (const object of state.objects.values()) bounds.expandByObject(object);
  } else {
    const object = state.objects.get(view);
    if (object) bounds.setFromObject(object);
  }
  if (bounds.isEmpty()) return;
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const padding = view === 'overview' ? 1.03 : view === 'race-timing-pylon' ? 1.58 : 1.38;
  const distance = (sphere.radius / Math.sin(limitingFov / 2)) * padding;
  const direction = CAMERA_DIRECTIONS[view] || CAMERA_DIRECTIONS.overview;
  const destination = sphere.center.clone().addScaledVector(direction, distance);
  const target = sphere.center.clone();
  if (view === 'overview') target.y += 0.15;
  if (instant || reducedMotion || !state.objects.size) {
    camera.position.copy(destination);
    controls.target.copy(target);
    controls.update();
    state.cameraTween = null;
    controls.enabled = true;
  } else {
    state.cameraTween = {
      start: performance.now(), duration: 800,
      fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), destination, target,
    };
    controls.enabled = false;
  }
}

function buildTimingAndDemo() {
  const { demo } = state.manifest;
  const { event, driver } = demo;
  dom['hud-event'].textContent = event.shortName;
  dom['hud-circuit'].textContent = event.circuit;
  dom['hud-lap'].textContent = String(event.lap).padStart(2, '0');
  dom['hud-total-laps'].textContent = event.totalLaps;
  dom['timing-event'].textContent = event.name;
  dom['timing-best'].textContent = driver.bestLap;
  dom['timing-last'].textContent = driver.lastLap;
  dom['telemetry-position'].textContent = driver.position;
  dom['telemetry-number'].textContent = `#${driver.number}`;
  dom['telemetry-tag'].textContent = driver.tag;
  dom['telemetry-vehicle'].textContent = driver.vehicle;
  dom['telemetry-gap'].textContent = `GAP ${driver.gap}`;
  dom['telemetry-speed'].textContent = driver.speedKmh;
  dom['telemetry-gear'].textContent = driver.gear;
  dom['telemetry-rpm'].style.width = `${Math.round(driver.rpm * 100)}%`;
  const sectorColors = { purple: '#c486ff', green: '#55dfa0', yellow: '#ffd83d' };
  dom['timing-rows'].innerHTML = demo.standings.map((entry) => `
    <div class="timing-row${entry.position === driver.position ? ' focus' : ''}" style="--sector:${sectorColors[entry.sector] || '#597075'}">
      <span class="timing-position">${String(entry.position).padStart(2, '0')}</span>
      <span class="timing-driver"><strong>${entry.tag}</strong><small>#${entry.number}</small></span>
      <span class="timing-gap">${entry.gap}</span><span class="timing-last">${entry.lastLap}</span>
    </div>
  `).join('');
}

function updateStartLightHud() {
  dom['start-sequence-hud'].hidden = state.raceState !== 'armed';
  dom['start-sequence-hud'].querySelectorAll('[data-light]').forEach((column) => {
    column.classList.toggle('active', Number(column.dataset.light) < state.lightCount);
  });
}

function applyLightAndPanelState() {
  const config = state.manifest?.demo.states[state.raceState];
  if (!config) return;
  const start = state.objects.get('race-start-lights');
  start?.traverse((node) => {
    const index = node.userData.startLightIndex;
    if (!Number.isInteger(index) || !node.material) return;
    const active = index < state.lightCount;
    node.material.color.set(active ? '#8f0712' : '#32090c');
    node.material.emissive.set(active ? '#ff0008' : '#120000');
    node.material.emissiveIntensity = active ? 1.1 : 0.15;
  });
  const panel = state.objects.get('race-marshal-panel');
  panel?.traverse((node) => {
    const role = node.userData.velocityRole;
    if (!['flag-display', 'flag-display-led'].includes(role) || !node.material) return;
    const led = role === 'flag-display-led';
    const quietState = ['grid', 'finish', 'results'].includes(state.raceState);
    node.material.color.set(led ? config.panelColor : '#0a1512');
    if (led) node.material.color.multiplyScalar(0.3);
    node.material.emissive.set(config.panelColor);
    node.material.emissiveIntensity = led ? (quietState ? 0.42 : 0.82) : 0.28;
  });
  updateStartLightHud();
}

function setLightCount(count) {
  state.lightCount = THREE.MathUtils.clamp(count, 0, 5);
  document.body.dataset.lightCount = String(state.lightCount);
  applyLightAndPanelState();
}

function stopSequence() {
  state.sequenceTimers.forEach((timer) => clearTimeout(timer));
  state.sequenceTimers = [];
  state.sequenceRunning = false;
  dom['replay-start'].disabled = !state.ready;
  document.body.dataset.sequence = 'idle';
}

function setRaceState(name, fromSequence = false) {
  const config = state.manifest?.demo.states[name];
  if (!config) return;
  if (!fromSequence) stopSequence();
  state.raceState = name;
  state.lightCount = config.lightCount;
  document.body.dataset.raceState = name;
  document.body.dataset.lightCount = String(state.lightCount);
  dom['race-state-list'].querySelectorAll('[data-state]').forEach((button) => {
    const active = button.dataset.state === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  dom['race-flag'].src = assetUrl(state.manifest.graphics.flags[config.flag]);
  dom['race-flag'].alt = `${config.flag[0].toUpperCase()}${config.flag.slice(1)} racing flag`;
  dom['race-flag-status'].textContent = config.status;
  dom['race-flag-message'].textContent = config.message;
  dom['race-flag-detail'].textContent = config.detail;
  dom['hud-status'].textContent = config.status;
  dom['hud-message'].textContent = config.message;
  applyLightAndPanelState();
}

function replaySequence() {
  if (!state.ready || state.sequenceRunning) return;
  stopSequence();
  setRaceState('armed', true);
  state.sequenceRunning = true;
  document.body.dataset.sequence = 'running';
  dom['replay-start'].disabled = true;
  setLightCount(0);
  const stepDuration = reducedMotion ? 180 : 520;
  for (let index = 1; index <= 5; index += 1) {
    state.sequenceTimers.push(setTimeout(() => setLightCount(index), index * stepDuration));
  }
  state.sequenceTimers.push(setTimeout(() => {
    setRaceState('green', true);
    state.sequenceRunning = false;
    state.sequenceTimers = [];
    dom['replay-start'].disabled = false;
    document.body.dataset.sequence = 'complete';
  }, stepDuration * 6 + (reducedMotion ? 180 : 650)));
}

function setTab(tab) {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.getElementById('timing-panel').hidden = tab !== 'timing';
  document.getElementById('package-panel').hidden = tab !== 'package';
}

function toggleHud() {
  state.hud = !state.hud;
  dom['race-hud'].hidden = !state.hud;
  dom['toggle-race-hud'].setAttribute('aria-pressed', String(state.hud));
  dom['toggle-race-hud'].textContent = state.hud ? 'HUD on' : 'HUD off';
  document.body.dataset.hud = state.hud ? 'visible' : 'hidden';
}

function bindUI() {
  dom['race-state-list'].querySelectorAll('[data-state]').forEach((button) => {
    button.addEventListener('click', () => setRaceState(button.dataset.state));
  });
  dom['replay-start'].addEventListener('click', replaySequence);
  document.querySelectorAll('.race-camera-dock [data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.view !== 'overview') selectAsset(button.dataset.view, false);
      setView(button.dataset.view);
    });
  });
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
  dom['toggle-race-hud'].addEventListener('click', toggleHud);
  dom['toggle-race-orbit'].addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    if (state.autoRotate && state.view !== 'overview') setView('overview');
    dom['toggle-race-orbit'].setAttribute('aria-pressed', String(state.autoRotate));
  });
  dom['reset-race-view'].addEventListener('click', () => setView('overview'));
  dom['retry-race'].addEventListener('click', () => {
    if (state.ready) selectLod(state.lod);
    else window.location.reload();
  });
}

function animate(time) {
  if (!renderer || !scene || !camera) return;
  if (state.cameraTween) {
    const tween = state.cameraTween;
    const raw = Math.min(1, (time - tween.start) / tween.duration);
    const progressValue = 1 - Math.pow(1 - raw, 3);
    camera.position.lerpVectors(tween.fromPosition, tween.destination, progressValue);
    controls.target.lerpVectors(tween.fromTarget, tween.target, progressValue);
    camera.lookAt(controls.target);
    if (raw >= 1) {
      state.cameraTween = null;
      controls.enabled = true;
    }
  }
  controls.autoRotate = state.autoRotate && state.view === 'overview' && !state.cameraTween && state.ready;
  controls.update();
  renderer.render(scene, camera);
}

async function initialise() {
  try {
    initScene();
    bindUI();
    document.body.dataset.assetReady = 'loading';
    const response = await fetch(assetUrl('assets/race/race-presentation.json'));
    if (!response.ok) throw new Error(`Race presentation manifest returned ${response.status}`);
    state.manifest = await response.json();
    buildTimingAndDemo();
    buildAssetList();
    buildLodList();
    updatePackage();
    setRaceState('grid');
    setLoading(true);
    const objects = await Promise.all(state.manifest.assets.map((asset) => loadModel(asset, 0)));
    objects.forEach((object, index) => {
      const asset = state.manifest.assets[index];
      kitGroup.add(object);
      state.objects.set(asset.id, object);
      state.lods.set(asset.id, 0);
    });
    state.ready = true;
    state.lod = 0;
    dom['replay-start'].disabled = false;
    document.body.dataset.assetReady = 'true';
    dom['race-loader-progress'].style.width = '100%';
    setLoading(false);
    dom['race-poster'].classList.add('is-hidden');
    updatePackage();
    applyLightAndPanelState();
    setView('overview', true);
  } catch (error) {
    console.error('Failed to initialise race presentation', error);
    document.body.dataset.assetReady = 'error';
    setLoading(false);
    dom['race-error-message'].textContent = error.message || 'The local presentation package could not be read.';
    dom['race-error'].hidden = false;
  }
}

initialise();
