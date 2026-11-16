import {
  BoxGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { GlyphLoader } from '../src/text/GlyphLoader.js';
import { TextureLoader } from '../src/assets/TextureLoader.js';
import { UiLayer } from '../src/ui/UiLayer.js';
import { forceTypewriterEnd } from '../src/ui/UiText.js';
import { events } from '../src/core/Events.js';

const canvas = document.getElementById('stage');
const errors = [];
window.__uiErrors = errors;
window.addEventListener('error', (event) => errors.push(String(event.message)));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));

const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = SRGBColorSpace;

const world = new Scene();
world.background = new Color('#8fbfc9');
const worldCamera = new PerspectiveCamera(45, 1, 0.2, 200);
worldCamera.position.set(0, 2.2, 7);
worldCamera.lookAt(0, 0.9, 0);

world.add(new HemisphereLight('#cfe8ea', '#6d7a6b', 1.6));
const sun = new DirectionalLight('#fff4e0', 2.2);
sun.position.set(3, 6, 4);
world.add(sun);

const ground = new Mesh(
  new PlaneGeometry(60, 60),
  new MeshStandardMaterial({ color: '#a7a58f', roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
world.add(ground);

const blocks = [
  ['#c25959', -2.6, 0.7, -1.2, 1.2, 1.4, 1.0],
  ['#8cc48c', 2.2, 0.55, -2.4, 1.6, 1.1, 1.2],
  ['#de794e', 0.2, 0.4, -4.2, 2.4, 0.8, 0.9],
  ['#66BDE6', -4.4, 0.35, -3.4, 0.9, 0.7, 0.9],
];
for (const [color, x, y, z, w, h, d] of blocks) {
  const box = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  box.position.set(x, y, z);
  world.add(box);
}

const glyphs = new GlyphLoader();
const textureLoader = new TextureLoader(renderer);
const app = { renderer, resolution: { x: 1, y: 1 } };
const ui = new UiLayer({ glyphs, textureLoader, app });
window.__uiLayer = ui;

const withLetters = 'MESSENGER';
const dialogueLine = "I'VE GOT FIVE ON THE LIST. HOPEFULLY THEY'RE EASY TO FIND.";
const questCard = {
  title: 'Package Received',
  text: "TAKE THE BOSS'S NOTE TO THE OFFICE WORKER IN THE MAIN SQUARE",
  icon: 'ui/quests/house.icon',
  color: '#c25959',
  isComplete: false,
};
const checklistEntries = [
  { text: 'Falling off the corporate ladder', done: 2, total: 3 },
  { text: "A man who's hiding from something", done: 0, total: 3 },
  { text: 'Scientists and mixed-up deliveries', done: 3, total: 3 },
  { text: 'An offering to the mountain temple', done: 1, total: 2 },
  { text: 'A note lost at sea', done: 0, total: 2 },
];

async function setState(name) {
  ui.dialogue.hideFinal();
  ui.questCard.hide();
  ui.checklist.hide();
  ui.emotePanel.hide();
  ui.zoneTitles.hideAll();
  ui.endScreen.hide();
  ui.setSideButtonsVisible(false);
  state = name;

  await new Promise((resolve) => setTimeout(resolve, 80));

  switch (name) {
    case 'dialogue':
      await ui.showDialogue({ id: 'lab-npc', text: dialogueLine, name: withLetters, color: '#66BDE6' });
      break;
    case 'dialogue2':
      await ui.showDialogue({ id: 'lab-npc', text: 'THANKS! I KNEW I COULD COUNT ON YOU.', name: withLetters, color: '#66BDE6' });
      break;
    case 'sidebuttons':
      ui.setSideButtonsVisible(true);
      break;
    case 'checklist':
      ui.setSideButtonsVisible(true);
      await ui.showChecklist(checklistEntries);
      break;
    case 'emotes':
      ui.setSideButtonsVisible(true);
      ui.emotePanel.show();
      break;
    case 'questcard':
      ui.setSideButtonsVisible(true);

      await ui.questCard.show(questCard);
      break;
    case 'questcard-complete':
      ui.setSideButtonsVisible(true);
      await ui.questCard.show({ ...questCard, title: 'Completed', icon: 'ui/quests/complete.icon', isComplete: true, color: '#8cc48c' });
      break;
    case 'zone':
      await ui.showZoneTitle('Lucero Graveyard');
      break;
    case 'endscreen':
      await ui.showEndScreen();
      break;
    default:
      break;
  }
  return name;
}
let state = 'empty';

function renderScene() {
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(world, worldCamera);
  renderer.autoClear = false;
  renderer.render(ui.overlay.scene, ui.overlay.camera);
  renderer.autoClear = true;
}

function settle(seconds = 4) {
  const step = 1 / 30;
  const start = performance.now() / 1000;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    ui.update(start + elapsed, step, false);
  }
  for (const mesh of [ui.dialogue.bodyText, ui.questCard.bodyText]) {
    if (mesh && mesh.material.uniforms.uShow.value < 1) forceTypewriterEnd(mesh);
  }
  ui.update(start + seconds, 0, true);
  renderScene();
}

window.__ui = {
  state: setState,
  settle,
  current: () => state,
  ui,
  showDialogue: (payload) => ui.showDialogue(payload),
  advance: () => ui.advanceDialogue(),
  hideDialogue: () => ui.hideDialogue(),
  showChecklist: () => ui.showChecklist(checklistEntries),
  showEmotes: () => ui.setEmotePanelOpen(true),
  showZone: (text) => ui.showZoneTitle(text),
  showEnd: () => ui.showEndScreen(),
  showSideButtons: () => ui.setSideButtonsVisible(true),
};

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  app.resolution = { x: renderer.domElement.width, y: renderer.domElement.height };
  worldCamera.aspect = width / height;
  worldCamera.updateProjectionMatrix();
  ui.resize(width, height);
}
window.addEventListener('resize', resize);

canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  ui.handlePointerDown(event.clientX - rect.left, event.clientY - rect.top);
});
canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  ui.handlePointerMove(event.clientX - rect.left, event.clientY - rect.top);
});
canvas.addEventListener('pointerup', (event) => {
  const rect = canvas.getBoundingClientRect();
  ui.handlePointerUp(event.clientX - rect.left, event.clientY - rect.top);
});

const LAB_KEYS = {
  Digit1: 'dialogue', Digit2: 'questcard', Digit3: 'checklist',
  Digit4: 'sidebuttons', Digit5: 'emotes', Digit6: 'zone',
  Digit7: 'endscreen', Digit0: 'empty',
};
window.addEventListener('keydown', (event) => {
  const next = LAB_KEYS[event.code];
  if (next) setState(next);
  if (event.code === 'Digit2' && event.shiftKey) setState('questcard-complete');
  if (event.code === 'Digit1' && event.shiftKey) setState('dialogue2');
  if (event.code === 'KeyR') setState('empty');
});

canvas.addEventListener('pointerenter', (event) => {
  const rect = canvas.getBoundingClientRect();
  ui.handlePointerMove(event.clientX - rect.left, event.clientY - rect.top);
});

const keys = new URLSearchParams(location.search);
const startState = keys.get('state');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  ui.update(now / 1000, dt);
  renderScene();

  if (!window.__uiReady) {
    window.__uiReady = true;
    setState(startState || 'dialogue');
  }
  requestAnimationFrame(frame);
}

ui.load()
  .then(() => {
    resize();
    if (keys.get('state')) state = keys.get('state');
    window.__uiLoaded = true;
    requestAnimationFrame(frame);
  })
  .catch((error) => {
    errors.push(String((error && error.stack) || error));
    console.error('UI lab failed', error);
  });

window.__webgl = { events };
