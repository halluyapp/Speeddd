import './track.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE_URL = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE_URL}${path.replace(/^\//, '')}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dom = Object.fromEntries([
  'track-stage', 'track-canvas', 'track-poster', 'track-loader', 'track-loader-title', 'track-loader-detail',
  'track-loader-progress', 'track-error', 'track-error-message', 'retry-track', 'track-length', 'track-width',
  'track-elevation', 'track-grid-count', 'track-map', 'sector-list', 'lod-list', 'current-lod-name',
  'current-lod-triangles', 'current-lod-size', 'stage-lod-label', 'download-track', 'download-collision',
  'download-race-data', 'download-manifest', 'checkpoint-count', 'collision-triangles', 'active-track-file',
  'toggle-track-rotate', 'reset-track-view', 'environment-list', 'track-region', 'track-name', 'track-name-secondary',
  'track-description', 'track-tags', 'track-stage-name', 'track-scenic-view', 'track-master-path', 'grid-slot-fact',
  'download-track-license', 'track-poster-image',
].map((id) => [id, document.getElementById(id)]));

const state = {
  manifest: null,
  catalogTracks: [],
  current: null,
  lod: 0,
  view: 'overview',
  autoRotate: false,
  token: 0,
  cameraTween: null,
};
const cache = new Map();
const pending = new Map();

let renderer;
let scene;
let camera;
let controls;
let loader;
let modelStage;
let resizeObserver;

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
const formatBytes = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const vector = (array) => new THREE.Vector3(...array);

function initScene() {
  const width = Math.max(1, dom['track-stage'].clientWidth);
  const height = Math.max(1, dom['track-stage'].clientHeight);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  dom['track-canvas'].appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ab9c0');
  scene.fog = new THREE.Fog('#9ab9c0', 1900, 4500);
  camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 6000);
  camera.position.set(700, 800, 900);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = true;
  controls.minDistance = 12;
  controls.maxDistance = 3600;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotateSpeed = 0.3;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.72;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x56634a, 1.55));
  const sun = new THREE.DirectionalLight(0xfff2d9, 2.35);
  sun.position.set(-350, 700, 420);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb7e5ed, 0.65);
  fill.position.set(400, 250, -500);
  scene.add(fill);

  modelStage = new THREE.Group();
  modelStage.name = 'Environment runtime LOD';
  scene.add(modelStage);

  loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(dom['track-stage']);
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, dom['track-stage'].clientWidth);
  const height = Math.max(1, dom['track-stage'].clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  if (state.manifest && state.view === 'overview') setView('overview', true);
}

function buildMap() {
  const manifest = state.manifest;
  const accent = manifest.accent || '#d7ff3f';
  const points = manifest.centerline;
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const project = (position) => [
    20 + (position[0] - minX) / (maxX - minX) * 240,
    15 + (position[2] - minZ) / (maxZ - minZ) * 175,
  ];
  const pathData = points.map((point, index) => `${index ? 'L' : 'M'}${project(point).map((value) => value.toFixed(1)).join(',')}`).join(' ') + ' Z';
  const checkpointSvg = manifest.checkpoints.map((checkpoint) => {
    const [x, y] = project(checkpoint.position);
    return `<circle cx="${x}" cy="${y}" r="2.2" fill="#102126" stroke="#8da8aa" stroke-width="1"/>`;
  }).join('');
  const [startX, startY] = project(manifest.start.position);
  dom['track-map'].innerHTML = `
    <path d="${pathData}" fill="none" stroke="#050b0e" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${pathData}" fill="none" stroke="#566e72" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${pathData}" fill="none" stroke="#b5c4c1" stroke-opacity=".72" stroke-width="1" stroke-dasharray="2 4"/>
    ${checkpointSvg}
    <circle cx="${startX}" cy="${startY}" r="10" fill="${accent}" opacity=".09"/>
    <circle cx="${startX}" cy="${startY}" r="4.5" fill="${accent}"/>
  `;
}

function buildLodList() {
  dom['lod-list'].innerHTML = [0, 1, 2, 3].map((level) => `
    <button class="track-lod-button${level === state.lod ? ' active' : ''}" type="button" data-lod="${level}" aria-pressed="${level === state.lod}">
      <span>LOD${level}</span><strong>${formatNumber(state.manifest.lodTriangles[level])} tris</strong><small>${formatBytes(state.manifest[`lod${level}Bytes`])}</small>
    </button>
  `).join('');
  dom['lod-list'].querySelectorAll('[data-lod]').forEach((button) => {
    button.addEventListener('click', () => selectLod(Number(button.dataset.lod)));
  });
}

function updateTrackButtons() {
  dom['environment-list'].querySelectorAll('[data-track-id]').forEach((button) => {
    const active = button.dataset.trackId === state.manifest?.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function buildTrackList() {
  dom['environment-list'].innerHTML = state.catalogTracks.map((entry, index) => {
    const parts = entry.name.split(' ');
    return `<button type="button" data-track-id="${entry.id}" aria-pressed="${entry.id === state.manifest?.id}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(parts[0])}</strong><small>${escapeHtml(parts.at(-1))}</small></button>`;
  }).join('');
  dom['environment-list'].querySelectorAll('[data-track-id]').forEach((button) => button.addEventListener('click', () => selectTrack(button.dataset.trackId)));
  updateTrackButtons();
}

function updateTrackChrome() {
  const manifest = state.manifest;
  const parts = manifest.name.split(' ');
  dom['track-name'].firstChild.nodeValue = `${parts[0]} `;
  dom['track-name-secondary'].textContent = parts.slice(1).join(' ');
  dom['track-region'].textContent = manifest.region || 'Atlantic coast / 01';
  dom['track-description'].textContent = manifest.tagLine || 'Fast coastal sweepers. A technical inner loop. Sixty-four metres of elevation above the Atlantic.';
  const tags = manifest.tags || ['Closed circuit', 'Road / hill climb'];
  dom['track-tags'].replaceChildren(...tags.map((tag) => { const span = document.createElement('span'); span.textContent = tag; return span; }));
  dom['track-stage-name'].textContent = manifest.name.toUpperCase();
  dom['track-scenic-view'].textContent = manifest.scenicLabel || manifest.viewpoints.coast?.label || 'Coast';
  dom['track-master-path'].textContent = manifest.master;
  dom['track-poster-image'].src = assetUrl(manifest.preview);
  dom['track-map'].setAttribute('aria-label', `${manifest.name} centerline with checkpoints and start position`);
  dom['track-stage'].setAttribute('aria-label', `Interactive 3D ${manifest.name} preview`);
  document.body.dataset.trackId = manifest.id;
  document.title = `${manifest.name} — Velocity Environments`;
  document.documentElement.style.setProperty('--accent', manifest.accent || '#d7ff3f');
  if (scene) {
    const sky = manifest.environmentType === 'alpine-circuit' ? '#99a7a5' : '#9ab9c0';
    scene.background.set(sky); scene.fog.color.set(sky);
    scene.fog.near = manifest.environmentType === 'alpine-circuit' ? 2400 : 1900;
    scene.fog.far = manifest.environmentType === 'alpine-circuit' ? 6000 : 4500;
  }
  updateTrackButtons();
}

function updateManifestUI() {
  const manifest = state.manifest;
  updateTrackChrome();
  dom['track-length'].textContent = `${formatNumber(Math.round(manifest.length))} m`;
  dom['track-width'].textContent = `${manifest.roadWidth} m`;
  dom['track-elevation'].textContent = `${manifest.elevation.change.toFixed(1)} m`;
  dom['track-grid-count'].textContent = `${manifest.gridCount} cars`;
  dom['checkpoint-count'].textContent = `${manifest.checkpointCount} / ordered`;
  dom['grid-slot-fact'].textContent = `${manifest.gridCount} / staggered`;
  dom['collision-triangles'].textContent = `${formatNumber(manifest.collisionTriangles)} tris`;
  dom['sector-list'].innerHTML = manifest.sectors.map((sector) => `
    <div class="sector-row"><span>0${sector.id}</span><strong>Sector ${sector.id}</strong><small>${formatNumber(Math.round(sector.length))} m</small></div>
  `).join('');
  for (const link of [dom['download-manifest'], dom['download-race-data']]) {
    link.href = assetUrl(`assets/tracks/${manifest.id}.json`);
    link.download = `${manifest.id}.json`;
  }
  dom['download-collision'].href = assetUrl(manifest.collision);
  dom['download-collision'].download = `${manifest.id}-collision.glb`;
  const license = manifest.licenseFile || 'assets/tracks/LICENSE.txt';
  dom['download-track-license'].href = assetUrl(license);
  dom['download-track-license'].download = license.split('/').at(-1);
  document.body.dataset.gridCount = String(manifest.gridCount);
  document.body.dataset.checkpoints = String(manifest.checkpointCount);
  buildMap();
  buildLodList();
}

function setLoading(visible) {
  dom['track-loader'].classList.toggle('is-complete', !visible);
  if (visible) {
    dom['track-error'].hidden = true;
    dom['track-loader-progress'].style.width = '6%';
    if (!state.current) dom['track-poster'].classList.remove('is-hidden');
  } else {
    dom['track-poster'].classList.add('is-hidden');
  }
}

function updateProgress(event) {
  if (!event.total) {
    dom['track-loader-detail'].textContent = `${(event.loaded / 1e6).toFixed(1)} MB received…`;
    return;
  }
  const percentage = Math.min(100, Math.round(event.loaded / event.total * 100));
  dom['track-loader-progress'].style.width = `${Math.max(6, percentage)}%`;
  dom['track-loader-detail'].textContent = `Local Meshopt GLB · ${percentage}%`;
}

function loadGltf(level, token) {
  const manifest = state.manifest;
  const key = `${manifest.id}:${level}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);
  const promise = new Promise((resolve, reject) => {
    loader.load(
      assetUrl(manifest.lods[level]),
      resolve,
      (event) => { if (token === state.token) updateProgress(event); },
      reject,
    );
  });
  pending.set(key, promise);
  promise.then((gltf) => { cache.set(key, gltf); pending.delete(key); }, () => pending.delete(key));
  return promise;
}

async function selectLod(level, { initial = false } = {}) {
  const manifest = state.manifest;
  if (!manifest || !manifest.lods[level]) return;
  const token = ++state.token;
  state.lod = level;
  document.body.dataset.assetReady = 'loading';
  document.body.dataset.lod = String(level);
  dom['track-loader-title'].textContent = initial ? `Preparing ${manifest.name.split(' ')[0]}` : `Loading LOD${level}`;
  dom['track-loader-detail'].textContent = initial ? 'Map preview · optimized 3D loading…' : 'Switching local runtime detail…';
  setLoading(true);
  buildLodList();

  try {
    const gltf = await loadGltf(level, token);
    if (token !== state.token) return;
    if (state.current) modelStage.remove(state.current.scene);
    state.current = gltf;
    modelStage.add(gltf.scene);
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
    });

    const triangles = manifest.lodTriangles[level];
    const bytes = manifest[`lod${level}Bytes`];
    dom['current-lod-name'].textContent = `LOD${level}`;
    dom['current-lod-triangles'].textContent = formatNumber(triangles);
    dom['current-lod-size'].textContent = formatBytes(bytes);
    dom['stage-lod-label'].textContent = `LOD${level} / ${Math.round(triangles / 1000)}K`;
    dom['download-track'].href = assetUrl(manifest.lods[level]);
    dom['download-track'].download = `${manifest.id}-lod${level}.glb`;
    dom['download-track'].innerHTML = `Download LOD${level} GLB <span>↓</span>`;
    dom['active-track-file'].textContent = manifest.lods[level];
    document.body.dataset.triangles = String(triangles);
    document.body.dataset.assetReady = 'true';
    if (initial) setView(state.view, true);
    dom['track-loader-progress'].style.width = '100%';
    setTimeout(() => {
      if (token === state.token) setLoading(false);
    }, reducedMotion ? 0 : 140);
  } catch (error) {
    if (token !== state.token) return;
    console.error('Failed to load track LOD', error);
    setLoading(false);
    if (!state.current) dom['track-poster'].classList.remove('is-hidden');
    dom['track-error'].hidden = false;
    dom['track-error-message'].textContent = error.message || 'The local environment GLB could not be read.';
    document.body.dataset.assetReady = 'error';
  }
}

function setView(view, instant = false) {
  if (!camera || !controls || !state.manifest) return;
  state.view = view;
  document.body.dataset.view = view;
  document.querySelectorAll('.track-camera-dock [data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const manifest = state.manifest;
  const start = vector(manifest.start.position);
  const forward = vector(manifest.start.forward).normalize();
  const left = vector(manifest.start.left).normalize();
  let target;
  let destination;
  if (view === 'start') {
    target = start.clone().addScaledVector(forward, 15).add(new THREE.Vector3(0, 3, 0));
    destination = start.clone().addScaledVector(forward, -58).addScaledVector(left, 25).add(new THREE.Vector3(0, 19, 0));
  } else if (view === 'hairpin') {
    const hairpin = vector(manifest.viewpoints.hairpin.position);
    const hairpinForward = vector(manifest.viewpoints.hairpin.forward).normalize();
    target = hairpin.clone().add(new THREE.Vector3(0, 3, 0));
    destination = hairpin.clone().addScaledVector(hairpinForward, -85).add(new THREE.Vector3(65, 75, 55));
  } else if (view === 'coast') {
    const scenic = manifest.viewpoints.coast;
    if (scenic) {
      target = vector(scenic.position).add(new THREE.Vector3(0, 3, 0));
      destination = scenic.cameraOffset ? target.clone().add(vector(scenic.cameraOffset)) : target.clone().addScaledVector(vector(scenic.forward), -85).add(new THREE.Vector3(90, 85, 100));
    } else {
      target = start.clone().add(new THREE.Vector3(0, 0, 65));
      destination = target.clone().add(new THREE.Vector3(175, 115, 265));
    }
  } else {
    target = vector(manifest.viewpoints.overview.target);
    target.y = manifest.viewpoints.overview.target[1];
    const bounds = new THREE.Box3(vector(manifest.bounds.min), vector(manifest.bounds.max));
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = (sphere.radius / Math.sin(limitingFov / 2)) * 1.06;
    const direction = new THREE.Vector3(0.58, 0.7, 0.74).normalize();
    destination = target.clone().addScaledVector(direction, distance);
  }

  if (instant || reducedMotion || !state.current) {
    camera.position.copy(destination);
    controls.target.copy(target);
    controls.update();
    state.cameraTween = null;
    controls.enabled = true;
  } else {
    state.cameraTween = {
      start: performance.now(),
      duration: 850,
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      destination,
      target,
    };
    controls.enabled = false;
  }
}

function animate(time) {
  if (!renderer || !scene || !camera) return;
  if (state.cameraTween) {
    const tween = state.cameraTween;
    const raw = Math.min(1, (time - tween.start) / tween.duration);
    const progress = 1 - Math.pow(1 - raw, 3);
    camera.position.lerpVectors(tween.fromPosition, tween.destination, progress);
    controls.target.lerpVectors(tween.fromTarget, tween.target, progress);
    camera.lookAt(controls.target);
    if (raw >= 1) {
      state.cameraTween = null;
      controls.enabled = true;
    }
  }
  controls.autoRotate = state.autoRotate && state.view === 'overview' && !state.cameraTween && document.body.dataset.assetReady === 'true';
  controls.update();
  renderer.render(scene, camera);
}

async function selectTrack(id, { initial = false, updateUrl = true } = {}) {
  const entry = state.catalogTracks.find((item) => item.id === id);
  if (!entry || (!initial && state.manifest?.id === id && state.current)) return;
  const token = ++state.token;
  try {
    const response = await fetch(assetUrl(entry.manifest));
    if (!response.ok) throw new Error(`Environment manifest request failed (${response.status})`);
    const manifest = await response.json();
    if (token !== state.token) return;
    if (state.current) { modelStage.remove(state.current.scene); state.current = null; }
    state.manifest = manifest;
    state.cameraTween = null;
    if (!initial) state.view = 'overview';
    state.autoRotate = false;
    dom['toggle-track-rotate'].setAttribute('aria-pressed', 'false');
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('track', id); url.hash = '';
      history.replaceState(null, '', url);
    }
    updateManifestUI();
    dom['track-poster'].classList.remove('is-hidden');
    await selectLod(state.lod, { initial: true });
  } catch (error) {
    if (token !== state.token) return;
    console.error('Environment switching failed', error);
    setLoading(false);
    dom['track-poster'].classList.remove('is-hidden');
    dom['track-error'].hidden = false;
    dom['track-error-message'].textContent = error.message || 'The environment manifest could not be read.';
    document.body.dataset.assetReady = 'error';
  }
}

function bindUI() {
  document.querySelectorAll('.track-camera-dock [data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  dom['reset-track-view'].addEventListener('click', () => setView('overview'));
  dom['toggle-track-rotate'].addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    if (state.autoRotate && state.view !== 'overview') setView('overview');
    dom['toggle-track-rotate'].setAttribute('aria-pressed', String(state.autoRotate));
    dom['toggle-track-rotate'].setAttribute('aria-label', state.autoRotate ? 'Pause automatic orbit' : 'Start automatic orbit');
  });
  dom['retry-track'].addEventListener('click', () => {
    cache.delete(`${state.manifest.id}:${state.lod}`);
    selectLod(state.lod, { initial: !state.current });
  });
  window.addEventListener('hashchange', () => {
    const view = location.hash.slice(1);
    if (['overview', 'start', 'hairpin', 'coast'].includes(view)) setView(view);
  });
}

async function init() {
  bindUI();
  try {
    const response = await fetch(assetUrl('assets/catalog.json'));
    if (!response.ok) throw new Error(`Environment catalogue request failed (${response.status})`);
    const catalog = await response.json();
    if (!Array.isArray(catalog.tracks) || !catalog.tracks.length) throw new Error('No local environments are indexed');
    state.catalogTracks = catalog.tracks;
    buildTrackList();
    const params = new URLSearchParams(location.search);
    const requestedTrack = params.get('track');
    const entry = state.catalogTracks.find((item) => item.id === requestedTrack) || state.catalogTracks[0];
    const requestedLod = Number(params.get('lod'));
    state.lod = [0, 1, 2, 3].includes(requestedLod) ? requestedLod : 0;
    const requestedView = location.hash.slice(1);
    state.view = ['overview', 'start', 'hairpin', 'coast'].includes(requestedView) ? requestedView : 'overview';
    initScene();
    await selectTrack(entry.id, { initial: true, updateUrl: false });
  } catch (error) {
    console.error('Track initialization failed', error);
    setLoading(false);
    dom['track-poster'].classList.remove('is-hidden');
    dom['track-error'].hidden = false;
    dom['track-error-message'].textContent = error.message || 'The environment library could not be initialized.';
    document.body.dataset.assetReady = 'error';
  }
}

init();
