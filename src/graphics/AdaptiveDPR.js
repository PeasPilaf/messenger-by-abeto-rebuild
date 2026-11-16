import { events } from '../core/Events.js';
import { RENDER } from '../graphics/constants.js';

const SETTINGS = RENDER.adaptiveDpr;

export class AdaptiveDPR {

  constructor({ applyResolution, applyShadowQuality = null } = {}) {
    this.applyResolution = applyResolution;
    this.applyShadowQuality = applyShadowQuality;
    this.multiplier = SETTINGS.maxMultiplier;
    this.enabled = false;

    this._sampleStart = 0;
    this._frameCount = 0;
    this._lastDirection = 0;
    this._directionChanges = 0;
  }

  start() {
    this.enabled = true;
    this._sampleStart = performance.now() / 1000;
    this._frameCount = 0;
    events.on('average_fps_update', this.onAverageFPS, this);
  }

  stop() {
    this.enabled = false;
    events.off('average_fps_update', this.onAverageFPS, this);
  }

  onAverageFPS(fps) {
    if (!this.enabled) return;
    this._frameCount++;
    const now = performance.now() / 1000;
    const elapsed = now - this._sampleStart;
    if (elapsed < SETTINGS.sampleMs / 1000 || this._frameCount < SETTINGS.minFrames) return;

    this._sampleStart = now;
    this._frameCount = 0;

    let direction = 0;
    if (fps < SETTINGS.lowFpsThreshold) direction = -1;
    else if (fps >= SETTINGS.highFpsThreshold) direction = 1;
    if (direction === 0) return;

    if (direction !== this._lastDirection && this._lastDirection !== 0) {
      this._directionChanges++;
      if (this._directionChanges >= SETTINGS.maxDirectionChanges) {
        console.warn('Adaptive DPR stopped.');
        this.stop();
        return;
      }
    }
    this._lastDirection = direction;

    const next = Math.min(
      SETTINGS.maxMultiplier,
      Math.max(SETTINGS.minMultiplier, Math.round((this.multiplier + direction * SETTINGS.step) * 100) / 100),
    );
    if (next === this.multiplier) return;
    this.multiplier = next;

    this.applyResolution(next);
    if (this.applyShadowQuality) this.applyShadowQuality(next);
    events.emit('adaptive_dpr_update', next);
  }
}
