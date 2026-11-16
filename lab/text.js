import {
  WebGLRenderer, Scene, OrthographicCamera, WebGLRenderTarget, HalfFloatType,
  Mesh, PlaneGeometry, ShaderMaterial, LinearSRGBColorSpace, Color, DoubleSide, Vector2,
} from 'three';
import { GlyphLoader } from '../src/text/GlyphLoader.js';
import { SlugMaterial } from '../src/text/SlugMaterial.js';
import { TextMesh } from '../src/text/TextMesh.js';

const errors = [];
window.__glyphErrors = errors;
window.addEventListener('error', (event) => errors.push(String(event.message)));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));

const canvas = document.getElementById('stage');
const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(1);

const scene = new Scene();
const camera = new OrthographicCamera(0, 1, 1, 0, -100, 100);

const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
target.texture.colorSpace = LinearSRGBColorSpace;

const glyphs = new GlyphLoader();

function flatQuad(color) {
  const material = new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) } },
    vertexShader:  `
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader:  `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  scene.add(mesh);
  return mesh;
}

function setQuad(mesh, color, width, height, x, y) {
  if (!mesh) return;
  mesh.material.uniforms.uColor.value.set(color);
  mesh.scale.set(width, height, 1);
  mesh.position.set(x, y, -1);
}

let title;
let dialogue;
let begin;
let panel;
let panelShadow;
const icons = [];

async function build() {

  title = new TextMesh({
    glyphs,
    font: 'heading',
    text: 'MESSENGER',
    anchor: 'center',
    textOptions: {
      size: 1,
      maxWidth: 20,
      letterSpacing: 0.01,
      lineHeight: 1.1,
      color: '#F8F8F8',
      align: 'center',
      shadow: true,
      shadowX: 0.06,

      shadowY: -0.06,
      shadowColor: '#7A5E0D',
    },
  });
  await title.ready;
  scene.add(title);

  dialogue = new TextMesh({
    glyphs,
    font: 'UglyDave-Alternates-optimized',
    text: 'I WAS WONDERING IF YOU WOULD MIND DELIVERING THIS LETTER TO MY BROTHER.',
    anchor: 'top-left',
    textOptions: {
      size: 1,
      maxWidth: 27,
      letterSpacing: -0.05,
      lineHeight: 1.1,
      color: '#0f0f0f',
      align: 'left',
    },
  });
  await dialogue.ready;
  scene.add(dialogue);

  begin = new TextMesh({
    glyphs,
    font: 'planet',
    text: 'BEGIN',
    anchor: 'center',
    textOptions: {
      size: 1,
      maxWidth: 5,
      letterSpacing: -0.05,
      lineHeight: 0.8,
      color: '#F8F8F8',
      align: 'left',
      shadow: true,
      shadowX: 0.04,
      shadowY: -0.04,
      shadowColor: '#647A87',
    },
  });
  await begin.ready;
  scene.add(begin);

  const pictures = [
    ['ui/arrow', null],
    ['ui/cross', null],
    ['ui/quests/house', null],
    ['ui/emojis/0', '#20242b'],
  ];
  for (const [name, tint] of pictures) {
    const { geometry, font } = await glyphs.buildPicture(name, { size: 1 });
    const material = new SlugMaterial({ font, reveal: false });
    if (tint) material.setOverwriteColor(tint);
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);
    icons.push(mesh);
  }

  panelShadow = flatQuad('#647A87');
  panelShadow.renderOrder = -1;
  panel = flatQuad('#F8F8F8');

  layout();
  resize();

  const cps = Number(new URLSearchParams(location.search).get('cps')) || 35;
  dialogue.typewriter({ charsPerSecond: cps });

  run();
  window.__glyphScene = scene;
  window.__glyphReady = true;
  window.__glyphDebug = {
    fonts: ['heading', 'UglyDave-Alternates-optimized', 'planet'],
    texts: [title, dialogue, begin].filter(Boolean).map((mesh) => ({
      text: mesh.text,
      quads: mesh.geometry.index ? mesh.geometry.index.count / 6 : 0,
      attributes: Object.keys(mesh.geometry.attributes).sort(),
      metrics: mesh.metrics,
      bounds: mesh.bounds,
    })),
    pictures: icons.map((mesh) => ({
      quads: mesh.geometry.index ? mesh.geometry.index.count / 6 : 0,
      bounds: mesh.geometry._bounds,
    })),
    resolution: [renderer.domElement.width, renderer.domElement.height],
    meshes: scene.children.map((child) => ({
      name: child.name,
      visible: child.visible,
      position: child.position.toArray(),
      scale: child.scale.toArray(),
      material: child.material && child.material.name,
      uniforms: child.material && child.material.uniforms ? {
        uShow: child.material.uniforms.uShow?.value,
        uHide: child.material.uniforms.uHide?.value,
        uReveal: child.material.uniforms.uReveal?.value,
        uResolution: child.material.uniforms.uResolution?.value?.toArray(),
      } : null,
      draw: child.geometry && child.geometry.index ? child.geometry.index.count : 0,
    })),
  };
}

function layout() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const unit = height / 800;

  setQuad(panel, '#F8F8F8', 960 * unit, 148 * unit, width / 2, height * 0.46);
  setQuad(panelShadow, '#647A87', 960 * unit, 148 * unit, width / 2 + 7 * unit, height * 0.46 - 7 * unit);

  if (title) {
    title.scale.setScalar(96 * unit);
    title.position.set(width / 2, height - 120 * unit, 0);
  }
  if (dialogue) {
    dialogue.scale.setScalar(30 * unit);
    dialogue.position.set(width / 2 - 420 * unit, height * 0.46 + 45 * unit, 0);
  }
  if (begin) {
    begin.scale.setScalar(74 * unit);
    begin.position.set(width * 0.2, 150 * unit, 0);
  }

  const iconSize = 72 * unit;
  icons.forEach((mesh, i) => {
    mesh.scale.setScalar(iconSize);
    mesh.position.set(width * 0.55 + i * 110 * unit, 150 * unit, 0.2);
  });
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.left = 0;
  camera.right = width;
  camera.top = height;
  camera.bottom = 0;
  camera.updateProjectionMatrix();
  target.setSize(width, height);

  const resolution = renderer.getDrawingBufferSize(new Vector2());
  scene.traverse((object) => {
    const material = object.material;
    if (material && material.setResolution) material.setResolution(resolution.width, resolution.height);
  });
}
window.addEventListener('resize', () => {
  resize();
  layout();
});

const blitMaterial = new ShaderMaterial({
  uniforms: { tSource: { value: target.texture } },
  vertexShader:  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader:  `
    uniform sampler2D tSource;
    varying vec2 vUv;
    vec3 toSRGB(vec3 c) {
      vec3 low = c * 12.92;
      vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
      return mix(high, low, step(c, vec3(0.0031308)));
    }
    void main() {
      gl_FragColor = vec4(toSRGB(texture2D(tSource, vUv).rgb), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});

const blitScene = new Scene();
const blitCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const blitQuad = new Mesh(new PlaneGeometry(2, 2), blitMaterial);
blitQuad.frustumCulled = false;
blitScene.add(blitQuad);

let running = false;
function run() {
  if (running) return;
  running = true;
  renderer.setClearColor(new Color('#66BDE6'), 1);
  renderer.setAnimationLoop(() => {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(null);
    renderer.render(blitScene, blitCamera);
  });
}

build().catch((error) => {
  errors.push(String((error && error.stack) || error));
  console.error('glyph lab failed', error);
});
