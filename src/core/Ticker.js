import { events } from './Events.js';

export const TARGET_FPS = 60;
export const TARGET_FRAME_MS = 1000 / TARGET_FPS;

const MAX_DELTA_MS = 100;
const FPS_SAMPLE_MS = 500;
const FPS_MIN_FRAMES = 5;

export const PHASES = ['internal_prerender', 'prerender', 'render', 'postrender', 'internal_postrender'];

export class Ticker {
  constructor() {
    this._time = 0;
    this._delta = 0;
    this._ratio = 1;
    this._frame = 0;
    this._averageFPS = TARGET_FPS;
    this._maxFPS = TARGET_FPS;
    this._running = false;
    this._lastNow = 0;
    this._timeScale = 1;

    this._fpsFrameCount = 0;
    this._fpsElapsed = 0;

    this._boundTick = this._tick.bind(this);
  }

  on(phase, fn, context = null) {
    events.on(phase, fn, context);
    return this;
  }

  off(phase, fn, context = null) {
    events.off(phase, fn, context);
    return this;
  }

  get time() { return this._time; }
  get delta() { return this._delta; }
  get ratio() { return this._ratio; }
  get frame() { return this._frame; }
  get averageFPS() { return this._averageFPS; }
  get maxFPS() { return this._maxFPS; }

  get timeScale() { return this._timeScale; }
  set timeScale(value) { this._timeScale = value; }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastNow = performance.now();
    this._requestNext();
  }

  stop() {
    this._running = false;
  }

  _requestNext() {
    requestAnimationFrame(this._boundTick);
  }

  _tick(now) {
    if (!this._running) return;

    const rawDeltaMs = now - this._lastNow;
    this._lastNow = now;

    this._frame++;
    const deltaSeconds = (Math.min(MAX_DELTA_MS, rawDeltaMs) * this._timeScale) / 1000;
    this._delta = deltaSeconds;
    this._time += deltaSeconds;
    this._ratio = deltaSeconds / (TARGET_FRAME_MS / 1000);

    this._accumulateFPS(rawDeltaMs);

    for (const phase of PHASES) events.emit(phase);

    this._requestNext();
  }

  _accumulateFPS(rawDeltaMs) {
    this._fpsFrameCount++;
    this._fpsElapsed += rawDeltaMs;
    if (this._fpsElapsed < FPS_SAMPLE_MS || this._fpsFrameCount < FPS_MIN_FRAMES) return;

    const fps = (this._fpsFrameCount * 1000) / this._fpsElapsed;
    this._averageFPS = fps;
    this._maxFPS = Math.max(this._maxFPS, fps);
    this._fpsFrameCount = 0;
    this._fpsElapsed = 0;
    events.emit('average_fps_update', fps);
  }
}

export const ticker = new Ticker();
