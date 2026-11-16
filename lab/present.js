import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { ticker } from '../src/core/Ticker.js';
import { WebGLApp } from '../src/graphics/WebGLApp.js';
import { createSharedUniforms } from '../src/graphics/PainterlyMaterial.js';
import { OUTLINE } from '../src/graphics/constants.js';
import { TextureLoader } from '../src/assets/TextureLoader.js';
import { GeometryLoader } from '../src/assets/GeometryLoader.js';
import { PresentScene, SPAWNS } from '../src/game/PresentScene.js';

const hud = document.getElementById('hud');
const query = new URLSearchParams(location.search);
const log = (line) => {
  hud.textContent = line;
  console.log(line);
};

const app = new WebGLApp();
app.resize();

const camera = new THREE.PerspectiveCamera(45, app.width / app.height, 0.2, 175);
const geometryLoader = new GeometryLoader();
const textureLoader = new TextureLoader(app.renderer);

const load = (name, mode) => textureLoader.load(name, mode);
const textureList = await Promise.all([
  load('atlas.png', 'srgb-nearest'),
  load('noise-simplex-layered-pixellated-highq.ktx2', 'linearfilter-repeat'),
  load('noises-terrain.ktx2', 'linearfilter-repeat'),
  load('eye-highq.ktx2', 'repeat'),
  load('mainchar-eye-highq.ktx2', 'repeat'),
  load('mouth-highq.ktx2', 'repeat'),
  load('clouds_noise_512.ktx2', 'srgb-repeat'),
  load('water-noises-highq.ktx2', 'linearfilter-repeat'),
  load('lut.ktx2', 'luttetrahedral'),
]);
const [palette, noise, noiseTerrain, eye, eyeCharacter, mouth, clouds, waterNoise, lut] = textureList;
const textures = { palette, noise, noiseTerrain, eye, eyeCharacter, mouth, clouds, waterNoise, lut };
const shared = createSharedUniforms(textures);

const spawn = SPAWNS[Number(query.get('spawn') ?? 1) % SPAWNS.length];
const present = new PresentScene({
  app,
  camera,
  textures,
  shared,
  geometryLoader,
  spawnIndex: Number(query.get('spawn') ?? 1),
});
log('loading terrain + water…');
const started = performance.now();
await present.load();
log(`scene ready in ${(performance.now() - started) | 0} ms`);

const pipeline = app.createPipeline(camera);
pipeline.setLut(lut);
pipeline.setOutlineTuning(OUTLINE);
app.onResize((width, height) => {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  present.resize(width, height);
});

const focus = new THREE.Vector3().fromArray(spawn.position);
const up = focus.clone().normalize();
camera.baseTarget = focus.clone();
camera.position.copy(focus).addScaledVector(up, Number(query.get('h') ?? 2.2)).add(
  new THREE.Vector3(0, 0, 1).cross(up).normalize().multiplyScalar(Number(query.get('back') ?? 5.5)),
);
camera.lookAt(focus);

const controls = new OrbitControls(camera, app.renderer.domElement);
controls.target.copy(focus);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.minDistance = 2;
controls.maxDistance = 160;
controls.update();

ticker.on('prerender', () => {
  shared.uTime.value = ticker.time;
  controls.update();
  camera.baseTarget = controls.target;
  camera.basePosition = camera.position;
  present.focus.copy(controls.target);
  present.update(ticker.time, ticker.delta);
});
const hideWater = query.has('nowater');
ticker.on('render', () => {
  present.render(pipeline);
  if (hideWater) pipeline.setWaterTexture(null);
  hud.textContent =
    `calls ${app.renderer.info.render.calls} tris ${app.renderer.info.render.triangles} ` +
    `fps ${ticker.averageFPS.toFixed(0)}`;
});
ticker.start();

const debug = (flag) => pipeline.setDebug({ [flag]: true });
if (query.has('surface')) debug('surfaceId');
if (query.has('outline')) debug('outline');
if (query.has('nolut')) pipeline.compositeMaterial.uniforms.uLUTIntensity.value = 0;

window.__lab = { app, camera, present, pipeline, controls, THREE, spawn };
