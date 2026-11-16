const CUSTOM_CURVES = {
  inOut1: [[0.5, 0, 0.1, 1, 1, 1]],
  inOut2: [[0.56, 0, 0, 1, 1, 1]],
  inOut3: [[0.6, 0, 0, 1, 1, 1]],

  tweaked: [
    [0.388, 0, 0.441, 0.356, 0.496, 0.496],
    [0.553, 0.641, 0.647, 1, 1, 1],
  ],
};

function bezier(p0, c1, c2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p3;
}

function segmentYAtX(x1, y1, x2, y2, x3, y3, x) {

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) * 0.5;
    if (bezier(0, x1, x2, x3, mid) < x) lo = mid;
    else hi = mid;
  }
  return bezier(0, y1, y2, y3, (lo + hi) * 0.5);
}

function easeFromPath(segments) {
  return (t) => {
    const x = Math.max(0, Math.min(1, t));
    let startX = 0;
    let startY = 0;
    for (let index = 0; index < segments.length; index++) {
      const [x1, y1, x2, y2, x3, y3] = segments[index];
      const last = index === segments.length - 1;
      if (x <= x3 || last) {

        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) * 0.5;
          if (bezier(startX, x1, x2, x3, mid) < x) lo = mid;
          else hi = mid;
        }
        return bezier(startY, y1, y2, y3, (lo + hi) * 0.5);
      }
      startX = x3;
      startY = y3;
    }
    return x;
  };
}

const linear = (t) => t;
const sineIn = (t) => 1 - Math.cos(t * Math.PI * 0.5);
const sineOut = (t) => Math.sin(t * Math.PI * 0.5);
const sineInOut = (t) => -0.5 * (Math.cos(Math.PI * t) - 1);
const cubicIn = (t) => t * t * t;
const cubicOut = (t) => (t - 1) * (t - 1) * (t - 1) + 1;
const cubicInOut = (t) => (t < 0.5 ? 4 * t * t * t : 0.5 * -Math.pow(2 - 2 * t, 3) + 1);

function elasticOut(amplitude = 1, period = 0.3) {
  const a = Math.max(1, Math.min(10, amplitude));
  const p = Math.max(1e-11, Math.min(2, period));
  const phase = (p / (2 * Math.PI)) * Math.asin(1 / a);
  const omega = (2 * Math.PI) / p;
  const inEase = (t) => (t === 0 || t === 1 ? t : -a * Math.pow(2, -10 * (1 - t)) * Math.sin((1 - t - phase) * omega));
  return (t) => 1 - inEase(1 - t);
}

function backOut(overshoot = 1.70158) {
  const inEase = (t) => (overshoot + 1) * t * t * t - overshoot * t * t;
  return (t) => 1 - inEase(1 - t);
}

export const EASES = {
  linear,
  none: linear,
  inOut1: easeFromPath(CUSTOM_CURVES.inOut1),
  inOut2: easeFromPath(CUSTOM_CURVES.inOut2),
  inOut3: easeFromPath(CUSTOM_CURVES.inOut3),
  tweaked: easeFromPath(CUSTOM_CURVES.tweaked),
  'power2.inOut': cubicInOut,
  power2InOut: cubicInOut,
  'power2.out': cubicOut,
  power2Out: cubicOut,
  'sine.inOut': sineInOut,
  'sine.out': sineOut,
  'sine.in': sineIn,
  backOut: backOut(),
  elasticOut: elasticOut(),
};

export function resolveEase(ease) {
  if (typeof ease === 'function') return ease;
  if (typeof ease !== 'string' || ease === '') return cubicInOut;
  if (EASES[ease]) return EASES[ease];
  const match = /^([\w.]+)\(([\d.,\s]+)\)$/.exec(ease);
  if (match) {
    const [, name, args] = match;
    const numbers = args.split(',').map(Number);
    if (name === 'elastic.out') return elasticOut(numbers[0] ?? 1, numbers[1] ?? 0.3);
    if (name === 'elastic.in') {
      const out = elasticOut(numbers[0] ?? 1, numbers[1] ?? 0.3);
      return (t) => 1 - out(1 - t);
    }
    if (name === 'back.out') return backOut(numbers[0] ?? 1.70158);
  }
  console.warn(`Tween: unknown ease "${ease}", using power2.inOut`);
  return cubicInOut;
}

const activeTweens = new Set();
let tweenId = 0;

export class Tween {
  constructor(target, options = {}) {
    if (!target || typeof target !== 'object') {
      throw new Error('Tween: target must be an object');
    }
    this.id = ++tweenId;
    this.target = target;
    this.to = options.to ?? {};
    this.duration = Math.max(0, options.duration ?? 0);
    this.delay = Math.max(0, options.delay ?? 0);
    this.ease = resolveEase(options.ease);
    this.onStart = options.onStart ?? null;
    this.onUpdate = options.onUpdate ?? null;
    this.onComplete = options.onComplete ?? null;
    this.paused = options.paused === true;

    this.elapsed = 0;
    this.started = false;
    this.complete = false;

    this.from = {};
    for (const key of Object.keys(this.to)) {
      const value = options.from && options.from[key] !== undefined ? options.from[key] : target[key];
      if (typeof value !== 'number' || typeof this.to[key] !== 'number') {
        throw new Error(`Tween: only numbers animate ("${key}")`);
      }
      this.from[key] = value;
    }

    if (this.paused) this.complete = false;
    else activeTweens.add(this);
  }

  stop() {
    this.complete = true;
    activeTweens.delete(this);
    return this;
  }

  tick(dt) {
    if (this.complete) return;
    this.elapsed += dt;
    this.apply();
  }

  apply() {
    const local = this.elapsed - this.delay;
    const progress = this.duration > 0 ? Math.min(1, Math.max(0, local / this.duration)) : local < 0 ? 0 : 1;

    if (!this.started) {
      this.started = true;
      this.onStart?.();
    }

    const eased = this.ease(progress);
    for (const key of Object.keys(this.to)) {
      this.target[key] = this.from[key] + (this.to[key] - this.from[key]) * eased;
    }
    this.onUpdate?.(eased, this);

    if (this.duration === 0 ? local >= 0 : local >= this.duration) {
      this.complete = true;
      activeTweens.delete(this);
      this.onComplete?.();
    }
  }

  then(resolve, reject) {
    if (this.complete) return Promise.resolve().then(resolve);
    return new Promise((res, rej) => {
      const previous = this.onComplete;
      this.onComplete = () => {
        previous?.();
        res();
      };
      this._reject = rej;
    }).then(resolve, reject);
  }
}

export function createTween(target, options) {
  return new Tween(target, options);
}

export function createDelayedCall(delay = 0, callback) {
  return new Tween({}, { duration: 0, delay, onComplete: callback });
}

export function wait(seconds = 0) {
  return createDelayedCall(seconds).then(() => undefined);
}

export function updateTweens(dt) {
  if (dt <= 0) return;

  for (const tween of Array.from(activeTweens)) tween.tick(dt);
}

export function activeTweenCount() {
  return activeTweens.size;
}

export function stopAllTweens() {
  for (const tween of Array.from(activeTweens)) tween.stop();
  activeTweens.clear();
}
