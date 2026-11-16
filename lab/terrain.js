import * as THREE from 'three';
import { GeometryLoader } from '../src/assets/GeometryLoader.js';

import { ticker } from '../src/core/Ticker.js';
import { WebGLApp } from '../src/graphics/WebGLApp.js';
import { loadRendererTextures } from '../src/graphics/Textures.js';
import { createPainterlyMaterial, createSharedUniforms } from '../src/graphics/PainterlyMaterial.js';
import { Terrain } from '../src/world/Terrain.js';
import { Sky } from '../src/world/Sky.js';
import { Water } from '../src/world/Water.js';
import { COLORS, SHADOW } from '../src/graphics/constants.js';

const hud = document.getElementById('hud');
const log = (...args) => {
  hud.textContent += '\n' + args.join(' ');
  console.log(...args);
};

const app = new WebGLApp();
app.resize();

const scene = new THREE.Scene();

scene.background = new THREE.Color(COLORS.fogNear);

const labQuery = new URLSearchParams(location.search);
const orbitRadius = Number(labQuery.get('r') || 95);
const orbitElevation = Number(labQuery.get('el') || 0.42);
const orbitAzimuth = Number(labQuery.get('az') || -0.65);

let water = null;

const camera = new THREE.PerspectiveCamera(45, 1, 0.2, 175);
if (labQuery.get('view') === 'surface') {

  const start = new THREE.Vector3(13.93, 19.31, 8.38);
  const up = start.clone().normalize();
  camera.position.copy(start).addScaledVector(up, 8).addScaledVector(new THREE.Vector3(1, 0, 1).normalize(), -6);
  camera.lookAt(start);
} else {
  camera.position.set(
    orbitRadius * Math.cos(orbitElevation) * Math.sin(orbitAzimuth),
    orbitRadius * Math.sin(orbitElevation),
    orbitRadius * Math.cos(orbitElevation) * Math.cos(orbitAzimuth),
  );
  camera.lookAt(0, 0, 0);
}

app.onResize((w, h) => {
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  water?.setSize(w, h);
});

const pipeline = app.createPipeline(camera);

const textures = await loadRendererTextures(app.renderer);
pipeline.setLut(textures.lut);

if (labQuery.has('nofog')) {

  textures.palette && null;
}
const shared = createSharedUniforms(textures);
if (labQuery.has('nofog')) shared.uFogDensity.value = 0;
const terrainMaterial = createPainterlyMaterial({ kind: 'terrain', shared });

const sun = new THREE.DirectionalLight(COLORS.lightColor, 3);
sun.position.set(-41.6, 80.9, 41.6).normalize().multiplyScalar(100);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 60;
sun.shadow.camera.far = 140;
sun.shadow.bias = SHADOW.bias;
sun.shadow.normalBias = SHADOW.normalBias;
scene.add(sun);
scene.add(sun.target);

const geometryLoader = new GeometryLoader();
const loadGeometry = (name) => geometryLoader.load(name);

const sky = new Sky(scene, textures.clouds);
sky.setResolution(app.resolution.x, app.resolution.y);
app.onResize((w, h) => sky.setResolution(w, h));

water = new Water({
  renderer: app.renderer,
  loadGeometry,
  noiseTexture: textures.waterNoise,
  sceneCamera: camera,
});
await water.load();
log('water ready');

const terrain = new Terrain({ scene, loadGeometry, material: terrainMaterial });
log('loading terrain…');
const started = performance.now();
await terrain.load();
log(`terrain ready in ${(performance.now() - started) | 0} ms`);

let characterPosition = new THREE.Vector3(13.93, 19.31, 8.38);

const fakeCharacter = { object: new THREE.Object3D() };
fakeCharacter.object.up.set(0, 1, 0);
fakeCharacter.object.rotationHorizontal = 0;

ticker.on('prerender', () => {
  shared.uTime.value = ticker.time;
  camera.updateMatrixWorld();
  terrain.update(camera, characterPosition);
  water.update(ticker.time, camera);
  sky.update(ticker.time, fakeCharacter);
});
ticker.on('render', () => {
  pipeline.render(scene, camera, water);
  hud.textContent = `calls ${app.renderer.info.render.calls}  tris ${app.renderer.info.render.triangles}`;
});
ticker.start();

const query = new URLSearchParams(location.search);
pipeline.setDebug({ surfaceId: query.has('surface'), outline: query.has('outline') });
if (query.has('nolut')) pipeline.compositeMaterial.uniforms.uLUTIntensity.value = 0;
if (query.has('nooutline')) pipeline.compositeMaterial.uniforms.uOutlineEnabled.value = 0;

window.__lab = { scene, camera, app, terrain, pipeline, THREE };
