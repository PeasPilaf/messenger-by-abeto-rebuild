import { Audio, PositionalAudio } from 'three';

export const SYNC_SKEW = 0.1;

export class SoundBank {

  constructor({ loader, listener, registry }) {
    this.loader = loader;
    this.listener = listener;
    this.registry = registry;
    this.context = listener.context;

    this.buffers = new Map();

    this.audios = new Map();

    this.errors = new Map();

    this._syncNames = Object.keys(registry).filter((name) => registry[name].sync);
    this._timeLastPlayedSkew = 0;
    this._pendingSyncPhase = new Map();
  }

  get decodedCount() {
    return this.buffers.size;
  }

  get soundCount() {
    return Object.keys(this.registry).length;
  }

  get totalDuration() {
    let total = 0;
    for (const duration of this.durations.values()) total += duration;
    return total;
  }

  get durations() {
    if (!this._durations) this._durations = new Map();
    return this._durations;
  }

  async load(names = Object.keys(this.registry)) {
    const results = await Promise.allSettled(names.map((name) => this._loadOne(name)));
    const failed = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failed.push(names[index]);
        this.errors.set(names[index], result.reason);
      }
    });
    return { loaded: this.audios.size, failed };
  }

  async _loadOne(name) {
    const definition = this.registry[name];
    if (!definition) throw new Error(`SoundBank: "${name}" is not in the registry`);
    const buffer = await this.loader.load(definition.file);

    const audio = definition.positional
      ? this._createPositional(definition)
      : new Audio(this.listener);

    audio.setBuffer(buffer);
    audio.setLoop(Boolean(definition.loop));
    audio.setPlaybackRate(definition.playbackRate ?? 1);

    audio.individualVolume = Math.max(0, definition.volume ?? 1);
    audio.offset = clampOffset(definition.offset ?? 0, buffer.duration);
    audio._animationSync = Boolean(definition.sync);
    audio._animationSyncOffset = definition.syncOffset ?? 0;
    audio._minTimeBetweenPlays = definition.minTimeBetweenPlays ?? 0;
    audio._timeLastPlayed = -Infinity;
    audio.name = name;

    audio.gain.gain.value = audio.individualVolume;

    this.buffers.set(name, buffer);
    this.durations.set(name, buffer.duration);
    this.audios.set(name, audio);
    return audio;
  }

  _createPositional(definition) {
    const { positional } = definition;
    const audio = new PositionalAudio(this.listener);
    audio.setRefDistance(positional.refDistance);
    audio.setRolloffFactor(positional.rolloffFactor);
    audio.setDistanceModel(positional.distanceModel);
    audio.setMaxDistance(positional.maxDistance);
    audio.setDirectionalCone(...positional.directionalCone);
    return audio;
  }

  audio(name) {
    return this.audios.get(name) ?? null;
  }

  buffer(name) {
    return this.buffers.get(name) ?? null;
  }

  duration(name) {
    return this.durations.get(name) ?? 0;
  }

  isPlaying(name) {
    return this.audio(name)?.isPlaying === true;
  }

  getVolume(name) {
    return this.audio(name)?.individualVolume ?? 0;
  }

  setVolume(name, volume) {
    const audio = this.audio(name);
    if (!audio) return false;
    audio.individualVolume = Math.max(0, volume);
    audio.setVolume(audio.individualVolume);
    return true;
  }

  play(name, delay = 0, clock = 0) {
    const audio = this.audio(name);
    if (!audio) return false;
    if (this.context.state !== 'running') return false;
    const sinceLast = clock - audio._timeLastPlayed;
    if (!(sinceLast > audio._minTimeBetweenPlays)) return false;
    audio._timeLastPlayed = clock;
    audio.stop();
    if (this._syncNames.includes(name)) {
      audio._progress = this._syncPhase(name, this._syncClock ?? clock);
    }
    audio.play(delay);
    return true;
  }

  stop(name) {
    const audio = this.audio(name);
    if (!audio) return false;
    if (this.context.state !== 'running') return false;
    audio.stop();
    return true;
  }

  startAutoplay(clock) {
    let started = 0;
    for (const name of Object.keys(this.registry)) {
      if (!this.registry[name].autoplay) continue;
      const audio = this.audio(name);
      if (!audio || audio.isPlaying) continue;
      this._syncClock = clock;
      if (this._syncNames.includes(name)) audio._progress = this._syncPhase(name, clock);
      audio.play();
      started++;
    }
    return started;
  }

  stopAll() {
    for (const audio of this.audios.values()) audio.stop();
    this._pendingSyncPhase.clear();
  }

  _syncPhase(name, clock) {
    const definition = this.registry[name];
    const duration = this.duration(name);
    if (!definition || duration <= 0) return 0;
    const rate = definition.playbackRate ?? 1;
    const phase = ((clock + (definition.syncOffset ?? 0)) * rate) % duration;
    return phase >= 0 ? phase : phase + duration;
  }

  applySync(clock) {
    this._syncClock = clock;
    const skew = clock - this.context.currentTime;
    if (Math.abs(skew - this._timeLastPlayedSkew) <= SYNC_SKEW) return false;
    this._timeLastPlayedSkew = skew;
    if (this.context.state !== 'running') return true;
    for (const name of this._syncNames) {
      const audio = this.audio(name);
      if (!audio || !audio.isPlaying) continue;
      audio.pause();
      audio._progress = this._syncPhase(name, clock);
      audio.play();
    }
    return true;
  }

  get syncSkew() {
    return this._timeLastPlayedSkew;
  }

  attach(name, object3D) {
    const audio = this.audio(name);
    if (!audio || !object3D) return false;
    if (audio.parent !== object3D) {
      audio.removeFromParent();
      object3D.add(audio);
    }

    object3D.updateWorldMatrix?.(true, false);
    audio.updateMatrixWorld(true);
    return true;
  }

  detach(name) {
    const audio = this.audio(name);
    if (!audio) return false;
    audio.removeFromParent();
    return true;
  }

  parentName(name) {
    const parent = this.audio(name)?.parent;
    return parent?.name || parent?._id || null;
  }

  updatePositionals() {
    for (const name of Object.keys(this.registry)) {
      const definition = this.registry[name];
      if (!definition.positional) continue;
      const audio = this.audio(name);
      if (!audio || !audio.isPlaying) continue;
      audio.parent?.updateWorldMatrix?.(true, false);
      audio.updateMatrixWorld(true);
    }
  }

  diagnose() {
    const sounds = [];
    for (const name of Object.keys(this.registry)) {
      const definition = this.registry[name];
      const audio = this.audio(name);
      sounds.push({
        name,
        file: definition.file,
        positional: Boolean(definition.positional),
        loop: audio?.loop ?? definition.loop,
        autoplay: definition.autoplay,
        sync: definition.sync,
        playing: audio?.isPlaying ?? false,
        volume: audio?.individualVolume ?? 0,
        gain: audio?.gain?.gain?.value ?? 0,
        offset: audio?.offset ?? 0,
        progress: audio?._progress ?? 0,
        parent: this.parentName(name),
        duration: this.duration(name),
      });
    }
    return {
      contextState: this.context.state,
      sampleRate: this.context.sampleRate,
      currentTime: this.context.currentTime,
      decoded: this.decodedCount,
      registered: this.soundCount,
      durations: Object.fromEntries(this.durations),
      playable: this.audios.size,
      syncSkew: this.syncSkew,
      sounds,
      active: sounds.filter((sound) => sound.playing).map((sound) => sound.name),
      errors: [...this.errors.entries()].map(([name, error]) => `${name}: ${error.message}`),
    };
  }

  dispose() {
    this.stopAll();
    for (const audio of this.audios.values()) {
      audio.disconnect();
    }
    this.audios.clear();
    this.buffers.clear();
    this.durations.clear();
  }
}

function clampOffset(offset, duration) {
  const safe = Math.max(0, Number(offset) || 0);
  return duration > 0 ? Math.min(safe, Math.max(0, duration - 0.001)) : 0;
}
