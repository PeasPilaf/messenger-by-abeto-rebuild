import { clamp } from './AudioMath.js';

const EASES = {
  linear: (t) => t,
  none: (t) => t,
  'power2.inOut': (t) => (t < 0.5 ? (2 * t) ** 3 / 2 : 1 - (2 - 2 * t) ** 3 / 2),
};

export function ease(name = 'power2.inOut', t) {
  return (EASES[name] || EASES['power2.inOut'])(clamp(t, 0, 1));
}

export class Tween {
  constructor({
    target = {},
    from = null,
    to = {},
    duration = 0,
    delay = 0,
    ease: easeName = 'power2.inOut',
    key = null,
    onStart = null,
    onUpdate = null,
    onComplete = null,
    onCancel = null,
  }) {
    this.target = target;
    this.from = from ? { ...from } : null;
    this.to = { ...to };
    this.duration = Math.max(0, duration);
    this.delay = Math.max(0, delay);
    this.easeName = easeName;
    this.key = key;
    this.onStart = onStart;
    this.onUpdate = onUpdate;
    this.onComplete = onComplete;
    this.onCancel = onCancel;
    this._elapsed = 0;
    this._started = false;
    this._done = false;
    this._cancelled = false;
  }

  get done() {
    return this._done || this._cancelled;
  }

  cancel() {
    if (this.done) return;
    this._cancelled = true;
    if (this.onCancel) this.onCancel();
  }

  tick(dt) {
    if (this.done) return true;
    this._elapsed += dt;
    if (this._elapsed < this.delay) return false;

    if (!this._started) {
      this._started = true;

      if (!this.from) {
        this.from = {};
        for (const property in this.to) this.from[property] = this.target[property];
      }
      if (this.onStart) this.onStart();
    }

    const progress = this.duration === 0 ? 1 : clamp((this._elapsed - this.delay) / this.duration, 0, 1);
    const curve = ease(this.easeName, progress);
    for (const property in this.to) {
      this.target[property] = this.from[property] + (this.to[property] - this.from[property]) * curve;
    }
    if (this.onUpdate) this.onUpdate();

    if (progress >= 1) {
      this._done = true;
      if (this.onComplete) this.onComplete();
      return true;
    }
    return false;
  }
}

export class TweenManager {
  constructor() {

    this._tweens = [];
  }

  get size() {
    return this._tweens.length;
  }

  tween(options) {
    if (options.key != null) {
      for (const existing of this._tweens) {
        if (existing.key === options.key) existing.cancel();
      }
    }
    const tween = new Tween(options);

    this._tweens.push(tween);
    return tween;
  }

  after(delay, fn) {
    return this.tween({ target: {}, to: {}, duration: 0, delay, onComplete: fn });
  }

  update(dt) {
    if (this._tweens.length === 0) return;

    for (const tween of this._tweens.slice()) {
      tween.tick(dt);
    }
    this._tweens = this._tweens.filter((tween) => !tween.done);
  }

  clear() {
    for (const tween of this._tweens) tween.cancel();
    this._tweens.length = 0;
  }
}
