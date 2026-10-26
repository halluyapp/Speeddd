import './effects.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE_URL = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE_URL}${path.replace(/^\//, '')}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dom = Object.fromEntries([
  'effects-stage', 'effects-canvas', 'effects-poster', 'effects-loader', 'effects-loader-title', 'effects-loader-detail',
  'effects-loader-progress', 'effects-error', 'effects-error-message', 'retry-effect', 'effect-list', 'effect-package-type',
  'effect-package-name', 'effect-atlas', 'effect-frames', 'effect-fps', 'effect-blend', 'effect-download', 'effect-master-path',
  'stage-effect-label', 'stage-effect-name', 'stage-effect-category', 'effect-play', 'effect-replay', 'effect-loop',
  'effect-speed', 'effect-scrubber', 'effect-frame', 'effect-progress-bar', 'toggle-effects-orbit', 'reset-effects-view',
  'audio-filter', 'audio-volume', 'audio-volume-value', 'audio-list', 'audio-category', 'audio-name', 'audio-duration',
  'audio-waveform', 'audio-description', 'audio-play', 'audio-time', 'audio-format', 'audio-loop', 'audio-download',
  'audio-master-path', 'active-effect-file',
].map((id) => [id, document.getElementById(id)]));

const state = {
  manifest: null,
  ready: false,
  selectedEffect: 'boost-flame',
  effectMesh: null,
  texture: null,
  effectElapsed: 0,
  effectFrame: -1,
  effectPlaying: false,
  effectLoop: true,
  effectSpeed: 1,
  effectToken: 0,
  view: 'iso',
  autoRotate: false,
  cameraTween: null,
  selectedAudio: 'engine-idle-loop',
  audioContext: null,
  audioGain: null,
  audioSource: null,
  audioPlaying: false,
  audioStartedAt: 0,
  audioToken: 0,
  volume: 0.6,
};
const textures = new Map();
const texturePending = new Map();
const audioBuffers = new Map();
const audioPending = new Map();

let renderer;
let scene;
let camera;
let controls;
let textureLoader;
let effectGroup;
let resizeObserver;
let previousTime = 0;

const selectedEffect = () => state.manifest?.effects.find((effect) => effect.id === state.selectedEffect);
const selectedAudio = () => state.manifest?.audio.find((audio) => audio.id === state.selectedAudio);
const formatBytes = (bytes) => bytes < 1e6 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1e6).toFixed(1)} MB`;

function initScene() {
  const width = Math.max(1, dom['effects-stage'].clientWidth);
  const height = Math.max(1, dom['effects-stage'].clientHeight);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  dom['effects-canvas'].appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#111b20');
  scene.fog = new THREE.Fog('#111b20', 22, 55);
  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(7, 5, 13);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = true;
  controls.minDistance = 3;
  controls.maxDistance = 40;
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotateSpeed = 0.4;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.65;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xddeeee, 0x172226, 1.2));
  const key = new THREE.DirectionalLight(0xe9f4e9, 1.8);
  key.position.set(5, 10, 8);
  scene.add(key);

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 0.18, 64),
    new THREE.MeshStandardMaterial({ color: '#172429', metalness: 0.35, roughness: 0.75 }),
  );
  floor.position.y = -0.11;
  scene.add(floor);
  const grid = new THREE.GridHelper(17, 17, '#385154', '#24383c');
  grid.position.y = 0.005;
  grid.material.transparent = true;
  grid.material.opacity = 0.38;
  scene.add(grid);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(8.15, 8.19, 80),
    new THREE.MeshBasicMaterial({ color: '#74928d', transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);

  effectGroup = new THREE.Group();
  effectGroup.name = 'VFX runtime preview';
  scene.add(effectGroup);
  textureLoader = new THREE.TextureLoader();
  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(dom['effects-stage']);
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, dom['effects-stage'].clientWidth);
  const height = Math.max(1, dom['effects-stage'].clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  if (state.ready) setView(state.view, true);
}

async function loadTexture(effect) {
  if (!textures.has(effect.id)) {
    if (!texturePending.has(effect.id)) {
      const promise = textureLoader.loadAsync(assetUrl(effect.runtime), (event) => {
        if (event.total) dom['effects-loader-progress'].style.width = `${Math.max(5, event.loaded / event.total * 100)}%`;
      }).then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        textures.set(effect.id, texture);
        texturePending.delete(effect.id);
        return texture;
      }).catch((error) => {
        texturePending.delete(effect.id);
        throw error;
      });
      texturePending.set(effect.id, promise);
    }
    await texturePending.get(effect.id);
  }
  return textures.get(effect.id);
}

function setLoading(visible, title = 'Preparing Media Lab', detail = 'Illustrated preview · WebP loading…') {
  dom['effects-loader'].classList.toggle('is-complete', !visible);
  dom['effects-loader-title'].textContent = title;
  dom['effects-loader-detail'].textContent = detail;
}

function buildEffectList() {
  dom['effect-list'].innerHTML = state.manifest.effects.map((effect) => `
    <button type="button" data-effect="${effect.id}" aria-pressed="${effect.id === state.selectedEffect}" class="${effect.id === state.selectedEffect ? 'active' : ''}">
      <img src="${assetUrl(effect.thumbnail)}" width="180" height="180" alt="" loading="lazy" />
      <span><strong>${effect.name}</strong><small>${effect.category} · ${effect.frames}${effect.frames > 1 ? ' frames' : ' sprite'}</small></span>
      <b>${effect.fps ? `${effect.fps} FPS` : effect.type.toUpperCase()}</b>
    </button>
  `).join('');
  dom['effect-list'].querySelectorAll('[data-effect]').forEach((button) => {
    button.addEventListener('click', () => selectEffect(button.dataset.effect));
  });
}

function updateEffectPackage() {
  const effect = selectedEffect();
  if (!effect) return;
  dom['effect-list'].querySelectorAll('[data-effect]').forEach((button) => {
    const active = button.dataset.effect === effect.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  dom['effect-package-type'].textContent = `${effect.loop ? 'LOOPING' : effect.frames > 1 ? 'ONE-SHOT' : 'STATIC'} ${effect.type.toUpperCase()}`;
  dom['effect-package-name'].textContent = effect.name;
  dom['effect-atlas'].textContent = `${effect.atlasWidth} × ${effect.atlasHeight}`;
  dom['effect-frames'].textContent = `${effect.frames} / ${effect.columns} × ${effect.rows}`;
  dom['effect-fps'].textContent = effect.fps ? `${effect.fps} fps · ${effect.duration.toFixed(2)} s` : 'Static texture';
  dom['effect-blend'].textContent = effect.blend === 'additive' ? 'Additive' : 'Normal alpha';
  dom['effect-download'].href = assetUrl(effect.runtime);
  dom['effect-download'].download = `${effect.id}.webp`;
  dom['effect-master-path'].textContent = effect.master;
  dom['stage-effect-label'].textContent = `${effect.id.toUpperCase().replaceAll('-', ' ')} / ${effect.frames} ${effect.frames === 1 ? 'SPRITE' : 'FRAMES'}`;
  dom['stage-effect-name'].textContent = effect.name;
  dom['stage-effect-category'].textContent = `${effect.category.toUpperCase()} / ${effect.blend.toUpperCase()}`;
  dom['active-effect-file'].textContent = effect.runtime;
  dom['effect-scrubber'].max = Math.max(0, effect.frames - 1);
  dom['effect-scrubber'].disabled = effect.frames <= 1;
  dom['effect-play'].disabled = effect.frames <= 1;
  dom['effect-replay'].disabled = effect.frames <= 1;
  dom['effect-loop'].disabled = effect.frames <= 1;
  updateTransport();
}

function updateTransport() {
  dom['effect-play'].textContent = state.effectPlaying ? 'Pause' : 'Play';
  dom['effect-play'].setAttribute('aria-pressed', String(state.effectPlaying));
  dom['effect-loop'].textContent = state.effectLoop ? 'Loop on' : 'Loop off';
  dom['effect-loop'].setAttribute('aria-pressed', String(state.effectLoop));
  document.body.dataset.effectPlaying = String(state.effectPlaying);
}

function setEffectPlaying(playing) {
  state.effectPlaying = Boolean(playing && selectedEffect()?.frames > 1);
  updateTransport();
}

function setFrame(frame) {
  const effect = selectedEffect();
  if (!effect || !state.texture) return;
  const value = THREE.MathUtils.clamp(Math.floor(frame), 0, effect.frames - 1);
  if (value !== state.effectFrame) {
    state.effectFrame = value;
    const column = value % effect.columns;
    const row = Math.floor(value / effect.columns);
    state.texture.repeat.set(1 / effect.columns, 1 / effect.rows);
    state.texture.offset.set(column / effect.columns, 1 - (row + 1) / effect.rows);
  }
  dom['effect-scrubber'].value = value;
  dom['effect-frame'].textContent = `F ${String(value + 1).padStart(2, '0')} / ${effect.frames}`;
  dom['effect-progress-bar'].style.width = `${(value + 1) / effect.frames * 100}%`;
  document.body.dataset.effectFrame = String(value);
}

async function selectEffect(id) {
  const effect = state.manifest?.effects.find((entry) => entry.id === id);
  if (!effect) return;
  const token = ++state.effectToken;
  state.selectedEffect = id;
  setEffectPlaying(false);
  updateEffectPackage();
  setLoading(true, `Loading ${effect.name}`, `${effect.atlasWidth} × ${effect.atlasHeight} · ${formatBytes(effect.bytes)}`);
  dom['effects-error'].hidden = true;
  try {
    const texture = await loadTexture(effect);
    if (token !== state.effectToken) return;
    if (state.effectMesh) {
      effectGroup.remove(state.effectMesh);
      state.effectMesh.geometry.dispose();
      state.effectMesh.material.dispose();
    }
    state.texture = texture;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.003,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: effect.blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(effect.suggestedSize[0], effect.suggestedSize[1]), material);
    mesh.name = effect.name;
    if (effect.decal) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.025;
    } else {
      mesh.position.y = effect.suggestedSize[1] / 2 + 0.35;
    }
    effectGroup.add(mesh);
    state.effectMesh = mesh;
    state.effectLoop = effect.loop;
    state.effectElapsed = reducedMotion && effect.frames > 1 ? Math.floor(effect.frames * 0.55) / effect.fps : 0;
    state.effectFrame = -1;
    setFrame(Math.floor(state.effectElapsed * effect.fps));
    setEffectPlaying(effect.frames > 1 && !reducedMotion);
    state.ready = true;
    document.body.dataset.assetReady = 'true';
    document.body.dataset.effect = effect.id;
    dom['effects-loader-progress'].style.width = '100%';
    setLoading(false);
    dom['effects-poster'].classList.add('is-hidden');
    updateTransport();
    setView(state.view, true);
  } catch (error) {
    console.error('Failed to load VFX texture', error);
    document.body.dataset.assetReady = state.ready ? 'true' : 'error';
    setLoading(false);
    dom['effects-error-message'].textContent = error.message || 'The local WebP texture could not be read.';
    dom['effects-error'].hidden = false;
  }
}

function setView(view, instant = false) {
  const effect = selectedEffect();
  if (!state.ready || !effect || !camera || !controls) return;
  state.view = view;
  document.body.dataset.view = view;
  document.querySelectorAll('.effects-camera-dock [data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const [width, height] = effect.suggestedSize;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const fitHeight = effect.decal ? height * (view === 'top' ? 1.05 : 0.75) : height + 0.8;
  const distance = Math.max(
    fitHeight / (2 * Math.tan(verticalFov / 2)),
    width / (2 * Math.tan(horizontalFov / 2)),
  ) * 1.32;
  const target = new THREE.Vector3(0, effect.decal ? 0 : height * 0.48 + 0.3, 0);
  let direction;
  if (view === 'front') direction = new THREE.Vector3(0, effect.decal ? 0.45 : 0.08, 1).normalize();
  else if (view === 'top') direction = new THREE.Vector3(0, 1, effect.decal ? 0.001 : 0.32).normalize();
  else direction = new THREE.Vector3(0.55, effect.decal ? 0.75 : 0.34, 1).normalize();
  const destination = target.clone().addScaledVector(direction, Math.max(4, distance));
  if (instant || reducedMotion) {
    camera.position.copy(destination);
    controls.target.copy(target);
    controls.update();
    state.cameraTween = null;
    controls.enabled = true;
  } else {
    state.cameraTween = { start: performance.now(), duration: 750, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), destination, target };
    controls.enabled = false;
  }
}

function buildAudioList() {
  dom['audio-list'].innerHTML = state.manifest.audio.map((audio) => `
    <button type="button" class="audio-row${audio.id === state.selectedAudio ? ' active' : ''}" data-audio="${audio.id}" data-category="${audio.category}" aria-pressed="${audio.id === state.selectedAudio}">
      <span><strong>${audio.name}</strong><small>${audio.category}${audio.loop ? ' · Loop' : ''}</small></span>
      <img src="${assetUrl(audio.waveform)}" width="480" height="64" alt="" loading="lazy" /><b>${audio.duration.toFixed(2)}s</b>
    </button>
  `).join('');
  dom['audio-list'].querySelectorAll('[data-audio]').forEach((button) => {
    button.addEventListener('click', () => selectAudio(button.dataset.audio));
  });
}

function updateAudioTransport() {
  dom['audio-play'].textContent = state.audioPlaying ? 'Stop sound' : 'Play sound';
  dom['audio-play'].setAttribute('aria-pressed', String(state.audioPlaying));
  document.body.dataset.audioPlaying = String(state.audioPlaying);
  if (!state.audioPlaying) {
    const audio = selectedAudio();
    dom['audio-time'].textContent = `0.00 / ${audio ? audio.duration.toFixed(2) : '0.00'}`;
  }
}

function stopAudio() {
  state.audioToken += 1;
  if (state.audioSource) {
    state.audioSource.onended = null;
    try { state.audioSource.stop(); } catch { /* Already stopped. */ }
    state.audioSource.disconnect();
    state.audioSource = null;
  }
  state.audioPlaying = false;
  updateAudioTransport();
}

function selectAudio(id) {
  if (!state.manifest?.audio.some((audio) => audio.id === id)) return;
  if (state.selectedAudio !== id) stopAudio();
  state.selectedAudio = id;
  const audio = selectedAudio();
  dom['audio-list'].querySelectorAll('[data-audio]').forEach((button) => {
    const active = button.dataset.audio === id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  dom['audio-category'].textContent = `${audio.category.toUpperCase()} / ${audio.loop ? 'LOOP' : 'ONE-SHOT'}`;
  dom['audio-name'].textContent = audio.name;
  dom['audio-duration'].textContent = `${audio.duration.toFixed(2)} s`;
  dom['audio-waveform'].src = assetUrl(audio.waveform);
  dom['audio-waveform'].alt = `${audio.name} waveform`;
  dom['audio-description'].textContent = audio.description;
  dom['audio-format'].textContent = `${audio.sampleRate / 1000} KHZ / ${audio.bitDepth} BIT / STEREO`;
  dom['audio-loop'].textContent = audio.loop ? 'SEAMLESS LOOP' : 'ONE SHOT';
  dom['audio-download'].href = assetUrl(audio.runtime);
  dom['audio-download'].download = `${audio.id}.wav`;
  dom['audio-master-path'].textContent = audio.master;
  updateAudioTransport();
}

function ensureAudioContext() {
  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser');
    state.audioContext = new AudioContextClass();
    state.audioGain = state.audioContext.createGain();
    state.audioGain.gain.value = state.volume;
    state.audioGain.connect(state.audioContext.destination);
  }
  return state.audioContext;
}

async function loadAudioBuffer(audio) {
  if (!audioBuffers.has(audio.id)) {
    if (!audioPending.has(audio.id)) {
      const context = ensureAudioContext();
      const promise = fetch(assetUrl(audio.runtime)).then((response) => {
        if (!response.ok) throw new Error(`${audio.name} returned ${response.status}`);
        return response.arrayBuffer();
      }).then((buffer) => context.decodeAudioData(buffer)).then((buffer) => {
        audioBuffers.set(audio.id, buffer);
        audioPending.delete(audio.id);
        return buffer;
      }).catch((error) => {
        audioPending.delete(audio.id);
        throw error;
      });
      audioPending.set(audio.id, promise);
    }
    await audioPending.get(audio.id);
  }
  return audioBuffers.get(audio.id);
}

async function playAudio() {
  if (state.audioPlaying) {
    stopAudio();
    return;
  }
  const audio = selectedAudio();
  if (!audio) return;
  const token = ++state.audioToken;
  dom['audio-play'].disabled = true;
  dom['audio-play'].textContent = 'Loading…';
  try {
    const context = ensureAudioContext();
    await context.resume();
    const buffer = await loadAudioBuffer(audio);
    if (token !== state.audioToken) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = audio.loop;
    source.connect(state.audioGain);
    source.onended = () => {
      if (token !== state.audioToken) return;
      state.audioSource = null;
      state.audioPlaying = false;
      updateAudioTransport();
    };
    state.audioSource = source;
    state.audioStartedAt = context.currentTime;
    state.audioPlaying = true;
    source.start();
    updateAudioTransport();
  } catch (error) {
    console.error('Failed to preview audio', error);
    dom['audio-time'].textContent = 'Decode failed — retry';
  } finally {
    if (token === state.audioToken) {
      dom['audio-play'].disabled = false;
      if (!state.audioPlaying) dom['audio-play'].textContent = 'Play sound';
    }
  }
}

function bindUI() {
  dom['effect-play'].addEventListener('click', () => {
    const effect = selectedEffect();
    if (!effect || effect.frames <= 1) return;
    if (!state.effectPlaying && !state.effectLoop && state.effectElapsed >= effect.duration) state.effectElapsed = 0;
    setEffectPlaying(!state.effectPlaying);
  });
  dom['effect-replay'].addEventListener('click', () => {
    state.effectElapsed = 0;
    setFrame(0);
    setEffectPlaying(true);
  });
  dom['effect-loop'].addEventListener('click', () => {
    state.effectLoop = !state.effectLoop;
    updateTransport();
  });
  dom['effect-speed'].addEventListener('change', () => { state.effectSpeed = Number(dom['effect-speed'].value); });
  dom['effect-scrubber'].addEventListener('input', () => {
    setEffectPlaying(false);
    const frame = Number(dom['effect-scrubber'].value);
    state.effectElapsed = selectedEffect().fps ? frame / selectedEffect().fps : 0;
    setFrame(frame);
  });
  document.querySelectorAll('.effects-camera-dock [data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  dom['toggle-effects-orbit'].addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    if (state.autoRotate) setView('iso');
    dom['toggle-effects-orbit'].setAttribute('aria-pressed', String(state.autoRotate));
  });
  dom['reset-effects-view'].addEventListener('click', () => setView('iso'));
  dom['retry-effect'].addEventListener('click', () => selectEffect(state.selectedEffect));
  dom['audio-play'].addEventListener('click', playAudio);
  dom['audio-volume'].addEventListener('input', () => {
    state.volume = Number(dom['audio-volume'].value) / 100;
    dom['audio-volume-value'].textContent = dom['audio-volume'].value;
    if (state.audioGain) state.audioGain.gain.setTargetAtTime(state.volume, state.audioContext.currentTime, 0.02);
  });
  dom['audio-filter'].addEventListener('change', () => {
    const filter = dom['audio-filter'].value;
    dom['audio-list'].querySelectorAll('[data-audio]').forEach((button) => {
      button.hidden = filter !== 'all' && button.dataset.category !== filter;
    });
    document.body.dataset.audioFilter = filter;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
  window.addEventListener('pagehide', stopAudio);
}

function animate(time) {
  if (!renderer || !scene || !camera) return;
  const delta = previousTime ? Math.min(0.06, (time - previousTime) / 1000) : 0;
  previousTime = time;
  const effect = selectedEffect();
  if (state.effectPlaying && effect?.frames > 1) {
    state.effectElapsed += delta * state.effectSpeed;
    let frame = Math.floor(state.effectElapsed * effect.fps);
    if (frame >= effect.frames) {
      if (state.effectLoop) {
        state.effectElapsed %= effect.duration;
        frame = Math.floor(state.effectElapsed * effect.fps);
      } else {
        state.effectElapsed = effect.duration;
        frame = effect.frames - 1;
        setEffectPlaying(false);
      }
    }
    setFrame(frame);
  }
  if (state.audioPlaying && state.audioContext) {
    const audio = selectedAudio();
    const elapsed = state.audioContext.currentTime - state.audioStartedAt;
    const current = audio.loop ? elapsed % audio.duration : Math.min(elapsed, audio.duration);
    dom['audio-time'].textContent = `${current.toFixed(2)} / ${audio.duration.toFixed(2)}`;
  }
  if (state.cameraTween) {
    const tween = state.cameraTween;
    const raw = Math.min(1, (time - tween.start) / tween.duration);
    const progress = 1 - Math.pow(1 - raw, 3);
    camera.position.lerpVectors(tween.fromPosition, tween.destination, progress);
    controls.target.lerpVectors(tween.fromTarget, tween.target, progress);
    camera.lookAt(controls.target);
    if (raw >= 1) { state.cameraTween = null; controls.enabled = true; }
  }
  controls.autoRotate = state.autoRotate && state.view === 'iso' && !state.cameraTween && state.ready;
  controls.update();
  renderer.render(scene, camera);
}

async function initialise() {
  try {
    initScene();
    bindUI();
    document.body.dataset.assetReady = 'loading';
    const response = await fetch(assetUrl('assets/media/vfx-audio.json'));
    if (!response.ok) throw new Error(`Media manifest returned ${response.status}`);
    state.manifest = await response.json();
    buildEffectList();
    buildAudioList();
    selectAudio(state.selectedAudio);
    await selectEffect(state.selectedEffect);
  } catch (error) {
    console.error('Failed to initialise media lab', error);
    document.body.dataset.assetReady = 'error';
    setLoading(false);
    dom['effects-error-message'].textContent = error.message || 'The local media package could not be read.';
    dom['effects-error'].hidden = false;
  }
}

initialise();
