import { AUDIO_ROOT } from './manifest.js';

export let audioContext = null;

let contextPromise = null;

export function getAudioContext() {
  if (!contextPromise) {
    contextPromise = Promise.resolve().then(() => {
      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextCtor) throw new Error('AudioLoader: Web Audio is not supported in this browser');
      audioContext = new AudioContextCtor({ latencyHint: 'interactive' });
      return audioContext;
    });
  }
  return contextPromise;
}

function normalizeAudioName(name) {
  const clean = String(name).trim().replace(/^\.\//, '').replace(/^\//, '');
  return clean.includes('.') ? clean : `${clean}.ogg`;
}

export class AudioLoader {

  constructor({ assetRoot = AUDIO_ROOT } = {}) {
    this.assetRoot = assetRoot;

    this._cache = new Map();
  }

  load(name) {
    const key = normalizeAudioName(name);
    if (!this._cache.has(key)) {
      const promise = this._decode(key).catch((error) => {
        this._cache.delete(key);
        throw error;
      });
      this._cache.set(key, promise);
    }
    return this._cache.get(key);
  }

  loadAll(names) {
    return Promise.all(names.map((name) => this.load(name)));
  }

  async _decode(name) {
    const response = await fetch(`${this.assetRoot}${name}`);
    if (!response.ok) {
      throw new Error(`AudioLoader: "${name}" responded HTTP ${response.status} ${response.statusText}`);
    }
    const bytes = await response.arrayBuffer();

    const context = await getAudioContext();
    return context.decodeAudioData(bytes);
  }

  clearCache() {
    this._cache.clear();
  }
}

export const audioLoader = new AudioLoader();
