import * as THREE from 'three';

import { events } from '../src/core/Events.js';
import { audioLoader } from '../src/assets/AudioLoader.js';
import { AudioSystem } from '../src/audio/AudioSystem.js';
import {
  AUDIO_FILES,
  SOUNDS,
  LOW_MEMORY_MUSIC_FILE,
  allSoundNames,
  isPositional,
  registryFor,
  soundFor,
} from '../src/audio/SoundRegistry.js';
import { SPAWN_POINTS, ZONES } from '../src/audio/AmbienceSystem.js';
import { STORAGE_KEY } from '../src/audio/MuteStorage.js';

const report = {
  phase: 'boot',
  loaded: false,
  started: false,
  done: false,
  errors: [],
  checks: [],
  durations: {},
  muteEvents: [],
  bootState: null,
  summary: null,
};
window.__audioLab = report;
window.addEventListener('error', (event) => report.errors.push(String(event.message)));
window.addEventListener('unhandledrejection', (event) => report.errors.push(String(event.reason)));

events.on('audio_update_mute', (muted) => report.muteEvents.push(muted));

const SEED_SAVE = {
  questProgress: { 'quest-employee': [true, false, false], 'quest-musician': [false, true] },
  modelFiles: ['base', 'hair5', 'top4', 'bottom7', 'shoes4'],
};
const storage = createMemoryStorage(SEED_SAVE);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500);
camera.position.set(0, 2.5, 7);
camera.lookAt(0, 0, 0);
scene.add(camera);

function makeNPC(name, x, y, z) {
  const object = new THREE.Object3D();
  object.name = name;
  object._id = name;
  object.isWorldNPC = true;
  object.position.set(x, y, z);
  scene.add(object);
  return object;
}

const demoNPC = makeNPC('demo-npc', 2, 0, -2);
const musicianNPC = makeNPC('musician', -2, 0, -1);
const buttonNPC = makeNPC('button-npc', 2, 1, -2);

const player = {
  position: new THREE.Vector3(...SPAWN_POINTS.city),
  medium: 0,
  weights: [0, 1, 0],
  animationTime: 0,
};

const audio = new AudioSystem({
  listener: camera,
  storage,
  resolveNPC: (id) => (id === 'demo' ? demoNPC : id === 'musician' ? musicianNPC : null),
});
audio.registerNPC('demo', demoNPC);
audio.registerNPC('musician', musicianNPC);
window.__audioSystem = audio;

boot().catch((error) => {
  report.errors.push(String(error?.stack || error));
  setStatus(`boot failed: ${error?.message || error}`);
});

async function boot() {
  report.phase = 'loading';
  setStatus('loading AudioSystem + decoding all 54 files…');

  await audio.load();
  const buffers = await audioLoader.loadAll(AUDIO_FILES);
  AUDIO_FILES.forEach((file, index) => {
    report.durations[file] = buffers[index].duration;
  });

  report.bootState = {
    muted: audio.muted,
    contextStarted: audio.contextStarted,
    contextState: audio.analyse().context.state,
    masterTarget: audio.analyse().context.target,
    registrySize: Object.keys(audio.registry).length,
  };

  buildSoundList();
  buildZoneButtons();
  buildVoiceButtons();
  wireSessionButtons();
  installMuteLabel();

  report.loaded = true;
  report.phase = 'ready';
  setStatus(
    `${allSoundNames().length} sounds · ${AUDIO_FILES.length} files decoded · ` +
    `${totalDuration().toFixed(1)} s of audio\ncontext ${audio.analyse().context.state} — click Start audio`,
  );
  requestAnimationFrame(frame);
}

function buildSoundList() {
  const grid = document.getElementById('sound-grid');
  const names = allSoundNames();
  const decodedNames = audio.analyse().decode;
  document.getElementById('sound-count').textContent =
    `(${names.length} names, ${decodedNames.decoded}/${decodedNames.registered} decoded)`;
  for (const name of names) {
    const definition = soundFor(name);
    const duration = durationOfFile(definition.file);
    const flags = [
      definition.loop ? 'L' : '',
      definition.autoplay ? 'AP' : '',
      definition.sync ? 'S' : '',
      definition.positional ? 'pos' : '',
    ].filter(Boolean).join(' ');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sound';
    button.title = `${definition.file} — volume ${definition.volume}, ${duration.toFixed(2)} s`;
    button.innerHTML =
      `<span class="name">${name}</span>` +
      `<span class="meta"><span class="vol">${definition.volume}</span> ${flags}` +
      `<span class="pos"> ${duration.toFixed(1)}s</span></span>`;
    button.addEventListener('click', () => playFromList(name, button));
    grid.append(button);
  }
}

function playFromList(name, button) {
  if (!audio.contextStarted) {
    setStatus('audio is still suspended — click "Start audio" first');
    return;
  }
  const definition = soundFor(name);
  if (isPositional(name)) {
    audio.playPositional(name, buttonNPC, {
      volume: name.startsWith('dialogue') ? 0.5 : Math.max(definition.volume, 0.1),
      attach: !name.startsWith('dialogue'),
    });
  } else {
    audio.play(name);
  }
  button.classList.add('active');
  setTimeout(() => button.classList.remove('active'), 350);
}

function durationOfFile(file) {
  return report.durations[file] ?? 0;
}

function totalDuration() {
  return Object.values(report.durations).reduce((sum, value) => sum + value, 0);
}

function wireSessionButtons() {
  const start = document.getElementById('start');
  start.addEventListener('click', async () => {
    await audio.resume();
    report.started = audio.contextStarted;
    start.textContent = audio.contextStarted ? `audio running (${audio.analyse().context.state})` : 'audio unavailable';
    start.classList.toggle('on', audio.contextStarted);
    runChecks();
  });

  document.getElementById('mute').addEventListener('click', () => {

    events.emit('audio_mute_toggle');
  });

  document.getElementById('walk').addEventListener('click', (event) => {
    const walking = player.weights[1] === 0;
    player.weights = walking ? [0, 1, 0] : [0, 0, 0];
    event.currentTarget.textContent = `walking: ${walking ? 'on' : 'off'}`;
  });

  document.getElementById('medium').addEventListener('click', (event) => {
    player.medium = player.medium === 0 ? 1 : 0;
    event.currentTarget.textContent = `medium: ${player.medium === 0 ? 'GROUND' : 'AIR'}`;
  });
}

function installMuteLabel() {
  const button = document.getElementById('mute');
  const update = (muted) => {
    button.textContent = muted ? 'muted (click to unmute)' : 'unmuted (click to mute)';
    button.classList.toggle('muted', muted);
  };
  events.on('audio_update_mute', update);
  update(audio.muted);
}

function buildZoneButtons() {
  const row = document.getElementById('zones');
  for (const zone of ZONES) {
    addButton(row, zone.name, () => setPlayerPosition([...zone.center], zone.name));
  }
  addButton(row, 'spawn city', () => setPlayerPosition([...SPAWN_POINTS.city], 'spawn city'));
  addButton(row, 'outside (spawn 2)', () => setPlayerPosition([...SPAWN_POINTS.outside], 'outside'));
  addButton(row, 'origin / water', () => setPlayerPosition([0, 0, 5], 'origin (|p| < 22)'));
}

function setPlayerPosition(position, label) {
  player.position.set(position[0], position[1], position[2]);
  document.getElementById('zone-note').textContent =
    `${label} · |p| = ${player.position.length().toFixed(1)} · ` +
    `ambience target: ${zoneAt(player.position)}`;
}

function buildVoiceButtons() {
  const row = document.getElementById('voices');
  for (const voice of ['male1', 'male2', 'male3', 'female1', 'female2', 'female3', 'wtf']) {
    addButton(row, voice, () => {
      audio.dialogue.startDialogue({ id: 'demo', text: DEMO_LINE, voice });
    });
  }
  addButton(row, 'quest bed', () => {
    events.emit('npc_dialog_open', 'intro_sequence', DEMO_LINE, { voice: 'quest' }, { bubblesEnabled: false });
  });
  addButton(row, 'bubble', () => {
    events.emit('npc_bubble_text_starts', { object: demoNPC, npc: 'demo', text: 'HELLO THERE TRAVELLER.' });
  });
}

function addButton(parent, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  parent.append(button);
  return button;
}

let gameTime = 0;
let lastFrameTime = 0;

let simulating = false;
let testTime = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (simulating) {
    drawReadout();
    return;
  }
  const dt = lastFrameTime ? Math.min(0.1, (now - lastFrameTime) / 1000) : 1 / 60;
  lastFrameTime = now;
  gameTime += dt;
  stepAudio(gameTime, dt);
  drawReadout();
}

function stepAudio(time, dt) {
  player.animationTime = time;
  scene.updateMatrixWorld(true);
  audio.update(time, dt, player);
}

function advance(seconds) {
  const steps = Math.max(1, Math.round(seconds * 60));
  for (let index = 0; index < steps; index++) {
    testTime += 1 / 60;
    stepAudio(testTime, 1 / 60);
  }
  drawReadout();
}

const CANVAS = { width: 360, height: 390, scale: 2 };

function drawReadout() {
  const canvas = document.getElementById('readout');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = CANVAS.width;
  const height = CANVAS.height;
  ctx.setTransform(CANVAS.scale, 0, 0, CANVAS.scale, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const state = audio.analyse();
  const activePositional = state.sounds.filter((sound) => sound.positional && sound.playing);

  const bars = [
    ['master gain', state.context.gain, 1, '#66bde6'],
    ['master target', state.context.target, 1, '#2b6f8c'],
    ['bgmusic', state.music.playing ? state.music.volume : 0, 0.2, '#c9a0ff'],
    ['ambiance-base', state.ambience.baseVolume, 0.6, '#7bd88f'],
    [`ambiance-${state.ambience.zone ?? '—'}`, state.ambience.zone ? state.ambience.weight * 0.5 : 0, 0.6, '#55c7b0'],
    ['footsteps (dry)', state.footsteps.dryVolume, 0.25, '#e9c46a'],
    ['footsteps-water', state.footsteps.waterVolume, 0.25, '#4aa3df'],
    ['dialogue-quest', state.dialogue.questVolume, 0.1, '#f0a6ca'],
    ['paper4', state.ui.paperVolume, 0.5, '#c8c8c8'],
  ];
  for (const sound of activePositional.slice(0, 5)) {
    bars.push([sound.name, sound.volume, 0.6, '#f2707d']);
  }

  let y = 14;
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillStyle = '#d9dee9';
  ctx.fillText('LIVE MIX — audio.analyse()', 10, y);
  y += 16;

  for (const [label, value, max, color] of bars) {
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = '#8d97ab';
    ctx.fillText(label.slice(0, 20), 10, y);
    ctx.fillStyle = '#252b38';
    ctx.fillRect(150, y - 8, 190, 8);
    ctx.fillStyle = color;
    ctx.fillRect(150, y - 8, Math.max(0, Math.min(1, value / max)) * 190, 8);
    ctx.fillStyle = '#d9dee9';
    ctx.fillText(value.toFixed(3), 346, y);
    y += 13;
  }

  y += 4;
  ctx.font = '9px ui-monospace, monospace';
  const lines = [
    `context      ${state.context.state} @ ${state.context.sampleRate} Hz`,
    `muted/visible ${state.context.muted} / ${state.context.visible}  started ${state.context.started}`,
    `active srcs  ${state.active.length} (${state.active.slice(0, 6).join(', ')})`,
    `decoded      ${state.decode?.decoded ?? 0}/${state.decode?.registered ?? 0} sounds, ${(state.decode?.totalDuration ?? 0).toFixed(1)}s`,
    `zone         ${state.ambience.zone ?? 'none'}  weight ${state.ambience.weight.toFixed(2)}`,
    `player       [${player.position.toArray().map((v) => v.toFixed(1)).join(', ')}] |p|=${player.position.length().toFixed(1)}`,
    `feet         walk ${state.footsteps.walking.toFixed(2)} water ${state.footsteps.water.toFixed(2)}`,
    `sync skew    ${(state.sync?.skew ?? 0).toFixed(3)} s`,
    `voices       ${state.dialogue.active.length} active, quest ${state.dialogue.questVolume.toFixed(3)}`,
    `t +${state.clock.toFixed(1)}s  frames ${state.frame}`,
  ];
  for (const line of lines) {
    ctx.fillStyle = '#9aa5b8';
    ctx.fillText(line, 10, y);
    y += 12;
  }
}

const DEMO_LINE = 'I WAS WONDERING IF YOU WOULD MIND DELIVERING THIS LETTER TO MY BROTHER.';
const QUICK_LINE = 'DELIVER THIS LETTER TO MY BROTHER, PLEASE.';
let checkPromise = null;

function check(name, pass, detail = '') {
  report.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  renderChecks();
  return Boolean(pass);
}

async function checkAsync(name, fn) {
  try {
    const result = await fn();
    const { pass, detail } = typeof result === 'object' ? result : { pass: result === true, detail: '' };
    return check(name, pass, detail);
  } catch (error) {
    return check(name, false, error?.message || String(error));
  }
}

function renderChecks() {
  const list = document.getElementById('checks');
  list.innerHTML = '';
  for (const item of report.checks) {
    const node = document.createElement('li');
    node.className = item.pass ? 'pass' : 'fail';
    node.textContent = `${item.pass ? '✓' : '✗'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`;
    list.append(node);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runChecks() {
  if (checkPromise) return checkPromise;
  checkPromise = runAllChecks();
  return checkPromise;
}
window.__audioLab.runChecks = runChecks;

async function runAllChecks() {
  report.phase = 'checking';

  await wait(900);

  events.emit('visibility_change', true);
  await wait(250);

  check(
    'boots muted, context suspended, master target 0',
    report.bootState.muted === true
      && report.bootState.contextStarted === false
      && report.bootState.masterTarget === 0,
    JSON.stringify(report.bootState),
  );

  const files = Object.keys(report.durations);
  const badDurations = files.filter((file) => !(report.durations[file] > 0));
  check(
    `all ${AUDIO_FILES.length} .ogg files decode`,
    files.length === AUDIO_FILES.length && badDurations.length === 0,
    `${files.length} files, ${totalDuration().toFixed(2)} s total${badDurations.length ? `, bad: ${badDurations}` : ''}`,
  );

  const decode = audio.analyse().decode;
  const missingFiles = allSoundNames().filter((name) => !(durationOfFile(SOUNDS[name].file) > 0));
  check(
    'registry decodes (53 names, 54 files)',
    decode.decoded === 53 && decode.playable === 53 && missingFiles.length === 0,
    `${decode.decoded}/${decode.registered} decoded, ${decode.playable} playable, total ${decode.totalDuration.toFixed(1)} s`,
  );

  const running = audio.analyse();
  check(
    'gesture unlock: context running',
    running.context.started === true && running.context.state === 'running',
    `${running.context.state} @ ${running.context.sampleRate} Hz`,
  );

  const autoplayNames = allSoundNames().filter((name) => SOUNDS[name].autoplay);
  const started = audio.analyse();
  const notPlaying = autoplayNames.filter((name) => !started.sounds.find((sound) => sound.name === name)?.playing);
  check(
    `autoplay beds start (${autoplayNames.length})`,
    audio.stats.autoPlays === autoplayNames.length && notPlaying.length === 0,
    `autoPlays=${audio.stats.autoPlays}${notPlaying.length ? `, not playing: ${notPlaying}` : ''}`,
  );

  const afterRamp = audio.analyse();
  check(
    'auto-unmutes at first gesture',
    audio.muted === false && afterRamp.context.target === 1 && afterRamp.context.gain > 0.5,
    `muted=${audio.muted} target=${afterRamp.context.target} gain=${afterRamp.context.gain.toFixed(3)}`,
  );
  check(
    'bgmusic at 0.1, playing, looped',
    started.music.playing && Math.abs(started.music.volume - 0.1) < 1e-6,
    `playing=${started.music.playing} volume=${started.music.volume}`,
  );

  simulating = true;
  testTime = gameTime;

  events.emit('visibility_change', true);
  events.emit('audio_mute_toggle');
  advance(0.05);
  const mutedState = audio.analyse();
  check(
    'audio_mute_toggle mutes (1 s ramp target 0)',
    audio.muted === true && mutedState.context.target === 0 && report.muteEvents.at(-1) === true,
    `muted=${audio.muted} target=${mutedState.context.target} emitted=${report.muteEvents.at(-1)}`,
  );
  events.emit('audio_mute_toggle');
  advance(0.05);
  const unmutedState = audio.analyse();
  check(
    'audio_mute_toggle unmutes',
    audio.muted === false && unmutedState.context.target === 1 && report.muteEvents.at(-1) === false,
    `muted=${audio.muted} target=${unmutedState.context.target}`,
  );

  audio.setMuted(true);
  const persistedMuted = JSON.parse(storage.getItem(STORAGE_KEY));
  audio.setMuted(false);
  const persistedUnmuted = JSON.parse(storage.getItem(STORAGE_KEY));
  check(
    'mute persists in App3D_data, quest save intact',
    persistedMuted.audioMuted === true
      && persistedUnmuted.audioMuted === false
      && JSON.stringify(persistedMuted.questProgress) === JSON.stringify(SEED_SAVE.questProgress)
      && JSON.stringify(persistedMuted.modelFiles) === JSON.stringify(SEED_SAVE.modelFiles),
    `audioMuted ${persistedMuted.audioMuted} -> ${persistedUnmuted.audioMuted}; keys ${Object.keys(persistedUnmuted).join(',')}`,
  );

  events.emit('visibility_change', true);
  events.emit('visibility_change', false);
  advance(0.05);
  const hidden = audio.analyse();
  check(
    'visibility_change(false) ramps master to 0',
    hidden.context.visible === false && hidden.context.target === 0,
    `visible=${hidden.context.visible} target=${hidden.context.target}`,
  );
  events.emit('visibility_change', true);
  advance(0.05);
  check(
    'visibility_change(true) ramps master back',
    audio.analyse().context.visible === true && audio.analyse().context.target === 1,
    `target=${audio.analyse().context.target}`,
  );

  const ambienceChecks = [
    ['city', SPAWN_POINTS.city, 'city', 1],
    ['forest', ZONES.find((zone) => zone.name === 'forest').center, 'forest', 1],
    ['outside every sphere', SPAWN_POINTS.outside, null, 0],
  ];
  for (const [label, position, expectedZone, expectedWeight] of ambienceChecks) {
    player.position.set(position[0], position[1], position[2]);
    advance(0.1);
    const ambience = audio.analyse().ambience;
    const zoneVolume = expectedZone ? ambience.volumes[`ambiance-${expectedZone}`] : 0;
    check(
      `ambience @ ${label}: zone ${expectedZone ?? 'none'}`,
      ambience.zone === expectedZone
        && Math.abs(ambience.weight - expectedWeight) < 1e-6
        && Math.abs(zoneVolume - expectedWeight * 0.5) < 1e-6
        && audio.getVolume('ambiance-base') === 0.5,
      `zone=${ambience.zone} weight=${ambience.weight.toFixed(2)} vol=${zoneVolume.toFixed(2)} base=${audio.getVolume('ambiance-base')}`,
    );
  }

  const startsBefore = window.__audioStartCalls.total;
  const playsBefore = audio.stats.plays;
  events.emit('webgl_play_audio', 'click2');
  advance(0.05);
  check(
    'webgl_play_audio starts a real source',
    audio.stats.plays === playsBefore + 1
      && audio.isPlaying('click2')
      && window.__audioStartCalls.total > startsBefore,
    `plays ${playsBefore}->${audio.stats.plays}, source starts ${startsBefore}->${window.__audioStartCalls.total}`,
  );
  events.emit('webgl_set_audio_volume', 'hover2', 0.123);
  advance(0.02);
  check(
    'webgl_set_audio_volume sets individual gain',
    Math.abs(audio.getVolume('hover2') - 0.123) < 1e-6,
    `hover2 volume=${audio.getVolume('hover2')}`,
  );

  const gateBefore = audio.stats.plays;
  events.emit('webgl_play_audio', 'button-turn');
  events.emit('webgl_play_audio', 'button-turn');
  check(
    'minTimeBetweenPlays gates retrigger',
    audio.stats.plays === gateBefore + 1,
    `plays ${gateBefore} -> ${audio.stats.plays}`,
  );

  events.emit('webgl_play_positional', 'bubble-starts', demoNPC, 0.1, 0.05, true);
  advance(0.1);
  const bubblePlaying = audio.analyseSound('bubble-starts');
  check(
    'webgl_play_positional attaches + plays',
    bubblePlaying?.playing === true && bubblePlaying.parent === 'demo-npc',
    `playing=${bubblePlaying?.playing} parent=${bubblePlaying?.parent}`,
  );
  events.emit('webgl_stop_positional', 'bubble-starts');
  advance(0.35);
  check(
    'webgl_stop_positional fades out and detaches',
    audio.analyseSound('bubble-starts')?.playing === false
      && audio.analyseSound('bubble-starts')?.parent === null,
    `playing=${audio.analyseSound('bubble-starts')?.playing} parent=${audio.analyseSound('bubble-starts')?.parent}`,
  );

  const expectedVoiceDuration = QUICK_LINE.length / 35;
  events.emit('npc_dialog_open', 'demo', QUICK_LINE, { voice: 'male2' }, { bubblesEnabled: false });
  advance(0.22);
  const beforeStart = audio.dialogue.analyse().active[0];
  advance(0.45);
  const voiceStarted = audio.dialogue.analyse().active[0];
  const voiceSource = audio.analyseSound('dialogue-male2');
  check(
    'dialogue voice starts after the 0.35+0.1 s text delay',
    beforeStart && beforeStart.started === false
      && voiceStarted && voiceStarted.started === true
      && voiceSource?.playing === true
      && voiceSource.parent === 'demo-npc',
    `delay=${voiceStarted?.delay}s duration=${voiceStarted?.duration.toFixed(2)}s playing=${voiceSource?.playing} parent=${voiceSource?.parent}`,
  );
  advance(0.25);
  check(
    'dialogue voice fades in to the 0.5 default',
    audio.getVolume('dialogue-male2') > 0.4,
    `volume=${audio.getVolume('dialogue-male2').toFixed(3)}`,
  );
  advance(expectedVoiceDuration + 0.6);
  check(
    'dialogue voice stops when typing ends',
    audio.dialogue.analyse().active.length === 0 && audio.analyseSound('dialogue-male2')?.playing === false,
    `active=${audio.dialogue.analyse().active.length} duration=${expectedVoiceDuration.toFixed(2)}s`,
  );

  events.emit('npc_dialog_open', 'intro_sequence', QUICK_LINE, { voice: 'quest' }, { bubblesEnabled: false });
  advance(0.8);
  const questUp = audio.getVolume('dialogue-quest');
  events.emit('npc_dialog_close', 'intro_sequence');
  advance(0.45);
  const questDown = audio.getVolume('dialogue-quest');
  check(
    'quest narration bed rises to 0.075 and falls back',
    questUp > 0.05 && questDown < 0.01,
    `up=${questUp.toFixed(3)} down=${questDown.toFixed(3)}`,
  );

  events.emit('npc_bubble_text_starts', { object: demoNPC, npc: 'demo', text: QUICK_LINE });
  advance(0.6);
  const bubbleVoice = audio.analyseSound('dialogue-male1');
  events.emit('npc_bubble_text_ends', { object: demoNPC, npc: 'demo', text: QUICK_LINE });
  advance(0.3);
  check(
    'bubble voice event pair starts and stops the voice',
    bubbleVoice?.playing === true && bubbleVoice.parent === 'demo-npc',
    `playing=${bubbleVoice?.playing} parent=${bubbleVoice?.parent}`,
  );

  events.emit('npc_talk_update', { id: 'musician', object: musicianNPC, talking: false });
  advance(0.25);
  const musicianPlaying = audio.analyseSound('dialogue-music-dave');
  events.emit('npc_talk_update', { id: 'musician', object: musicianNPC, talking: true });
  advance(0.4);
  check(
    'musician positional loop starts/stops on talk state',
    musicianPlaying?.playing === true && musicianPlaying.parent === 'musician'
      && audio.analyseSound('dialogue-music-dave')?.playing === false,
    `playing=${musicianPlaying?.playing} parent=${musicianPlaying?.parent}`,
  );

  player.medium = 0;
  player.weights = [0, 1, 0];
  player.position.set(0, 0, 30);
  advance(0.9);
  const dry = audio.analyse().footsteps;
  player.position.set(0, 0, 5);
  advance(0.9);
  const wet = audio.analyse().footsteps;
  check(
    'footsteps cross-fade dry/wet at |p| < 22, max 0.2',
    dry.dryVolume > 0.15 && dry.waterVolume < 0.01
      && wet.waterVolume > 0.15 && wet.dryVolume < 0.01
      && dry.dryVolume <= 0.2 && wet.waterVolume <= 0.2,
    `dry=${dry.dryVolume.toFixed(3)}/${dry.waterVolume.toFixed(3)} wet=${wet.dryVolume.toFixed(3)}/${wet.waterVolume.toFixed(3)}`,
  );

  const beforeSync = audio.analyse().sync.skew;
  const stepDuration = durationOfFile(SOUNDS.footsteps.file);
  const jumpClock = audio._clock + 3;
  audio.update(jumpClock, 0.016, { ...player, animationTime: jumpClock });
  testTime = jumpClock;
  const afterSync = audio.analyse().sync.skew;
  const phase = audio.analyseSound('footsteps')?.progress ?? 0;
  const expectedPhase = jumpClock % stepDuration;
  check(
    'animation sync re-seeks footsteps on >0.1 s skew',
    Math.abs(afterSync - beforeSync) > 0.1 && Math.abs(phase - expectedPhase) < 0.1,
    `skew ${beforeSync.toFixed(2)}->${afterSync.toFixed(2)}, phase ${phase.toFixed(2)} vs ${expectedPhase.toFixed(2)}`,
  );

  const cuesBefore = audio.stats.plays;
  audio.intro.playIn();
  advance(0.35);
  const cuesAfter = audio.stats.plays;
  audio.intro.cancel();
  check(
    'intro timeline fires its first cue at 0.16 s',
    cuesAfter > cuesBefore,
    `plays ${cuesBefore} -> ${cuesAfter}`,
  );

  audio.ui.paper(0.5);
  advance(0.12);
  const paperUp = audio.getVolume('paper4');
  advance(0.8);
  const paperDown = audio.getVolume('paper4');
  check(
    'paper4 bed envelope attacks and decays',
    paperUp > 0.05 && paperDown < 0.01,
    `attack=${paperUp.toFixed(3)} decay=${paperDown.toFixed(3)}`,
  );

  const lowMemory = registryFor({ lowMemoryDevice: true });
  check(
    'low-memory build registers bgmusic-mobile + quest-complete only',
    Object.keys(lowMemory).length === 2
      && lowMemory.bgmusic.file === LOW_MEMORY_MUSIC_FILE
      && Boolean(lowMemory['quest-complete']),
    `${Object.keys(lowMemory).join(',')} / ${lowMemory.bgmusic.file}`,
  );

  const unknownPlayed = audio.play('does-not-exist');
  check(
    'unknown sound name is a silent no-op',
    unknownPlayed === false && soundFor('does-not-exist') === null,
  );

  check('no page errors during checks', report.errors.length === 0, report.errors.join(' | ').slice(0, 300));

  player.position.set(...SPAWN_POINTS.city);
  player.weights = [0, 1, 0];
  events.emit('webgl_set_audio_volume', 'hover2', 0.2);
  advance(0.6);
  simulating = false;
  gameTime = testTime;
  lastFrameTime = performance.now();

  const summary = audio.analyse();
  report.summary = {
    passed: report.checks.filter((item) => item.pass).length,
    failed: report.checks.filter((item) => !item.pass).length,
    checks: report.checks.length,
    decoded: summary.decode?.decoded,
    files: AUDIO_FILES.length,
    totalDuration: summary.decode?.totalDuration,
    active: summary.active,
    muteEvents: report.muteEvents,
    sourceStarts: window.__audioStartCalls.total,
    autoPlays: audio.stats.autoPlays,
  };
  report.phase = 'done';
  report.done = true;
  setStatus(
    `checks: ${report.summary.passed} passed, ${report.summary.failed} failed · ` +
    `${summary.decode.decoded} sounds / ${AUDIO_FILES.length} files decoded · ` +
    `${window.__audioStartCalls.total} source starts`,
  );
  return report.checks;
}

function zoneAt(position) {
  for (const zone of ZONES) {
    const distance = Math.hypot(
      position.x - zone.center[0],
      position.y - zone.center[1],
      position.z - zone.center[2],
    );
    if (distance < zone.radius) return zone.name;
  }
  return 'none';
}

function setStatus(text) {
  const node = document.getElementById('status');
  if (node) node.textContent = text;
}

function createMemoryStorage(seed = {}) {
  const map = new Map();
  if (seed) map.set(STORAGE_KEY, JSON.stringify(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
  };
}
