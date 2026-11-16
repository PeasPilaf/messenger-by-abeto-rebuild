import { AudioContext as ThreeAudioContext, AudioListener } from 'three';

import { getAudioContext } from '../assets/AudioLoader.js';
import { events } from '../core/Events.js';
import { timeToConstant } from './AudioMath.js';
import { readMutePreference, writeMutePreference } from './MuteStorage.js';

export const MUTE_RAMP = 1;

export const HIDE_RAMP = 1.5;

export const SHOW_RAMP = 2;

export const FIRST_UNMUTE_RAMP = 3;

export const GLOBAL_VOLUME_TIME = 0.2;

const _IOS = /(ipod|iphone|ipad)/i;

export class AudioSession {

  constructor({ storage = globalThis.localStorage } = {}) {
    this._storage = storage;
    this.context = null;
    this.listener = null;

    this._volume = 1;
    this._muted = true;
    this._visible = typeof document === 'undefined' ? true : !document.hidden;
    this._masterTarget = 0;
    this._started = false;
    this._pending = false;
    this._resuming = null;
    this._runningCallbacks = [];
    this._gesture = null;

    this._installGestureUnlock();
    this._installVisibility();
  }

  async load() {
    this.context = await getAudioContext();

    ThreeAudioContext.setContext(this.context);
    this.listener = new AudioListener();

    this.listener.gain.gain.value = 0;
    this._masterTarget = 0;
    if (this._pending || this.context.state === 'running') this._onContextRunning();
    return this;
  }

  resume() {
    if (!this._resuming) {
      this._resuming = this._resume().finally(() => {
        this._resuming = null;
      });
    }
    return this._resuming;
  }

  async _resume() {
    try {
      const context = await getAudioContext();
      this.context = this.context ?? context;
      await context.resume();
      if (this.listener) this._onContextRunning();
      else this._pending = true;
      return context.state;
    } catch (error) {

      console.warn('audio context error:', error);
      return 'error';
    }
  }

  whenRunning(callback) {
    this._runningCallbacks.push(callback);
    if (this._started) this._invokeRunningCallbacks();
    return this;
  }

  _invokeRunningCallbacks() {
    if (this._runningCallbacks.length === 0) return;
    const callbacks = this._runningCallbacks;
    this._runningCallbacks = [];
    for (const callback of callbacks) callback();
  }

  _onContextRunning() {
    if (this._started) return;
    this._started = true;
    this._removeGestureUnlock();

    const stored = readMutePreference(this._storage);
    if (stored === true) {
      this._muted = true;
    } else if (this._muted) {
      events.emit('audio_mute_toggle');
    }

    this.applyMasterVolume(FIRST_UNMUTE_RAMP);

    this._invokeRunningCallbacks();
  }

  get muted() {
    return this._muted;
  }

  get volume() {
    return this._volume;
  }

  get started() {
    return this._started;
  }

  get visible() {
    return this._visible;
  }

  get masterTarget() {
    return this._masterTarget;
  }

  setMuted(muted, { ramp = MUTE_RAMP, persist = true } = {}) {
    const next = Boolean(muted);
    this._muted = next;
    if (persist) writeMutePreference(next, this._storage);
    this.applyMasterVolume(ramp);
    events.emit('audio_update_mute', next);
    return next;
  }

  toggleMute(options) {
    return this.setMuted(!this._muted, options);
  }

  setGlobalVolume(volume, time = GLOBAL_VOLUME_TIME) {
    this._volume = Math.max(0, Number(volume) || 0);
    this.applyMasterVolume(time);
    return this._volume;
  }

  applyMasterVolume(seconds) {
    if (!this.listener || !this.context) return;
    let target = this._volume;
    if (!this._started || !this._visible || this._muted) target = 0;
    if (target === this._masterTarget) return;
    this._masterTarget = target;
    const now = Math.max(0.1, this.context.currentTime);
    const timeConstant = timeToConstant(this.listener.gain.gain.value, target, Math.max(0.01, seconds));
    this.listener.gain.gain.setTargetAtTime(target, now, timeConstant);
  }

  setVisible(visible) {
    if (visible === this._visible) return;
    this._visible = visible;
    this.applyMasterVolume(visible ? SHOW_RAMP : HIDE_RAMP);
    if (visible && this._started && this.context && this.context.state !== 'running') {

      const iOS = typeof navigator !== 'undefined' && _IOS.test(navigator.userAgent || '');
      const resume = () => this.context?.resume().catch(() => {});
      if (iOS) setTimeout(resume, 500);
      else resume();
    }
  }

  _installGestureUnlock() {
    if (typeof document === 'undefined') return;
    this._gesture = () => this.resume();

    document.addEventListener('click', this._gesture);
    document.addEventListener('touchend', this._gesture);
    document.addEventListener('keydown', this._gesture);
    events.on('touch_end', this._gesture);
    events.on('keydown', this._gesture);
  }

  _removeGestureUnlock() {
    if (!this._gesture || typeof document === 'undefined') return;
    document.removeEventListener('click', this._gesture);
    document.removeEventListener('touchend', this._gesture);
    document.removeEventListener('keydown', this._gesture);
    events.off('touch_end', this._gesture);
    events.off('keydown', this._gesture);
    this._gesture = null;
  }

  _installVisibility() {
    if (typeof document !== 'undefined') {
      this._visibilityHandler = () => this.setVisible(!document.hidden);
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
    this._busVisibility = (visible) => this.setVisible(Boolean(visible));
    events.on('visibility_change', this._busVisibility);
  }

  analyse() {
    return {
      state: this.context?.state ?? 'none',
      sampleRate: this.context?.sampleRate ?? 0,
      currentTime: this.context?.currentTime ?? 0,
      started: this._started,
      muted: this._muted,
      visible: this._visible,
      volume: this._volume,
      target: this._masterTarget,
      gain: this.listener?.gain.gain.value ?? 0,
    };
  }

  dispose() {
    this._removeGestureUnlock();
    if (this._visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    if (this._busVisibility) events.off('visibility_change', this._busVisibility);
    this._runningCallbacks = [];
    this.listener?.gain.disconnect();
  }
}
