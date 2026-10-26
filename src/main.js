import './style.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE_URL = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE_URL}${path.replace(/^\//, '')}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const PAINTS = [
  { name: 'Crimson', value: '#b81232' },
  { name: 'Velocity Lime', value: '#d7ff3f' },
  { name: 'Electric Blue', value: '#2457d6' },
  { name: 'Solar Yellow', value: '#e8b918' },
  { name: 'Pearl White', value: '#e8e6df' },
  { name: 'Graphite', value: '#292d33' },
];

const FINISHES = {
  gloss: { metalness: 0.58, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 },
  satin: { metalness: 0.42, roughness: 0.44, clearcoat: 0.35, clearcoatRoughness: 0.3 },
  matte: { metalness: 0.12, roughness: 0.8, clearcoat: 0, clearcoatRoughness: 0.65 },
};

const ICONS = {
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  shield: '<path d="M12 3 4.5 6v5.2c0 4.7 3.1 8 7.5 9.8 4.4-1.8 7.5-5.1 7.5-9.8V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2 7M4 10V4m0 6h6"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  exitFullscreen: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
  sliders: '<path d="M4 7h10m4 0h2M4 17h3m4 0h9"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3v.01"/>',
  external: '<path d="M14 4h6v6m0-6-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function injectIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => {
    element.innerHTML = icon(element.dataset.icon);
  });
}

const dom = Object.fromEntries(
  [
    'car-list', 'fleet-count', 'visible-count', 'stage', 'canvas-container', 'stage-poster', 'stage-poster-image', 'stage-index', 'stage-total',
    'stage-series', 'stage-watermark', 'stage-loader', 'loader-title', 'loader-detail', 'loader-progress',
    'stage-error', 'stage-error-message', 'retry-model', 'toggle-auto', 'reset-view', 'toggle-fullscreen',
    'vehicle-class', 'vehicle-year', 'vehicle-name', 'vehicle-description', 'stat-speed', 'stat-acceleration',
    'stat-power', 'rating-speed', 'rating-launch', 'rating-handling', 'rating-speed-value',
    'rating-launch-value', 'rating-handling-value', 'factory-paint', 'paint-name', 'paint-swatches',
    'asset-triangles', 'asset-size', 'asset-license', 'download-model', 'active-file', 'asset-dialog',
    'asset-dialog-title', 'asset-dialog-body', 'open-asset-details', 'licenses-dialog', 'license-list',
    'open-licenses', 'details-panel', 'open-specs', 'close-specs', 'toast', 'download-catalog',
  ].map((id) => [id, document.getElementById(id)]),
);

const state = {
  catalog: null,
  cars: [],
  filteredCars: [],
  selectedId: null,
  filter: 'all',
  autoRotate: !reducedMotion,
  currentView: 'hero',
  currentEntry: null,
  loadToken: 0,
  cameraTween: null,
  appearTween: null,
  settings: new Map(),
  toastTimer: null,
};

const cache = new Map();
const pending = new Map();

let renderer;
let scene;
let camera;
let controls;
let modelStage;
let contactShadow;
let keyLight;
let loader;
let resizeObserver;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add('visible');
  state.toastTimer = setTimeout(() => dom.toast.classList.remove('visible'), 2600);
}

function getSelectedCar() {
  return state.cars.find((car) => car.id === state.selectedId);
}

function getCarSettings(id) {
  if (!state.settings.has(id)) state.settings.set(id, { paint: null, finish: 'gloss' });
  return state.settings.get(id);
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(dom.stage.clientWidth, dom.stage.clientHeight);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  dom['canvas-container'].appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x101215, 18, 36);

  camera = new THREE.PerspectiveCamera(35, dom.stage.clientWidth / dom.stage.clientHeight, 0.05, 80);
  camera.position.set(5.5, 2.4, 7.2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 4.3;
  controls.maxDistance = 22;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 0.72, 0);
  controls.autoRotateSpeed = 0.65;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.035).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.9;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xdde8f2, 0x14120f, 1.15));

  keyLight = new THREE.DirectionalLight(0xfff4e5, 3.2);
  keyLight.position.set(4.5, 7.5, 5.5);
  keyLight.castShadow = true;
  const shadowSize = window.innerWidth < 760 ? 1024 : 2048;
  keyLight.shadow.mapSize.set(shadowSize, shadowSize);
  keyLight.shadow.camera.left = -6;
  keyLight.shadow.camera.right = 6;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 24;
  keyLight.shadow.bias = -0.00035;
  keyLight.shadow.normalBias = 0.025;
  scene.add(keyLight);

  const fill = new THREE.DirectionalLight(0xbfd8ff, 1.55);
  fill.position.set(-5, 3.8, 2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xf2f6ff, 2.15);
  rim.position.set(-1.5, 4.5, -5);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(22, 96),
    new THREE.MeshStandardMaterial({ color: 0x111417, metalness: 0.52, roughness: 0.36, envMapIntensity: 0.45 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  floor.receiveShadow = true;
  scene.add(floor);

  const platform = new THREE.Mesh(
    new THREE.CircleGeometry(4.25, 96),
    new THREE.MeshStandardMaterial({ color: 0x171a1d, metalness: 0.68, roughness: 0.28, envMapIntensity: 0.55 }),
  );
  platform.rotation.x = -Math.PI / 2;
  platform.position.y = -0.012;
  platform.receiveShadow = true;
  scene.add(platform);

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(4.24, 4.255, 128),
    new THREE.MeshBasicMaterial({ color: 0xa9c44b, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = -0.004;
  scene.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(3.72, 3.727, 128),
    new THREE.MeshBasicMaterial({ color: 0x8b9398, transparent: true, opacity: 0.1, side: THREE.DoubleSide }),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = -0.003;
  scene.add(innerRing);

  const grid = new THREE.GridHelper(32, 32, 0x333a3f, 0x24292d);
  grid.position.y = -0.018;
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  scene.add(grid);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const context = shadowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(0,0,0,0.9)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 6),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.72, depthWrite: false }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.008;
  scene.add(contactShadow);

  modelStage = new THREE.Group();
  scene.add(modelStage);

  const draco = new DRACOLoader();
  draco.setDecoderPath(assetUrl('assets/draco/'));
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);

  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(dom.stage);
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, dom.stage.clientWidth);
  const height = Math.max(1, dom.stage.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  if (state.currentEntry) setView(state.currentView, true);
}

function isActuallyVisible(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function modelBounds(model) {
  const box = new THREE.Box3();
  model.traverse((object) => {
    if (object.isMesh && isActuallyVisible(object)) box.expandByObject(object);
  });
  return box;
}

function hasExcludedAncestor(object, exclusions = []) {
  if (!exclusions.length) return false;
  for (let current = object; current; current = current.parent) {
    if (exclusions.some((name) => current.name.includes(name))) return true;
  }
  return false;
}

function prepareMaterial(material) {
  if (material.metalness >= 0.99 && material.roughness >= 0.99) {
    material.metalness = 0.45;
    material.roughness = 0.45;
  }
  if (material.roughness < 0.055) material.roughness = 0.055;
  if (window.innerWidth < 760 && material.transmission > 0) {
    material.transmission = 0;
    material.transparent = true;
    material.opacity = Math.min(material.opacity, 0.42);
  }
  return material;
}

function rememberPaint(material) {
  material.userData.velocityFactory = {
    color: material.color?.clone(),
    map: material.map || null,
    metalness: material.metalness,
    roughness: material.roughness,
    clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
  };
  return material;
}

function prepareCar(car, source, rig) {
  const model = source.scene;
  const root = new THREE.Group();
  const fit = new THREE.Group();
  root.name = `${car.id}-showroom-root`;
  fit.name = `${car.id}-${car.normalized ? 'baked' : 'normalized'}-asset`;
  fit.add(model);
  root.add(fit);

  const hiddenNames = car.hideNodes || [];
  model.traverse((object) => {
    if (hiddenNames.some((name) => object.name.includes(name))) object.visible = false;
  });

  root.updateMatrixWorld(true);
  let box;
  let size;

  // Pack 01 bounds are measured from decoded geometry during the reproducible build.
  // Reuse those validated dimensions instead of repeating an expensive browser measurement.
  if (car.normalized) {
    size = new THREE.Vector3(car.dimensions.width, car.dimensions.height, car.dimensions.length);
  } else {
    box = modelBounds(model);
    size = box.getSize(new THREE.Vector3());
  }

  // Keep the legacy branch only for unnormalized third-party additions to the catalogue.
  if (!car.normalized) {
    if (car.forward === '-Z') {
      fit.rotation.y = Math.PI;
    } else if (car.orientation === 'auto' && size.x > size.z) {
      fit.rotation.y = Math.PI / 2;
    }

    root.updateMatrixWorld(true);
    box = modelBounds(model);
    size = box.getSize(new THREE.Vector3());
    const length = Math.max(size.z, 0.001);
    fit.scale.setScalar(car.length / length);

    root.updateMatrixWorld(true);
    box = modelBounds(model);
    const center = box.getCenter(new THREE.Vector3());
    fit.position.set(-center.x, -box.min.y, -center.z);
    root.updateMatrixWorld(true);

    box = modelBounds(model);
    size = box.getSize(new THREE.Vector3());
  }

  const paintMaterials = [];
  const paintNames = new Set(car.paintMaterials || []);
  const materialMap = new Map();

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;

    const excluded = hasExcludedAncestor(object, car.paintExcludeNodes || []);
    const convert = (original) => {
      let material = prepareMaterial(original);
      if (paintNames.has(original.name) && !excluded) {
        const key = `${original.uuid}:${object.uuid}`;
        if (!materialMap.has(key)) {
          material = rememberPaint(original.clone());
          materialMap.set(key, material);
          paintMaterials.push(material);
        } else {
          material = materialMap.get(key);
        }
      }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
  });

  root.userData.assetId = car.id;
  root.userData.normalized = Boolean(car.normalized);
  root.userData.rig = rig;
  return { car, root, model, rig, paintMaterials, dimensions: size, loadedAt: performance.now() };
}

function setLoading(visible, switching = false) {
  dom['stage-loader'].classList.toggle('is-complete', !visible);
  dom['stage-loader'].classList.toggle('is-switching', switching && visible);
  dom['stage-poster'].classList.toggle('is-hidden', !visible);
  if (visible) {
    dom['loader-progress'].style.width = '6%';
    dom['stage-error'].hidden = true;
  }
}

function updateLoadProgress(event) {
  if (!event.total) {
    dom['loader-detail'].textContent = `${(event.loaded / 1024 / 1024).toFixed(1)} MB received…`;
    return;
  }
  const percentage = Math.min(100, Math.round((event.loaded / event.total) * 100));
  dom['loader-progress'].style.width = `${Math.max(6, percentage)}%`;
  dom['loader-detail'].textContent = `Loading local GLB · ${percentage}%`;
}

function loadCarAsset(car, token) {
  if (cache.has(car.id)) {
    const entry = cache.get(car.id);
    entry.loadedAt = performance.now();
    return Promise.resolve(entry);
  }
  if (pending.has(car.id)) return pending.get(car.id);

  const modelPromise = new Promise((resolve, reject) => {
    loader.load(
      assetUrl(car.model),
      resolve,
      (event) => {
        if (token === state.loadToken) updateLoadProgress(event);
      },
      reject,
    );
  });
  const rigPromise = fetch(assetUrl(car.rig)).then((response) => {
    if (!response.ok) throw new Error(`Wheel-rig request failed (${response.status})`);
    return response.json();
  });
  const promise = Promise.all([modelPromise, rigPromise])
    .then(([gltf, rig]) => prepareCar(car, gltf, rig));
  pending.set(car.id, promise);
  promise.then(
    () => pending.delete(car.id),
    () => pending.delete(car.id),
  );
  return promise;
}

function trimCache(exceptId) {
  if (cache.size < 3) return;
  const entries = [...cache.values()].sort((a, b) => a.loadedAt - b.loadedAt);
  for (const entry of entries) {
    if (cache.size < 3) break;
    if (entry.car.id === exceptId || entry === state.currentEntry) continue;
    disposeEntry(entry);
    cache.delete(entry.car.id);
  }
}

function disposeEntry(entry) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  entry.model.traverse((object) => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value?.isTexture) textures.add(value);
    });
    material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

async function selectCar(id, { initial = false, updateHash = true } = {}) {
  const car = state.cars.find((item) => item.id === id);
  if (!car || (state.selectedId === id && state.currentEntry)) return;

  state.selectedId = id;
  state.currentView = 'hero';
  document.body.dataset.assetReady = 'loading';
  const token = ++state.loadToken;
  updateDetails(car);
  updateCarList();
  updateViewButtons();
  dom['stage-poster-image'].src = assetUrl(car.preview);
  dom['stage-poster'].dataset.carId = car.id;
  document.body.dataset.posterCar = car.id;

  if (updateHash) history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
  dom['loader-title'].textContent = initial ? 'Preparing collection' : car.name;
  dom['loader-detail'].textContent = 'Optimized 3D loading in the background…';
  setLoading(true, !initial && Boolean(state.currentEntry));

  try {
    const entry = await loadCarAsset(car, token);
    if (token !== state.loadToken) {
      cache.set(car.id, entry);
      entry.loadedAt = performance.now();
      trimCache(car.id);
      return;
    }

    if (state.currentEntry && state.currentEntry !== entry) modelStage.remove(state.currentEntry.root);
    state.currentEntry = entry;
    cache.set(car.id, entry);
    entry.loadedAt = performance.now();
    modelStage.add(entry.root);
    entry.root.scale.setScalar(reducedMotion ? 1 : 0.965);
    state.appearTween = reducedMotion ? null : { start: performance.now(), duration: 550 };

    contactShadow.scale.set(Math.max(0.75, entry.dimensions.x / 3.25), Math.max(0.75, entry.dimensions.z / 4.8), 1);
    applyCarSettings(car);
    setView('hero', true);
    trimCache(car.id);

    dom['loader-progress'].style.width = '100%';
    setTimeout(() => {
      if (token === state.loadToken) setLoading(false);
    }, reducedMotion ? 0 : 160);
    dom['stage-error'].hidden = true;
    document.body.dataset.assetReady = 'true';
    document.body.dataset.selectedCar = car.id;
    document.body.dataset.paintMaterials = String(entry.paintMaterials.length);
    document.body.dataset.modelLength = entry.dimensions.z.toFixed(3);
    document.body.dataset.modelWidth = entry.dimensions.x.toFixed(3);
    document.body.dataset.modelHeight = entry.dimensions.y.toFixed(3);
  } catch (error) {
    if (token !== state.loadToken) return;
    console.error(`Failed to load ${car.model}`, error);
    setLoading(false);
    dom['stage-poster'].classList.remove('is-hidden');
    dom['stage-error'].hidden = false;
    dom['stage-error-message'].textContent = `${car.name}: ${error.message || 'the local GLB could not be read.'}`;
    document.body.dataset.assetReady = 'error';
  }
}

function updateDetails(car) {
  const index = state.cars.indexOf(car);
  const performance = car.performance;
  const speedIndex = Math.round(THREE.MathUtils.clamp((performance.topSpeed - 170) / 2.5, 0, 100));
  const launchIndex = Math.round(THREE.MathUtils.clamp((6.5 - performance.acceleration) / 4.5 * 100, 0, 100));

  dom['stage-index'].textContent = String(index + 1).padStart(2, '0');
  dom['stage-total'].textContent = String(state.cars.length).padStart(2, '0');
  dom['stage-series'].textContent = car.series;
  dom['stage-watermark'].textContent = car.shortName;
  dom['vehicle-class'].textContent = car.class;
  dom['vehicle-year'].textContent = car.year;
  dom['vehicle-name'].textContent = car.name;
  dom['vehicle-description'].textContent = car.description;
  dom['stat-speed'].textContent = performance.topSpeed;
  dom['stat-acceleration'].textContent = performance.acceleration.toFixed(1);
  dom['stat-power'].textContent = performance.power;
  dom['rating-speed-value'].textContent = speedIndex;
  dom['rating-launch-value'].textContent = launchIndex;
  dom['rating-handling-value'].textContent = performance.handling;
  requestAnimationFrame(() => {
    dom['rating-speed'].style.width = `${speedIndex}%`;
    dom['rating-launch'].style.width = `${launchIndex}%`;
    dom['rating-handling'].style.width = `${performance.handling}%`;
  });
  dom['asset-triangles'].textContent = `${formatNumber(car.triangles)} triangles`;
  dom['asset-size'].textContent = car.fileSize;
  dom['asset-license'].textContent = car.credit.license;
  dom['download-model'].href = assetUrl(car.model);
  dom['download-model'].download = `velocity-${car.id}.glb`;
  dom['active-file'].textContent = car.model;
  document.title = `${car.name} — Velocity Vehicle Library`;
}

function updateCarList() {
  const visibleIds = new Set(state.filteredCars.map((car) => car.id));
  dom['car-list'].querySelectorAll('.car-card').forEach((card) => {
    const active = card.dataset.carId === state.selectedId;
    card.hidden = !visibleIds.has(card.dataset.carId);
    card.classList.toggle('active', active);
    card.setAttribute('aria-selected', String(active));
    card.tabIndex = active ? 0 : -1;
    if (active) {
      requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' }));
    }
  });
}

function buildCarList() {
  dom['car-list'].innerHTML = state.cars.map((car, index) => `
    <button class="car-card" type="button" role="option" data-car-id="${escapeHtml(car.id)}" aria-selected="false" aria-label="View ${escapeHtml(car.name)}">
      <span class="car-thumb">
        <span class="thumb-fallback">${String(index + 1).padStart(2, '0')}</span>
        <img src="${assetUrl(car.preview)}" alt="" loading="lazy" onerror="this.style.display='none'" />
      </span>
      <span class="car-card-copy"><small>${escapeHtml(car.class)}</small><strong>${escapeHtml(car.shortName)}</strong></span>
      <span class="car-card-index">${String(index + 1).padStart(2, '0')}</span>
    </button>
  `).join('');

  dom['car-list'].querySelectorAll('.car-card').forEach((card) => {
    card.addEventListener('click', () => selectCar(card.dataset.carId));
  });
  dom['fleet-count'].textContent = state.cars.length;
}

function buildPaintSwatches() {
  dom['paint-swatches'].innerHTML = PAINTS.map((paint) => `
    <button class="paint-swatch" type="button" style="--swatch:${paint.value}" data-paint="${paint.value}" data-name="${paint.name}" aria-label="${paint.name} paint" title="${paint.name}" aria-pressed="false"></button>
  `).join('');
  dom['paint-swatches'].querySelectorAll('.paint-swatch').forEach((button) => {
    button.addEventListener('click', () => {
      const car = getSelectedCar();
      if (!car || !state.currentEntry) return;
      if (!state.currentEntry.paintMaterials.length) {
        showToast('This asset uses a fixed factory material.');
        return;
      }
      const settings = getCarSettings(car.id);
      settings.paint = button.dataset.paint;
      applyCarSettings(car);
    });
  });
}

function restoreFactory(material) {
  const factory = material.userData.velocityFactory;
  if (!factory) return;
  if (factory.color && material.color) material.color.copy(factory.color);
  material.map = factory.map;
  material.metalness = factory.metalness;
  material.roughness = factory.roughness;
  if (material.clearcoat !== undefined) material.clearcoat = factory.clearcoat ?? 0;
  if (material.clearcoatRoughness !== undefined) material.clearcoatRoughness = factory.clearcoatRoughness ?? 0;
  material.needsUpdate = true;
}

function applyCarSettings(car) {
  const settings = getCarSettings(car.id);
  const entry = state.currentEntry;
  if (!entry || entry.car.id !== car.id) return;

  entry.paintMaterials.forEach((material) => {
    if (!settings.paint) {
      restoreFactory(material);
      return;
    }
    const finish = FINISHES[settings.finish];
    material.color.set(settings.paint);
    material.map = null;
    material.metalness = finish.metalness;
    material.roughness = finish.roughness;
    if (material.clearcoat !== undefined) material.clearcoat = finish.clearcoat;
    if (material.clearcoatRoughness !== undefined) material.clearcoatRoughness = finish.clearcoatRoughness;
    material.needsUpdate = true;
  });

  const activePaint = PAINTS.find((paint) => paint.value === settings.paint);
  dom['paint-name'].textContent = activePaint ? `${activePaint.name} · ${settings.finish}` : 'Factory finish';
  dom['paint-swatches'].querySelectorAll('.paint-swatch').forEach((button) => {
    const active = button.dataset.paint === settings.paint;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-finish]').forEach((button) => {
    const active = button.dataset.finish === settings.finish;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setAutoRotate(enabled) {
  state.autoRotate = enabled;
  dom['toggle-auto'].setAttribute('aria-pressed', String(enabled));
  dom['toggle-auto'].setAttribute('aria-label', enabled ? 'Pause automatic rotation' : 'Start automatic rotation');
  dom['toggle-auto'].innerHTML = icon(enabled ? 'pause' : 'play');
}

function updateViewButtons() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === state.currentView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setView(view, instant = false) {
  if (!camera || !controls) return;
  state.currentView = view;
  updateViewButtons();

  const entry = state.currentEntry;
  const length = entry?.dimensions.z || 4.7;
  const height = entry?.dimensions.y || 1.3;
  const baseDistance = Math.max(7.3, length * 1.62);
  const aspectFit = Math.min(1.85, Math.max(1, 1 / Math.max(camera.aspect, 0.45)));
  const distance = baseDistance * aspectFit;
  const target = new THREE.Vector3(0, Math.max(0.55, height * 0.43), 0);
  const positions = {
    hero: new THREE.Vector3(distance * 0.67, Math.max(2.15, height * 1.45), distance * 0.78),
    front: new THREE.Vector3(0, Math.max(1.25, height * 0.78), distance * 1.02),
    side: new THREE.Vector3(distance * 1.02, Math.max(1.35, height * 0.85), 0),
    rear: new THREE.Vector3(0, Math.max(1.55, height), -distance * 1.02),
  };
  const destination = positions[view] || positions.hero;

  if (instant || reducedMotion) {
    camera.position.copy(destination);
    controls.target.copy(target);
    controls.update();
    state.cameraTween = null;
    controls.enabled = true;
    return;
  }

  state.cameraTween = {
    start: performance.now(),
    duration: 650,
    fromPosition: camera.position.clone(),
    toPosition: destination,
    fromTarget: controls.target.clone(),
    toTarget: target,
  };
  controls.enabled = false;
}

function animate(time) {
  if (!renderer || !scene || !camera) return;

  if (state.cameraTween) {
    const tween = state.cameraTween;
    const raw = Math.min(1, (time - tween.start) / tween.duration);
    const progress = 1 - Math.pow(1 - raw, 3);
    camera.position.lerpVectors(tween.fromPosition, tween.toPosition, progress);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, progress);
    camera.lookAt(controls.target);
    if (raw >= 1) {
      state.cameraTween = null;
      controls.enabled = true;
    }
  }

  if (state.appearTween && state.currentEntry) {
    const tween = state.appearTween;
    const progress = Math.min(1, (time - tween.start) / tween.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    state.currentEntry.root.scale.setScalar(0.965 + eased * 0.035);
    if (progress >= 1) state.appearTween = null;
  }

  controls.autoRotate = state.autoRotate && !state.cameraTween && Boolean(state.currentEntry) && dom['stage-loader'].classList.contains('is-complete');
  controls.update();
  renderer.render(scene, camera);
}

function openAssetDetails() {
  const car = getSelectedCar();
  if (!car) return;
  const credit = car.credit;
  const lodLinks = Object.entries(car.lods || { 0: car.model }).map(([level, modelPath]) => (
    `<a href="${assetUrl(modelPath)}" download="velocity-${car.id}-lod${level}.glb">LOD${level} · ${formatNumber(car.lodTriangles?.[level] || car.triangles)} tris</a>`
  )).join(' · ');
  dom['asset-dialog-title'].textContent = car.name;
  dom['asset-dialog-body'].innerHTML = `
    <div class="asset-detail-grid">
      <div class="detail-block"><span>Geometry</span><strong>${formatNumber(car.triangles)} triangles</strong></div>
      <div class="detail-block"><span>Download</span><strong>${car.fileSize} · GLB</strong></div>
      <div class="detail-block"><span>Normalized length</span><strong>${car.length.toFixed(2)} metres</strong></div>
      <div class="detail-block"><span>Scene convention</span><strong>Y-up · +Z forward · baked</strong></div>
      <div class="detail-block"><span>Game-readiness</span><strong>4 LODs · convex hull · 4 wheel records</strong></div>
    </div>
    <dl class="asset-credit">
      <div><dt>Source model</dt><dd>${escapeHtml(credit.title)}</dd></div>
      <div><dt>Author</dt><dd>${escapeHtml(credit.author)}</dd></div>
      <div><dt>License</dt><dd><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">${escapeHtml(credit.license)}</a> — attribution required</dd></div>
      <div><dt>Source</dt><dd><a href="${escapeHtml(credit.source)}" target="_blank" rel="noreferrer">View original asset record ${icon('external')}</a></dd></div>
      <div><dt>Distribution</dt><dd><a href="${escapeHtml(credit.distribution)}" target="_blank" rel="noreferrer">View source distribution ${icon('external')}</a></dd></div>
      <div><dt>Source changes</dt><dd>${escapeHtml(credit.changes)}</dd></div>
      <div><dt>Runtime processing</dt><dd>${escapeHtml(credit.runtimeChanges || 'Optimized runtime GLB.')}</dd></div>
      ${credit.notice ? `<div><dt>Legal notice</dt><dd>${escapeHtml(credit.notice)}</dd></div>` : ''}
      <div><dt>Reusable LODs</dt><dd>${lodLinks}</dd></div>
      <div><dt>Physics / rig</dt><dd><a href="${assetUrl(car.collision)}" download="${car.id}-collision.glb">Convex collision GLB</a> · <a href="${assetUrl(car.rig)}" download="${car.id}-rig.json">Wheel-rig JSON</a></dd></div>
      <div><dt>Runtime LOD0</dt><dd><code>${escapeHtml(car.model)}</code></dd></div>
      <div><dt>Untouched master</dt><dd><code>${escapeHtml(car.master)}</code> (repository only)</dd></div>
    </dl>
    <a class="primary-button" href="${assetUrl(car.model)}" download="velocity-${car.id}.glb">${icon('download')} Download this GLB</a>
    <p class="license-notice">Every runtime GLB has baked metre scale, Y-up/+Z-forward orientation and ground-zero placement. Paint remains a viewer operation. Collision and wheel data are starting points; suspension behavior still requires driving-prototype tuning. Performance values are design metadata, not a vehicle simulation.</p>
  `;
  dom['asset-dialog'].showModal();
}

function buildLicenseList() {
  dom['license-list'].innerHTML = state.cars.map((car, index) => `
    <article class="license-item">
      <span class="license-number">${String(index + 1).padStart(2, '0')}</span>
      <div class="license-copy"><strong>${escapeHtml(car.credit.title)}</strong><p>${escapeHtml(car.credit.author)} · ${escapeHtml(car.name)}</p></div>
      <div class="license-source"><span>${escapeHtml(car.credit.license)}</span><a href="${escapeHtml(car.credit.source)}" target="_blank" rel="noreferrer">Source ${icon('external')}</a></div>
    </article>
  `).join('') + '<p class="license-notice">Production vehicle names and marks remain the property of their respective owners. This independent asset collection does not imply manufacturer endorsement. See LICENSES.md for the complete attribution and modification record.</p>';
}

function setFilter(filter) {
  state.filter = filter;
  state.filteredCars = filter === 'all' ? [...state.cars] : state.cars.filter((car) => car.category === filter);
  document.querySelectorAll('[data-filter]').forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  dom['visible-count'].textContent = state.filteredCars.length;
  updateCarList();
  if (!state.filteredCars.some((car) => car.id === state.selectedId) && state.filteredCars.length) {
    selectCar(state.filteredCars[0].id);
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await dom.stage.requestFullscreen();
  } catch {
    showToast('Fullscreen is not available in this browser.');
  }
}

function bindUI() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => setFilter(button.dataset.filter));
  });
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  document.querySelectorAll('[data-finish]').forEach((button) => {
    button.addEventListener('click', () => {
      const car = getSelectedCar();
      if (!car || !state.currentEntry) return;
      const settings = getCarSettings(car.id);
      settings.finish = button.dataset.finish;
      if (!settings.paint) settings.paint = car.defaultPaint || PAINTS[0].value;
      applyCarSettings(car);
    });
  });

  dom['toggle-auto'].addEventListener('click', () => setAutoRotate(!state.autoRotate));
  dom['reset-view'].addEventListener('click', () => setView('hero'));
  dom['toggle-fullscreen'].addEventListener('click', toggleFullscreen);
  dom['factory-paint'].addEventListener('click', () => {
    const car = getSelectedCar();
    if (!car) return;
    const settings = getCarSettings(car.id);
    settings.paint = null;
    settings.finish = 'gloss';
    applyCarSettings(car);
    showToast('Factory material restored.');
  });
  dom['retry-model'].addEventListener('click', () => {
    const car = getSelectedCar();
    if (!car) return;
    if (state.currentEntry) modelStage.remove(state.currentEntry.root);
    cache.delete(car.id);
    state.currentEntry = null;
    selectCar(car.id);
  });
  dom['open-asset-details'].addEventListener('click', openAssetDetails);
  dom['open-licenses'].addEventListener('click', () => dom['licenses-dialog'].showModal());
  dom['open-specs'].addEventListener('click', () => dom['details-panel'].classList.add('is-open'));
  dom['close-specs'].addEventListener('click', () => dom['details-panel'].classList.remove('is-open'));

  document.querySelectorAll('.modal-close').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) dialog.close();
    });
  });

  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    dom['toggle-fullscreen'].innerHTML = icon(active ? 'exitFullscreen' : 'fullscreen');
    dom['toggle-fullscreen'].setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    onResize();
  });

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && id !== state.selectedId && state.cars.some((car) => car.id === id)) selectCar(id, { updateHash: false });
  });

  document.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      dom['details-panel'].classList.remove('is-open');
      return;
    }
    const interactive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    if (interactive) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const list = state.filteredCars.length ? state.filteredCars : state.cars;
      const current = list.findIndex((car) => car.id === state.selectedId);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = (Math.max(0, current) + direction + list.length) % list.length;
      selectCar(list[next].id);
    } else if (event.code === 'Space' && !['BUTTON', 'A'].includes(event.target.tagName)) {
      event.preventDefault();
      setAutoRotate(!state.autoRotate);
    } else if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
      setView('hero');
    } else if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) {
      toggleFullscreen();
    }
  });
}

async function init() {
  injectIcons();
  buildPaintSwatches();
  bindUI();
  setAutoRotate(state.autoRotate);

  try {
    const response = await fetch(assetUrl('assets/catalog.json'));
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    state.catalog = await response.json();
    state.cars = state.catalog.cars;
    state.filteredCars = [...state.cars];
    dom['download-catalog'].href = assetUrl('assets/catalog.json');
    buildCarList();
    buildLicenseList();
    initScene();
    const requestedId = location.hash.slice(1);
    const initialCar = state.cars.find((car) => car.id === requestedId) || state.cars[0];
    await selectCar(initialCar.id, { initial: true, updateHash: false });
  } catch (error) {
    console.error('Showroom initialization failed', error);
    setLoading(false);
    dom['stage-error'].hidden = false;
    dom['stage-error-message'].textContent = error.message || 'The asset library could not be initialized.';
    document.body.dataset.assetReady = 'error';
  }
}

init();
