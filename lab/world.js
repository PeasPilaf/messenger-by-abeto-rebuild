import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { ticker } from '../src/core/Ticker.js';
import { WebGLApp } from '../src/graphics/WebGLApp.js';
import { createSharedUniforms } from '../src/graphics/PainterlyMaterial.js';
import { OUTLINE } from '../src/graphics/constants.js';
import { TextureLoader } from '../src/assets/TextureLoader.js';
import { GeometryLoader } from '../src/assets/GeometryLoader.js';
import { PresentScene, SPAWNS } from '../src/game/PresentScene.js';
import { WorldExtras } from '../src/world/extras/WorldExtras.js';

const hud = document.getElementById('hud');
const help = document.getElementById('help');
const query = new URLSearchParams(location.search);
const log = (line) => {
  hud.textContent = line;
  console.log(line);
};
const vectorFromParam = (name) => {
  const value = query.get(name);
  if (!value) return null;
  const parts = value.split(',').map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? new THREE.Vector3().fromArray(parts) : null;
};

help.textContent =
  'orbit: drag / wheel    keys 1-9,0: emoji\n' +
  'flags: ?noleaves ?nograss ?nocables ?nosmoke ?nowaterfalls ?nobutterflies ?nobirds ?noemojis ?nowater ?mainvfx';

const app = new WebGLApp();
app.resize();
if (query.has('noshadow')) app.renderer.shadowMap.enabled = false;

const camera = new THREE.PerspectiveCamera(45, app.width / app.height, 0.2, 175);
const geometryLoader = new GeometryLoader();
const textureLoader = new TextureLoader(app.renderer);

const loadTexture = (name, mode) => textureLoader.load(name, mode);
const [palette, noise, noiseTerrain, eye, eyeCharacter, mouth, clouds, waterNoise, lut] = await Promise.all([
  loadTexture('atlas.png', 'srgb-nearest'),
  loadTexture('noise-simplex-layered-pixellated-highq.ktx2', 'linearfilter-repeat'),
  loadTexture('noises-terrain.ktx2', 'linearfilter-repeat'),
  loadTexture('eye-highq.ktx2', 'repeat'),
  loadTexture('mainchar-eye-highq.ktx2', 'repeat'),
  loadTexture('mouth-highq.ktx2', 'repeat'),
  loadTexture('clouds_noise_512.ktx2', 'srgb-repeat'),
  loadTexture('water-noises-highq.ktx2', 'linearfilter-repeat'),
  loadTexture('lut.ktx2', 'luttetrahedral'),
]);
const textures = { palette, noise, noiseTerrain, eye, eyeCharacter, mouth, clouds, waterNoise, lut };
const shared = createSharedUniforms(textures);

const spawnIndex = Number(query.get('spawn') ?? 1) % SPAWNS.length;
const spawn = SPAWNS[spawnIndex];
const present = new PresentScene({
  app,
  camera,
  textures,
  shared,
  geometryLoader,
  spawnIndex,
});

log('loading terrain + water…');
const started = performance.now();
await present.load();
log(`scene ready in ${(performance.now() - started) | 0} ms`);

const at = vectorFromParam('at') ?? new THREE.Vector3().fromArray(spawn.position);
const up = at.clone().normalize();
const tangent = new THREE.Vector3(0, 0, 1).cross(up).normalize();
const forward = tangent.clone().cross(up).normalize();

const playerObject = new THREE.Object3D();
playerObject.position.copy(at);
playerObject.up.copy(up);
playerObject.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), forward, up));

const character = {
  position: at.clone(),
  up: up.clone(),
  velocity: new THREE.Vector3(),
  velocityHorizontal: new THREE.Vector3(),
  rotationHorizontal: 0,
  object: playerObject,
  update() {},
};
present.attachPlayer(character);

const pipeline = app.createPipeline(camera);
pipeline.setLut(lut);
pipeline.setOutlineTuning(OUTLINE);
app.onResize((width, height) => {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  present.resize(width, height);
});

log('loading world extras…');
const extrasStarted = performance.now();
const extras = new WorldExtras({
  app,
  scene: present.scene,
  geometryLoader,
  textureLoader,
  camera,
  character,
});
await extras.load();
log(`extras ready in ${(performance.now() - extrasStarted) | 0} ms`);

const waterVfxInMainScene = query.has('mainvfx');
if (waterVfxInMainScene) {
  extras.waterfalls.setSceneTextures(pipeline.mrt.textures[0], pipeline.mrt.textures[1]);
} else {
  for (const mesh of extras.waterMeshes) present.water.scene.add(mesh);
  extras.waterfalls.object().visible = false;
  const waterRender = present.water.render.bind(present.water);
  present.water.render = (depthTexture, colorTexture, infoTexture) => {
    extras.setWaterSceneTextures(colorTexture, infoTexture);
    waterRender(depthTexture, colorTexture, infoTexture);
  };
}

const TOGGLES = {
  noleaves: 'leaves',
  nograss: 'grass',
  nocables: 'cables',
  nosmoke: 'smoke',
  nowaterfalls: 'waterfalls',
  nobutterflies: 'butterflies',
  nobirds: 'birds',
  noemojis: 'emojis',
};
for (const [flag, system] of Object.entries(TOGGLES)) {
  if (query.has(flag)) extras.setVisible(system, false);
}
const hideWater = query.has('nowater');

const focus = at.clone();
const back = Number(query.get('back') ?? 6.5);
const height = Number(query.get('h') ?? 2.6);
camera.baseTarget = focus.clone();
camera.position.copy(focus).addScaledVector(up, height).addScaledVector(tangent, back);
camera.lookAt(focus);

const controls = new OrbitControls(camera, app.renderer.domElement);
controls.target.copy(focus);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.minDistance = 1;
controls.maxDistance = 120;
controls.update();

window.addEventListener('keydown', (event) => {
  const digit = Number.parseInt(event.key, 10);
  if (Number.isFinite(digit) && digit >= 0 && digit <= 9) {
    extras.emojis.spawnAboveCharacter(character, (digit + 9) % 10);
  }
});
let emojiTimer = 0;

const simulate = query.has('t') ? Number(query.get('t')) : null;
let plotTime = simulate ?? 0;
let lastHudUpdate = 0;

ticker.on('prerender', () => {
  if (simulate === null) {
    plotTime = ticker.time;
  } else {
    plotTime = simulate;
  }
  shared.uTime.value = plotTime;

  controls.update();
  camera.baseTarget = controls.target;
  camera.basePosition = camera.position;
  present.focus.copy(controls.target);
  character.position.copy(controls.target);
  character.object.position.copy(controls.target);
  character.up.copy(controls.target).normalize();

  present.update(plotTime, ticker.delta);
  extras.update(plotTime, ticker.delta, character);

  if (query.has('emojis')) {
    emojiTimer += ticker.delta;
    if (emojiTimer > 1.2) {
      emojiTimer = 0;
      extras.emojis.spawnAboveCharacter(character);
    }
  }
});

ticker.on('render', () => {
  present.render(pipeline);
  if (hideWater) pipeline.setWaterTexture(null);

  if (ticker.time - lastHudUpdate > 0.25) {
    lastHudUpdate = ticker.time;
    const stats = extras.stats();
    const lines = [
      `calls ${app.renderer.info.render.calls} tris ${app.renderer.info.render.triangles} ` +
        `fps ${ticker.averageFPS.toFixed(0)}`,
      ...Object.entries(stats).map(([name, s]) => {
        if ('active' in s) return `${name.padEnd(12)} tris ${Math.round(s.triangles)} active ${s.active}/${s.capacity}`;
        return `${name.padEnd(12)} tris ${Math.round(s.triangles)} visible ${s.visible}/${s.total}`;
      }),
    ];
    hud.textContent = lines.join('\n');
  }
});

ticker.start();

window.__lab = { app, camera, present, pipeline, controls, extras, character, THREE };
