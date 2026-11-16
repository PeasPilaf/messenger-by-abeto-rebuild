import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { ticker } from '../src/core/Ticker.js';
import { WebGLApp } from '../src/graphics/WebGLApp.js';
import { loadRendererTextures } from '../src/graphics/Textures.js';
import { createPainterlyMaterial, createSharedUniforms } from '../src/graphics/PainterlyMaterial.js';
import { COLORS, SHADOW } from '../src/graphics/constants.js';
import { GeometryLoader } from '../src/assets/GeometryLoader.js';
import { Avatar, CLIP_NAMES } from '../src/gameplay/avatar/Avatar.js';
import {
  ACCESSORIES,
  CATEGORIES,
  randomAccessories,
  readAccessories,
  writeAccessories,
} from '../src/gameplay/avatar/Accessories.js';
import {
  CustomizeScreen,
  CUSTOMIZE_CAMERA,
  CUSTOMIZE_LAYOUT,
  computeCustomizeCameraPose,
  frameCamera,
} from '../src/gameplay/avatar/CustomizeScreen.js';

const hud = document.getElementById('hud');
const query = new URLSearchParams(location.search);

let customize = null;

const savedSelection = query.get('accessories')?.split(',');
if (savedSelection) writeAccessories(savedSelection);
let accessories = readAccessories();

const app = new WebGLApp();
app.resize();

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.fogNear);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
camera.position.set(1.75, 1.3, 3.15);

app.onResize((width, height) => {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  customize?.resize();
});

const pipeline = app.createPipeline(camera);

const controls = new OrbitControls(camera, app.renderer.domElement);
controls.target.set(0, 0.85, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.minDistance = 1.2;
controls.maxDistance = 7;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

const textures = await loadRendererTextures(app.renderer);
pipeline.setLut(textures.lut);
const shared = createSharedUniforms(textures);

shared.tEye.value = textures.eyeCharacter;

const groundGeometry = new THREE.CircleGeometry(2.6, 96);
groundGeometry.rotateX(-Math.PI / 2);
groundGeometry.setAttribute(
  'surfaceId',
  new THREE.BufferAttribute(new Float32Array(groundGeometry.attributes.position.count), 1),
);
const groundMaterial = createPainterlyMaterial({ kind: 'object', shared });
groundMaterial.uniforms.diffuse.value.set('#9a9b87');
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.receiveShadow = true;
scene.add(ground);

const sun = new THREE.DirectionalLight(COLORS.lightColor, 3);
sun.position.copy(new THREE.Vector3(-41.6, 80.9, 41.6).normalize().multiplyScalar(8));
sun.target.position.set(0, 0.8, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -2;
sun.shadow.camera.right = 2;
sun.shadow.camera.top = 2;
sun.shadow.camera.bottom = -2;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 20;
sun.shadow.bias = SHADOW.bias;
sun.shadow.normalBias = SHADOW.normalBias;
scene.add(sun);
scene.add(sun.target);

const geometryLoader = new GeometryLoader();
const avatar = new Avatar({
  loadGeometry: (name) => geometryLoader.load(name),
  loadBones: (name) => geometryLoader.loadBones(name),
  loadAnimation: (name) => geometryLoader.loadAnimation(name),
  material: createPainterlyMaterial({ kind: 'character', shared }),
  accessories,
  animationOffset: 0,
});
await avatar.load();
accessories = avatar.accessories;
scene.add(avatar.object3D);

scene.updateMatrixWorld(true);
let bindError = 0;
for (let joint = 0; joint < avatar.skeleton.bones.length; joint++) {
  const actual = avatar.skeleton.bones[joint].matrixWorld.elements;
  const expected = avatar.skeleton.bindMatrices[joint].elements;
  for (let element = 0; element < 16; element++) {
    bindError = Math.max(bindError, Math.abs(actual[element] - expected[element]));
  }
}

const forcedClip = query.get('clip');
if (forcedClip !== null) avatar.setClipOverride(Number(forcedClip));
avatar.setSpeed(Number(query.get('speed') ?? 0));
avatar.setAirborne(query.get('air') === '1');

customize = new CustomizeScreen({
  avatar,
  scene,
  screenWidth: () => window.innerWidth,
  screenHeight: () => window.innerHeight,
  onSelectionChanged: (selection) => {
    accessories = selection;
  },
});

let cameraTween = null;
let cameraSaved = null;
let selectedRow = 0;

function tweenCamera(toPosition, toTarget, duration) {
  cameraTween = {
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPosition: toPosition.clone(),
    toTarget: toTarget.clone(),
    elapsed: 0,
    duration,
  };
}

function updateCameraTween(delta) {
  if (!cameraTween) return;
  cameraTween.elapsed += delta;
  const t = Math.min(1, cameraTween.elapsed / cameraTween.duration);
  const eased = t * t * (3 - 2 * t);
  camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
  controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
  camera.lookAt(controls.target);
  if (t >= 1) cameraTween = null;
}

function openCustomize() {
  if (customize.isOpen) return;
  cameraSaved = { position: camera.position.clone(), target: controls.target.clone() };

  avatar.setSpeed(0);
  avatar.setAirborne(false);
  avatar.setClipOverride(null);
  customize.show();
  const pose = computeCustomizeCameraPose(avatar);
  controls.enabled = false;
  tweenCamera(pose.position, pose.target, pose.duration);
  avatar.object3D.rotation.y = pose.characterYaw;
}

function closeCustomize() {
  if (!customize.isOpen) return;
  customize.hide();
  if (cameraSaved) tweenCamera(cameraSaved.position, cameraSaved.target, CUSTOMIZE_CAMERA.closeDuration);
}

function cycleCustomize(direction) {
  customize.stepAccessory(CUSTOMIZE_LAYOUT.rows[selectedRow], direction);
}

app.renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!customize.isOpen) return;
  const rect = app.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const index = customize.pick(camera, ndc);
  if (index !== null) customize.activate(index);
});

if (query.get('customize') === '1') {
  openCustomize();
  frameCamera(camera, avatar);
  customize.update(1.0, camera);
}

const CLIP_KEY_BY_CODE = {
  Digit0: null,
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
};

let accessoryQueue = Promise.resolve();

function applyAccessorySelection(selection) {
  accessoryQueue = accessoryQueue
    .then(async () => {
      accessories = await avatar.setAccessories(selection);
      accessories = writeAccessories(accessories);
    })
    .catch((error) => console.error('avatar lab: accessory switch failed', error));
}

function cycleClip(step) {
  const order = [null, 0, 1, 2, 3, 4, 5, 6];
  const position = order.indexOf(avatar.forcedClipIndex);
  avatar.setClipOverride(order[(position + step + order.length) % order.length]);
}

function cycleAccessory(category) {
  const slot = CATEGORIES.indexOf(category);
  const parts = ACCESSORIES[category];
  const selection = accessories.slice();
  selection[slot] = parts[(parts.indexOf(selection[slot]) + 1) % parts.length];
  applyAccessorySelection(selection);
}

function randomLook() {
  applyAccessorySelection(randomAccessories());
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  let handled = true;

  if (event.code === 'KeyL') {
    customize.isOpen ? closeCustomize() : openCustomize();
  } else if (event.code === 'Escape') {
    if (customize.isOpen) closeCustomize();
    else handled = false;
  } else if (customize.isOpen) {
    switch (event.code) {
      case 'ArrowUp': selectedRow = (selectedRow + 1) % CUSTOMIZE_LAYOUT.rows.length; break;
      case 'ArrowDown':
        selectedRow =
          (selectedRow - 1 + CUSTOMIZE_LAYOUT.rows.length) % CUSTOMIZE_LAYOUT.rows.length;
        break;
      case 'ArrowRight': cycleCustomize(1); break;
      case 'ArrowLeft': cycleCustomize(-1); break;
      default: handled = false;
    }
  } else if (event.code in CLIP_KEY_BY_CODE) {
    avatar.setClipOverride(CLIP_KEY_BY_CODE[event.code]);
  } else {
    switch (event.code) {
      case 'ArrowRight': cycleClip(1); break;
      case 'ArrowLeft': cycleClip(-1); break;
      case 'KeyH': cycleAccessory('hair'); break;
      case 'KeyT': cycleAccessory('top'); break;
      case 'KeyB': cycleAccessory('bottom'); break;
      case 'KeyS': cycleAccessory('shoes'); break;
      case 'KeyR': randomLook(); break;
      default: handled = false;
    }
  }
  if (handled) event.preventDefault();
});

const weightNames = ['idle', 'run', 'sprint', 'air', 'afk1', 'afk2', 'afk3'];

function drawHud() {
  const time = avatar.currentClipTime;
  const duration = Math.max(avatar.currentClipDuration, 1e-6);
  const weights = avatar.weights;
  const mode = avatar.forcedClipIndex === null ? 'auto' : `forced ${CLIP_NAMES[avatar.forcedClipIndex]}`;

  const clipLine =
    `clip ${avatar.currentClipName.padEnd(6)} ${time.toFixed(2).padStart(5)} / ${duration.toFixed(2)} s` +
    `   ${String(avatar.currentClipFps).padStart(2)} fps   joints ${avatar.jointCount}`;
  const weightLine =
    `weights ${weightNames.map((name, index) => `${name} ${weights[index].toFixed(2)}`).join('  ')}`;
  const stateLine =
    `state   ${mode}   afkIndex ${avatar.animationIndex}   sim ${ticker.time.toFixed(1)}s` +
    `   bindErr ${bindError.toExponential(1)}`;
  const partsLine = `parts   ${accessories.join(' ')}`;
  const customizeLine = customize.isOpen
    ? `customize  row ${CUSTOMIZE_LAYOUT.rows[selectedRow]}   ↑/↓ row · ←/→ part · L/Esc close`
    : '';
  hud.textContent = [clipLine, weightLine, stateLine, partsLine, customizeLine]
    .filter(Boolean)
    .join('\n');
}

ticker.on('prerender', () => {
  shared.uTime.value = ticker.time;
  avatar.update(ticker.delta);
  customize.update(ticker.delta, camera);
  updateCameraTween(ticker.delta);
  const cameraLocked = customize.isOpen || cameraTween !== null;
  if (!cameraLocked) controls.update();
  else camera.lookAt(controls.target);
});

ticker.on('render', () => {
  pipeline.render(scene, camera);
  drawHud();
});

console.log(
  '[avatar-lab] joints', avatar.jointCount, '|', avatar.jointLabels.join(','),
);
console.log(
  '[avatar-lab] clips',
  avatar.clips
    .map((clip) => `${clip.name} ${clip.userData.frames}f@${clip.userData.fps} ${clip.duration.toFixed(3)}s`)
    .join(' | '),
);
console.log('[avatar-lab] bind pose max |matrixWorld - bindMatrix|', bindError);
console.log('[avatar-lab] accessories', accessories.join(','));
console.log('[avatar-lab] vertices', avatar.geometry.attributes.position.count);
console.log('[avatar-lab] customize icons', `${customize.icons.length} vector arrow/cross meshes`);

window.__lab = {
  ready: true,
  THREE,
  app,
  scene,
  camera,
  controls,
  pipeline,
  avatar,
  textures,
  bindError,
  accessories,
  clips: avatar.clips.map((clip) => ({ name: clip.name, duration: clip.duration, ...clip.userData })),
  customize,
  openCustomize,
  closeCustomize,
  cycleCustomize,
  setClip: (index) => avatar.setClipOverride(index),
  cycleClip,
  cycleAccessory,
  randomLook,
};

ticker.start();
