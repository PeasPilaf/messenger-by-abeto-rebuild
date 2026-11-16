import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { ticker } from '../src/core/Ticker.js';
import { events } from '../src/core/Events.js';
import { WebGLApp } from '../src/graphics/WebGLApp.js';
import { loadRendererTextures } from '../src/graphics/Textures.js';
import { createPainterlyMaterial, createSharedUniforms } from '../src/graphics/PainterlyMaterial.js';
import { OUTLINE } from '../src/graphics/constants.js';
import { GeometryLoader } from '../src/assets/GeometryLoader.js';
import { GlyphLoader } from '../src/text/GlyphLoader.js';
import { PresentScene, SPAWNS } from '../src/game/PresentScene.js';
import { NpcManager } from '../src/gameplay/npc/NpcManager.js';
import { QuestSystem } from '../src/gameplay/quest/QuestSystem.js';
import { RewardProp } from '../src/gameplay/quest/RewardProp.js';
import { SaveStore, SAVE_KEY } from '../src/gameplay/quest/SaveStore.js';
import { QUESTS } from '../src/gameplay/quest/QuestData.js';

const hud = document.getElementById('hud');
const query = new URLSearchParams(location.search);
const log = (line) => { console.log(line); };

if (query.has('fresh')) localStorage.removeItem(SAVE_KEY);

const app = new WebGLApp();
app.resize();

const camera = new THREE.PerspectiveCamera(45, app.width / app.height, 0.2, 175);
const geometryLoader = new GeometryLoader();
const glyphs = new GlyphLoader();

const textures = await loadRendererTextures(app.renderer);
const shared = createSharedUniforms(textures);

const present = new PresentScene({
  app,
  camera,
  textures,
  shared,
  geometryLoader,
  spawnIndex: Number(query.get('spawn') ?? 1),
});
await present.load();

const pipeline = app.createPipeline(camera);
pipeline.setLut(textures.lut);
pipeline.setOutlineTuning(OUTLINE);

app.onResize((width, height) => {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  present.resize(width, height);
  if (typeof npcs !== 'undefined') npcs.setResolution(width, height);
});

const proxyBody = new THREE.Object3D();
proxyBody.name = 'proxy-player';
const capsuleGeometry = new THREE.CapsuleGeometry(0.32, 0.95, 8, 16);
capsuleGeometry.setAttribute(
  'surfaceId',
  new THREE.BufferAttribute(new Float32Array(capsuleGeometry.attributes.position.count), 1),
);
const capsuleMaterial = createPainterlyMaterial({ kind: 'object', shared });
capsuleMaterial.uniforms.diffuse.value = new THREE.Color('#c25959');
const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
capsule.castShadow = true;
capsule.receiveShadow = true;
proxyBody.add(capsule);

const proxy = {
  object: proxyBody,
  position: proxyBody.position,
  up: new THREE.Vector3(0, 1, 0),
  quaternion: proxyBody.quaternion,
  rotationHorizontal: 0,
  radius: 0,
  setPosition(feet) {
    this.up.copy(feet).normalize();
    this.radius = Math.max(1e-3, feet.length());
    this.position.copy(feet).addScaledVector(this.up, 0.9);
    this.rotationHorizontal = Math.atan2(this.up.x, this.up.z);
  },
  update(time, delta) {
    const speed = 3.4;
    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.addScaledVector(this.up, -forward.dot(this.up)).normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.up).normalize();
    const move = new THREE.Vector3();
    if (keys.has('KeyW')) move.add(forward);
    if (keys.has('KeyS')) move.sub(forward);
    if (keys.has('KeyD')) move.add(right);
    if (keys.has('KeyA')) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * delta);
      this.position.add(move);
      followProxy = true;
    }

    this.up.copy(this.position).normalize();
    this.position.copy(this.up).multiplyScalar(this.radius);
    this.position.addScaledVector(this.up, 0.9);
    proxyBody.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.up);
  },
};
const spawn = SPAWNS[present.spawnIndex];
proxy.setPosition(new THREE.Vector3().fromArray(spawn.position));
present.attachPlayer(proxy);

const npcs = new NpcManager({
  scene: present.scene,
  camera,
  geometryLoader,
  glyphs,
  shared,
});
log('loading 20 NPCs…');
await npcs.load();
npcs.setPlayer(proxy);
npcs.setResolution(app.width, app.height);
log(`NPCs ready: ${npcs.npcs.length}`);

const reward = new RewardProp({
  scene: present.scene,
  geometryLoader,
  shared,
  player: proxy,
});
await reward.load();

const saveStore = new SaveStore();
const quests = new QuestSystem({ npcs, saveStore });

camera.up.copy(proxy.up);
const controls = new OrbitControls(camera, app.renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 1.5;
controls.maxDistance = 40;
controls.target.copy(proxy.position);
camera.position.copy(proxy.position).addScaledVector(proxy.up, 1.2).addScaledVector(
  new THREE.Vector3(0, 1, 0).cross(proxy.up).normalize(),
  4.5,
);
controls.update();

const keys = new Set();
const QUEST_NPC_IDS = [...new Set(QUESTS.flatMap((quest) => quest.steps.map((step) => step.id)))];
let cycleIndex = 0;
const HS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Escape']);

const dialog = document.getElementById('dialog');
const dialogName = document.getElementById('dialog-name');
const dialogText = document.getElementById('dialog-text');
const dialogHint = document.getElementById('dialog-hint');
let dialogTimer = null;

function hideDialog() {
  dialog.classList.remove('visible');
  if (dialogTimer) clearInterval(dialogTimer);
  dialogTimer = null;
}

events.on('npc_dialog_open', (id, text, extraData) => {
  if (dialogTimer) clearInterval(dialogTimer);
  dialogName.textContent = (extraData?.name ?? 'Unnamed NPC').toUpperCase();
  dialogName.style.background = extraData?.color ?? '#66BDE6';
  dialog.style.borderColor = extraData?.color ?? '#66BDE6';
  dialogText.textContent = '';
  dialogHint.textContent = 'SPACE / E';
  dialog.classList.add('visible');
  const characters = [...String(text ?? '')];
  let shown = 0;
  dialogTimer = setInterval(() => {
    dialogText.textContent = characters.slice(0, ++shown).join('');
    if (shown >= characters.length) { clearInterval(dialogTimer); dialogTimer = null; }
  }, 1000 / 35);
});
events.on('npc_dialog_close', hideDialog);
events.on('npc_dialog_finished', hideDialog);
events.on('npc_dialog_interrupted', hideDialog);

const trace = [];
const TRACED = [
  'npc_dialog_open', 'npc_dialog_close', 'npc_dialog_finished', 'npc_dialog_shown',
  'npc_bubble_show', 'npc_bubble_text_starts', 'npc_bubble_hide', 'npc_bubble_hidden',
  'topicon_change', 'quest_enable_id', 'quest_disable_id', 'quest_step_completed',
  'quest_completed', 'quest_step_check', 'quest_info_checklist_update',
  'quest_box_display_after_step', 'quest_receive_model', 'end_screen_show',
  'webgl_play_audio', 'webgl_play_positional', 'webgl_stop_positional',
];
for (const name of TRACED) events.on(name, (...args) => trace.push({ name, at: ticker.time, args: args.map(describeArg) }));
trace.length = 0;

function describeArg(value) {
  if (value?.isObject3D) return `Object3D(${value.name})`;
  if (value?.id) return value.id;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value).slice(0, 80);
  return value;
}

const ORBIT_TANGENT = new THREE.Vector3(0, 1, 0);

let followProxy = true;

function tangentFor(up) {
  const tangent = new THREE.Vector3().crossVectors(ORBIT_TANGENT, up);
  if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
  return tangent.normalize();
}

function teleportTo(id, { distance = 1.7, view = 3.6, lookHeight = 1.25 } = {}) {
  const actor = npcs.getActor(id);
  if (!actor) throw new Error(`lab: no NPC "${id}"`);
  const npcPosition = actor.mesh.position;
  const up = npcPosition.clone().normalize();
  const tangent = tangentFor(up);

  const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
  proxy.setPosition(npcPosition.clone().addScaledVector(tangent, distance));
  followProxy = false;
  camera.up.copy(up);
  controls.target.copy(npcPosition).addScaledVector(up, lookHeight);
  camera.position
    .copy(controls.target)
    .addScaledVector(up, 0.25)
    .addScaledVector(side, view);
  controls.update();
  camera.updateMatrixWorld();
  return { id, distance: proxy.position.distanceTo(npcPosition) };
}

function clickNpc(id) {
  const actor = npcs.getActor(id);
  const up = actor.mesh.position.clone().normalize();
  const point = actor.mesh.position.clone().addScaledVector(up, 0.9).project(camera);
  const rect = app.renderer.domElement.getBoundingClientRect();
  const clientX = rect.left + (point.x * 0.5 + 0.5) * rect.width;
  const clientY = rect.top + (-point.y * 0.5 + 0.5) * rect.height;
  return Boolean(npcs.handleClick({ clientX, clientY, element: app.renderer.domElement }));
}

async function advanceConversation(max = 60) {
  for (let press = 0; press < max; press++) {
    if (!npcs.interactingElement) return press;

    npcs.handleKey('Space');
    stepFrames(30, 1 / 60);
  }
  return max;
}

async function talkTo(id, { advance = true } = {}) {
  teleportTo(id);
  stepFrames(3);
  const clicked = clickNpc(id);
  stepFrames(6);
  if (advance) await advanceConversation();
  return { id, clicked, interacting: npcs.interactingElement?.id ?? null };
}

async function driveEmployeeRun() {
  const results = [];
  results.push(await talkTo('office-worker-2'));
  results.push(await talkTo('boss'));
  results.push(await talkTo('office-worker-2'));
  stepFrames(30, 1 / 60);
  return results;
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (HS.has(event.code)) {
    keys.add(event.code);
    if (event.code === 'Escape') npcs.handleKey('Escape');
    if (event.code === 'Space' || event.code === 'KeyE' || event.code === 'ArrowRight') {
      npcs.handleKey(event.code);
    }
    event.preventDefault();
  }
  if (event.code === 'BracketRight' || event.code === 'BracketLeft') {
    const step = event.code === 'BracketRight' ? 1 : -1;
    cycleIndex = (cycleIndex + step + QUEST_NPC_IDS.length) % QUEST_NPC_IDS.length;
    teleportTo(QUEST_NPC_IDS[cycleIndex]);
    event.preventDefault();
  }
  if (event.code === 'KeyP') {
    showSave = !showSave;
    event.preventDefault();
  }
  if (event.code === 'KeyT') {
    teleportTo(QUESTS[0].steps[0].id);
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
app.renderer.domElement.addEventListener('pointermove', (event) => {
  const hovering = npcs.handleHover({
    clientX: event.clientX,
    clientY: event.clientY,
    element: app.renderer.domElement,
  });
  app.renderer.domElement.style.cursor = hovering ? 'pointer' : 'default';
});
app.renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  npcs.handleClick({
    clientX: event.clientX,
    clientY: event.clientY,
    element: app.renderer.domElement,
  });
});

function questLine() {
  return QUESTS.map((quest) => {
    const flags = quests.progress[quest.id];
    const done = flags.filter(Boolean).length;
    return `${quest.id.replace('quest-', '')} ${done}/${flags.length}`;
  }).join('  ');
}

let showSave = query.has('hudsave');

function prettySave(json) {
  try {
    return JSON.stringify(JSON.parse(json), null, 1).replace(/\n/g, '\n  ');
  } catch {
    return json;
  }
}

function drawHud() {
  const view = npcs.describe();
  const nearest = view.nearest.map(
    (npc) => `${npc.id} ${npc.distance.toFixed(2)}u${npc.isClose ? ' CLOSE' : ''}${npc.talking ? ' TALKING' : ''} [${npc.mode}]`,
  );
  const save = showSave
    ? [`SAVE ${SAVE_KEY} =`, ...prettySave(quests.saveJSON).split('\n')]
    : [`SAVE ${SAVE_KEY}: ${quests.completedSteps}/${quests.totalSteps} steps (P = full JSON)`];
  hud.textContent = [
    `fps ${ticker.averageFPS.toFixed(0)}  t ${ticker.time.toFixed(1)}s  proxy ${proxy.position.toArray().map((v) => v.toFixed(1)).join(',')}`,
    `interacting: ${view.interacting ?? '—'}   controls ${npcs.interactingElement ? 'locked' : 'free'}`,
    ...nearest,
    `quests: ${questLine()}   steps ${quests.completedSteps}/${quests.totalSteps}`,
    ...save,
    `last events: ${trace.slice(-3).map((e) => `${e.name}@${(e.at ?? 0).toFixed(1)}`).join('  ')}`,
  ].join('\n');
}

function runFrame(delta) {
  shared.uTime.value = ticker.time;

  if (followProxy) controls.target.copy(proxy.position);
  controls.update();
  camera.up.copy(proxy.up);
  camera.baseTarget = controls.target;
  camera.basePosition = camera.position;
  present.update(ticker.time, delta);
  npcs.update(ticker.time, delta, { playerPosition: proxy.position, controlsEnabled: true });
  reward.update(ticker.time, delta, proxy);
}

function stepFrames(count, dt = 1 / 60, render = false) {
  for (let index = 0; index < count; index++) {
    ticker._delta = dt;
    ticker._ratio = dt * 60;
    ticker._time += dt;
    ticker._frame += 1;
    runFrame(dt);
    if (render) present.render(pipeline);
  }
  drawHud();
}

ticker.on('prerender', () => runFrame(ticker.delta));
ticker.on('render', () => {
  present.render(pipeline);
  drawHud();
});
ticker.start();

if (query.get('npc')) {
  teleportTo(query.get('npc'));
}
if (query.get('drive')) {
  log('running scripted employee quest run…');
  const run = await driveEmployeeRun();
  log(JSON.stringify(run));
}

console.log('[npc-lab] ready');
console.log('[npc-lab] save', quests.saveJSON);

window.__lab = {
  ready: true,
  THREE,
  app,
  camera,
  controls,
  present,
  npcs,
  quests,
  reward,
  saveStore,
  proxy,
  trace,
  stepFrames,
  setHudSave: (value) => { showSave = Boolean(value); drawHud(); },
  render: () => present.render(pipeline),
  teleportTo,
  clickNpc,
  advanceConversation,
  talkTo,
  driveEmployeeRun,
  save: () => quests.saveJSON,
  progress: () => quests.describe(),
  describe: () => npcs.describe(),
  events: (name) => trace.filter((entry) => entry.name === name),
  reset: () => {
    localStorage.removeItem(SAVE_KEY);
    return quests.saveJSON;
  },
};
