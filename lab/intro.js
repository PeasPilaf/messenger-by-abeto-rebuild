import * as THREE from 'three';

import { ticker } from '../src/core/Ticker.js';
import { WebGLApp } from '../src/graphics/WebGLApp.js';
import { loadRendererTextures } from '../src/graphics/Textures.js';
import { createSharedUniforms } from '../src/graphics/PainterlyMaterial.js';
import { GlyphLoader } from '../src/text/GlyphLoader.js';
import { GeometryLoader } from '../src/assets/GeometryLoader.js';
import { IntroScene } from '../src/intro/IntroScene.js';

const query = new URLSearchParams(location.search);
const still = query.has('still');
const startAt = query.has('t') ? Math.max(0, Number(query.get('t')) || 0) : 0;

const outAt = query.has('out') ? Math.max(0, Number(query.get('out')) || 0) : 0;

const errors = [];
window.addEventListener('error', (event) => errors.push(String(event.message)));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));

const hud = document.getElementById('hud');
const loading = document.getElementById('loading');

if (still || query.has('clean')) hud.style.display = 'none';
const log = (message) => {
  hud.textContent = message;
  console.log(message);
};

const app = new WebGLApp();
app.geometryLoader = new GeometryLoader();
const glyphLoader = new GlyphLoader();

const textures = await loadRendererTextures(app.renderer);
const shared = createSharedUniforms(textures);
const pipeline = app.createPipeline(new THREE.PerspectiveCamera(45, 1, 2, 1000));
pipeline.setLut(textures.lut);

if (query.has('nolut')) pipeline.compositeMaterial.uniforms.uLUTIntensity.value = 0;
if (query.has('nooutline')) pipeline.compositeMaterial.uniforms.uOutlineEnabled.value = 0;
if (query.has('surface') || query.has('outline')) {
  pipeline.setDebug({ surfaceId: query.has('surface'), outline: query.has('outline') });
}

function createWipeOverlay() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uWipe1: { value: 1 },
      uWipe2: { value: 0 },
    },
    vertexShader:  `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }`,
    fragmentShader:  `
      uniform float uWipe1;
      uniform float uWipe2;
      varying vec2 vUv;

      float falloff(float value, float start, float end, float margin, float progress) {
        float m = margin * sign(end - start);
        float p = mix(start - m, end, progress);
        return clamp((value - (p + m)) / (p - (p + m)), 0.0, 1.0);
      }

      void main() {
        float inclination1 = 0.3 * uWipe1;
        float uv1 = vUv.y - (1.0 - vUv.x) * inclination1;
        float wipe1 = falloff(uv1, 1.0, -inclination1, 1e-6, uWipe1);

        float inclination2 = 0.3 * (1.0 - uWipe2);
        float uv2 = vUv.y - vUv.x * inclination2;
        float wipe2 = falloff(uv2, -inclination2, 1.0, 1e-6, uWipe2);

        float alpha = max(wipe1, wipe2);
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { scene, camera, material };
}

const overlay = createWipeOverlay();
pipeline.setOverlay(overlay);

function createInfoOverlay() {
  const material = new THREE.ShaderMaterial({
    uniforms: { tInfo: { value: pipeline.mrt.textures[1] }, uMode: { value: query.has('info') ? 1 : 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tInfo; uniform float uMode; varying vec2 vUv;
      void main() {
        vec4 info = texture2D(tInfo, vUv);
        if (uMode < 1.5) gl_FragColor = vec4(info.a, info.a, info.a, 1.0);
        else gl_FragColor = vec4(info.r, info.g * 0.5 + 0.5, info.b * 0.5 + 0.5, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
}
const infoOverlay = createInfoOverlay();
if (query.has('info')) pipeline.setOverlay(infoOverlay);

let intro = null;

async function createIntro({ jump = 0 } = {}) {
  const scene = new IntroScene({ app, textures, shared, glyphLoader });
  await scene.load();
  scene.applyOutlineTuning(pipeline);
  pipeline.setCamera(scene.camera);

  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 450);

  if (jump > 0) {

    scene.playIn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const step = 1 / 60;
    for (let time = 0; time < jump; time += step) scene.update(time, step);
  }

  intro = scene;
  return scene;
}

function frame() {
  if (!intro) return;
  intro.update(ticker.time - frameStart, ticker.delta);
  overlay.material.uniforms.uWipe1.value = intro.wipe.value;
  app.render(intro.scene, intro.camera);
  hud.textContent = [
    `intro  t=${(ticker.time - frameStart).toFixed(2)}s`,
    `calls ${app.renderer.info.render.calls}  tris ${app.renderer.info.render.triangles}`,
    `wipe ${intro.wipe.value.toFixed(2)}  interact ${intro.interactionsEnabled}`,
  ].join('\n');
}

let frameStart = 0;

function wireBegin(scene) {
  scene.on('begin', async () => {
    log('BEGIN pressed — playing the out animation…');
    await scene.playOut();
    const previous = scene;
    log('rebuilding the intro…');
    const next = await createIntro();
    previous.dispose();
    frameStart = ticker.time;
    wireBegin(next);
    next.playIn();
    log('intro restarted');
  });
}

intro = await createIntro({ jump: still ? startAt || 6 : startAt });
wireBegin(intro);

if (still) {

  if (outAt > 0) {
    intro.disableInteractions();
    intro.playOut();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const step = 1 / 60;
    for (let time = 0; time < outAt; time += step) intro.update(startAt + time, step);
    overlay.material.uniforms.uWipe1.value = 0;
  }
  overlay.material.uniforms.uWipe1.value = intro.wipe.value;
  app.render(intro.scene, intro.camera);
  log(`still frame rendered at t=${(startAt || 6).toFixed(2)}s`);
} else if (query.has('drive')) {

  let simTime = 0;
  let last = performance.now();
  let clicked = false;
  frameStart = 0;
  intro.playIn();
  const timerFrame = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    simTime += dt;
    intro.update(simTime, dt);
    overlay.material.uniforms.uWipe1.value = intro.wipe.value;
    app.render(intro.scene, intro.camera);
    hud.textContent = `intro t=${simTime.toFixed(2)}s  interact ${intro.interactionsEnabled}`;
    if (query.has('click') && !clicked && simTime > 4.2 && intro.interactionsEnabled) {
      clicked = true;
      const canvas = app.renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width * 0.5;
      const y = rect.top + rect.height * 0.8625;
      const base = { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', bubbles: true };
      canvas.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 0 }));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, button: 0, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, button: 0, buttons: 0 }));
    }
    setTimeout(timerFrame, 16);
  };
  setTimeout(timerFrame, 16);
} else {
  frameStart = ticker.time;
  const playing = intro.playIn();
  ticker.on('render', frame);
  ticker.start();

  if (query.has('click')) {
    playing.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const canvas = app.renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width * 0.5;
      const y = rect.top + rect.height * 0.8625;
      const base = { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', bubbles: true };
      canvas.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 0 }));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, button: 0, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, button: 0, buttons: 0 }));
    });
  }
}

window.__intro = {
  THREE,
  app,
  textures,
  shared,
  glyphLoader,
  pipeline,
  intro,
  overlay,
  errors,
  status: () => ({ ready: intro.loaded, errors, time: ticker.time - frameStart }),
};
window.__introReady = true;
