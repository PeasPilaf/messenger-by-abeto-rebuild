export const EASES = {
  none: (t) => t,
  linear: (t) => t,
  power2in: (t) => t * t,
  power2out: (t) => 1 - (1 - t) * (1 - t),
  power2inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),

  inOut1: (t) => (t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t)),

  inOut3: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - 16 * (1 - t) ** 5),
  sinein: (t) => 1 - Math.cos((t * Math.PI) / 2),
  elasticout: (t) => {
    if (t === 0 || t === 1) return t;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

function read(target, key) {
  const current = target[key];
  return current && typeof current === 'object' ? current.value : current;
}

function write(target, key, value) {
  const current = target[key];
  if (current && typeof current === 'object') current.value = value;
  else target[key] = value;
}

export class Tweens {
  constructor() {
    this.active = [];
  }

  to(target, spec) {
    const tween = {
      target,
      from: spec.from ?? null,
      to: spec.to ?? {},
      duration: Math.max(0, spec.duration ?? 0),
      delay: Math.max(0, spec.delay ?? 0),
      ease: typeof spec.ease === 'function' ? spec.ease : EASES[spec.ease ?? 'none'] ?? EASES.none,
      onStart: spec.onStart,
      onUpdate: spec.onUpdate,
      onComplete: spec.onComplete,
      elapsed: 0,
      started: false,
      done: false,
      keys: Object.keys(spec.to ?? {}),
      kill: () => this._kill(tween),
    };
    if (spec.overwrite !== false) this._killConflicts(tween);
    this.active.push(tween);
    return tween;
  }

  after(delay, fn) {
    return this.to({}, { to: {}, delay, duration: 0, onComplete: fn });
  }

  kill(target, keys = null) {
    for (const tween of this.active.slice()) {
      if (tween.target !== target) continue;
      if (keys && !keys.some((key) => tween.keys.includes(key))) continue;
      this._kill(tween);
    }
  }

  update(dt) {
    for (const tween of this.active.slice()) {
      if (tween.done) continue;
      tween.elapsed += dt;
      if (tween.elapsed < tween.delay) continue;
      if (!tween.started) {
        tween.started = true;
        if (tween.from) {
          for (const key of tween.keys) write(tween.target, key, read(tween.from, key));
        }
        tween.onStart?.();
      }
      const local = tween.duration > 0 ? (tween.elapsed - tween.delay) / tween.duration : 1;
      const t = Math.min(1, Math.max(0, local));
      const eased = tween.ease(t);
      for (const key of tween.keys) {
        const from = tween.from ? read(tween.from, key) : read(tween.target, key);
        write(tween.target, key, from + (read(tween.to, key) - from) * eased);
      }
      tween.onUpdate?.(eased);
      if (t >= 1) this._complete(tween);
    }
  }

  _complete(tween) {
    if (tween.done) return;
    tween.done = true;
    this.active.splice(this.active.indexOf(tween), 1);
    tween.onComplete?.();
  }

  _kill(tween) {
    if (tween.done) return;
    tween.done = true;
    const index = this.active.indexOf(tween);
    if (index !== -1) this.active.splice(index, 1);
  }

  _killConflicts(tween) {
    for (const other of this.active.slice()) {
      if (other.target !== tween.target) continue;
      if (!tween.keys.some((key) => other.keys.includes(key))) continue;
      this._kill(other);
    }
  }
}
