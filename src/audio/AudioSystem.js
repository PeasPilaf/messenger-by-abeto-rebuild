import { Vector3 } from 'three';

import { audioLoader as sharedAudioLoader } from '../assets/AudioLoader.js';
import { clamp, ratioFromDelta } from './AudioMath.js';
import { TweenManager } from './Tween.js';
import { SoundBank } from './SoundBank.js';
import { detectLowMemoryDevice, registryFor } from './SoundRegistry.js';
import { AudioSession } from './AudioSession.js';
import { attachAudioBus, detachAudioBus, POSITIONAL_DEFAULT_VOLUME } from './AudioBus.js';
import { snapshot, soundState } from './AudioDiagnostics.js';
import { MusicSystem } from './MusicSystem.js';
import { AmbienceSystem } from './AmbienceSystem.js';
import { DialogueVoices } from './DialogueVoices.js';
import { Footsteps } from './Footsteps.js';
import { UiSounds } from './UiSounds.js';
import { IntroCues } from './IntroCues.js';

export {
  MUTE_RAMP,
  HIDE_RAMP,
  SHOW_RAMP,
  FIRST_UNMUTE_RAMP,
  GLOBAL_VOLUME_TIME,
} from './AudioSession.js';

export const POSITIONAL_FADE = 0.2;

export { POSITIONAL_DEFAULT_VOLUME } from './AudioBus.js';

export const MAX_UPDATE_DT = 0.1;

const _forward = new Vector3();
const _up = new Vector3();

export class AudioSystem {

  constructor({
    listener = null,
    lowMemoryDevice = undefined,
    storage = globalThis.localStorage,
    registry = null,
    loader = sharedAudioLoader,
    resolveNPC = null,
    random = Math.random,
  } = {}) {
    this.listenerCamera = listener;
    this.lowMemoryDevice = lowMemoryDevice ?? detectLowMemoryDevice();
    this.registry = registry ?? registryFor({ lowMemoryDevice: this.lowMemoryDevice });
    this._loader = loader;
    this._resolveNPC = resolveNPC;
    this._random = random;

    this._bank = null;
    this._ready = null;
    this._clock = 0;
    this._dt = 0;
    this._ratio = 1;

    this._npcObjects = new Map();

    this.timers = new TweenManager();

    this.stats = { plays: 0, positionalPlays: 0, autoPlays: 0, voices: 0 };

    this.frame = 0;

    this.session = new AudioSession({ storage });

    this.music = new MusicSystem({ audio: this });
    this.ambience = new AmbienceSystem({ audio: this });
    this.dialogue = new DialogueVoices({
      audio: this,
      resolveNPC: (id) => this._npcObjects.get(id) ?? (this._resolveNPC ? this._resolveNPC(id) : null),
      random,
    });
    this.footsteps = new Footsteps({ audio: this });
    this.ui = new UiSounds({ audio: this, random });
    this.intro = new IntroCues({ audio: this });
    this.music.attach();
    this.dialogue.attach();
    this.footsteps.attach();

    this._bus = attachAudioBus(this);
  }

  load() {
    if (!this._ready) this._ready = this._load();
    return this._ready;
  }

  async _load() {
    await this.session.load();
    this._bank = new SoundBank({
      loader: this._loader,
      listener: this.session.listener,
      registry: this.registry,
    });
    await this._bank.load();

    this.session.whenRunning(() => {
      this.stats.autoPlays = this._bank.startAutoplay(this._clock);
    });
    return this;
  }

  resume() {
    return this.session.resume();
  }

  setListenerCamera(camera) {
    this.listenerCamera = camera;
    return this;
  }

  registerNPC(id, object3D) {
    this._npcObjects.set(id, object3D);
    this.dialogue.registerNPC(id, object3D);
    return this;
  }

  play(name) {
    if (!this._bank) return false;
    const started = this._bank.play(name, 0, this._clock);
    if (started) this.stats.plays++;
    return started;
  }

  stop(name) {
    return this._bank ? this._bank.stop(name) : false;
  }

  setVolume(name, volume = 1) {
    return this._bank ? this._bank.setVolume(name, volume) : false;
  }

  getVolume(name) {
    return this._bank ? this._bank.getVolume(name) : 0;
  }

  isPlaying(name) {
    return this._bank ? this._bank.isPlaying(name) : false;
  }

  playPositional(name, object3D, {
    volume = POSITIONAL_DEFAULT_VOLUME,
    offset = 0,
    attach = false,
  } = {}) {
    if (!this._bank || !this.session.started || !object3D) return false;
    const audio = this._bank.audio(name);
    if (!audio) return false;

    const dialogueRule = object3D.isWorldNPC === true && name.startsWith('dialogue');
    if (dialogueRule) {
      this._bank.attach(name, object3D);
      this._bank.setVolume(name, 0);
      const duration = this._bank.duration(name);

      audio.offset = clamp(this._random() * duration, 0, Math.max(0, duration - 0.001));
      this._bank.play(name, offset, this._clock);
      this._fadeVolume(name, volume, POSITIONAL_FADE);
      this.stats.positionalPlays++;
      return true;
    }
    if (attach) {
      this._bank.attach(name, object3D);
      this._bank.setVolume(name, volume);
      this._bank.play(name, offset, this._clock);
      this.stats.positionalPlays++;
      return true;
    }
    return false;
  }

  stopPositional(name) {
    if (!this._bank || !this._bank.audio(name)) return false;
    this._fadeVolume(name, 0, POSITIONAL_FADE, () => {
      this._bank.detach(name);
      this._bank.stop(name);
    });
    return true;
  }

  get muted() {
    return this.session.muted;
  }

  get volume() {
    return this.session.volume;
  }

  get contextStarted() {
    return this.session.started;
  }

  setMuted(muted, options) {
    return this.session.setMuted(muted, options);
  }

  toggleMute(options) {
    return this.session.toggleMute(options);
  }

  setGlobalVolume(volume, time) {
    return this.session.setGlobalVolume(volume, time);
  }

  update(time, dt, player = null) {
    if (!this._bank) return;
    const hasTime = typeof time === 'number' && Number.isFinite(time);
    const now = hasTime ? time : (this.session.context ? this.session.context.currentTime : 0);
    const step = typeof dt === 'number' && Number.isFinite(dt)
      ? dt
      : Math.max(0, now - this._clock);
    const clamped = clamp(step, 0, MAX_UPDATE_DT);

    this._clock = now;
    this._dt = clamped;
    this._ratio = ratioFromDelta(clamped);
    this.frame++;

    this.timers.update(clamped);
    this._updateListener(clamped);

    const syncClock = typeof player?.animationTime === 'number' ? player.animationTime : now;
    this._bank.applySync(syncClock);

    this.ambience.update(player?.position ?? null);
    this.footsteps.update(player, this._ratio);
    this._bank.updatePositionals();
  }

  _updateListener(dt) {
    const camera = this.listenerCamera;
    const context = this.session.context;
    if (!this.session.listener || !context || !camera) return;
    const endTime = context.currentTime + clamp(dt, 0, MAX_UPDATE_DT);
    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const native = context.listener;
    if (native.positionX) {
      native.positionX.linearRampToValueAtTime(camera.position.x, endTime);
      native.positionY.linearRampToValueAtTime(camera.position.y, endTime);
      native.positionZ.linearRampToValueAtTime(camera.position.z, endTime);
      native.forwardX.linearRampToValueAtTime(_forward.x, endTime);
      native.forwardY.linearRampToValueAtTime(_forward.y, endTime);
      native.forwardZ.linearRampToValueAtTime(_forward.z, endTime);
      native.upX.linearRampToValueAtTime(_up.x, endTime);
      native.upY.linearRampToValueAtTime(_up.y, endTime);
      native.upZ.linearRampToValueAtTime(_up.z, endTime);
    } else {
      native.setPosition(camera.position.x, camera.position.y, camera.position.z);
      native.setOrientation(_forward.x, _forward.y, _forward.z, _up.x, _up.y, _up.z);
    }

    this.session.listener.timeDelta = clamp(dt, 0, MAX_UPDATE_DT);
  }

  after(delay, fn) {
    return this.timers.after(delay, fn);
  }

  _fadeVolume(name, target, duration, onComplete = null) {
    const audio = this._bank?.audio(name);
    if (!audio) return null;
    const value = { value: audio.individualVolume ?? 0 };
    const end = Math.max(0, target);
    return this.timers.tween({
      key: `fade:${name}`,
      target: value,
      to: { value: end },
      duration,
      onUpdate: () => this._bank.setVolume(name, value.value),
      onComplete: () => {
        this._bank.setVolume(name, end);
        if (onComplete) onComplete();
      },
    });
  }

  analyseSound(name) {
    return soundState(this, name);
  }

  analyse() {
    return snapshot(this);
  }

  dispose() {
    detachAudioBus(this._bus);
    this._bus = null;
    this.music.detach();
    this.dialogue.detach();
    this.footsteps.detach();
    this.intro.cancel();
    this.timers.clear();
    this._bank?.dispose();
    this.session.dispose();
  }
}
