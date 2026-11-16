import { AnimationMixer } from 'three';

export const CLIP_NAMES = Object.freeze(['idle', 'run', 'sprint', 'air', 'afk1', 'afk2', 'afk3']);

export const ANIMATION_OPTIONS = Object.freeze([
  { speed: 1 }, { speed: 1.1 }, { speed: 1.1 }, { speed: 1 }, { speed: 1 },
]);

export const ANIMATION_LERP = 0.1;
export const SPRINT_LERP = 0.05;
export const SPEED_FIT = Object.freeze([0.001, 0.075]);
export const SPRINT_FIT = Object.freeze([1.8, 2.1]);
export const INACTIVE_ANIMATIONS = Object.freeze([4, 5, 6]);
export const INACTIVE_TIME = 30;
const IDLE_SPEED_EPSILON = 1e-5;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (from, to, alpha) => (1 - alpha) * from + alpha * to;

const efit = (value, a1, a2, b1, b2) => b1 + ((value - a1) * (b2 - b1)) / (a2 - a1);

const fit = (value, a1, a2, b1, b2) => efit(clamp(value, Math.min(a1, a2), Math.max(a1, a2)), a1, a2, b1, b2);

const lerpCoefFPS = (t, ratio) => 1 - Math.pow(1 - t, ratio);

const secureLerp = (value) => (value > 0.9999 ? 1 : value < 1e-4 ? 0 : value);

export class AvatarAnimations {

  constructor(
    mesh,
    clips,
    {
      animationOffset = Math.random() * 100,
      inactiveTime = INACTIVE_TIME,
      inactiveAnimations = INACTIVE_ANIMATIONS,
      animationOptions = ANIMATION_OPTIONS,
      animationLerp = ANIMATION_LERP,
      sprintLerp = SPRINT_LERP,
    } = {},
  ) {
    if (clips.length !== CLIP_NAMES.length) {
      throw new Error(`AvatarAnimations: expected ${CLIP_NAMES.length} clips, got ${clips.length}`);
    }
    this.mesh = mesh;
    this.clips = clips;
    this.mixer = new AnimationMixer(mesh);
    this.actions = clips.map((clip, index) => {
      const action = this.mixer.clipAction(clip);
      action.setEffectiveTimeScale(animationOptions[index]?.speed || 1);
      action.play();
      action.enabled = false;
      return action;
    });

    this._animationOffset = animationOffset;
    this._inactiveTime = inactiveTime * 1000;
    this._inactiveAnimations = inactiveAnimations.slice();
    this._animationLerp = animationLerp;
    this._sprintLerp = sprintLerp;

    this._weights = new Float64Array(CLIP_NAMES.length);
    this._weights[0] = 1;
    this._speed = 0;
    this._airborne = false;
    this._interacting = false;
    this._animation = 0;
    this._inactive = false;
    this._inactiveMilliseconds = 0;
    this._time = 0;
    this._clipOverride = null;
  }

  setSpeed(speed) {
    this._speed = Math.max(0, Number(speed) || 0);
  }

  setVelocity(velocity, up) {
    const magnitude = velocity.length();
    if (magnitude < 0.001) {
      this._speed = 0;
      return;
    }
    const verticalFraction = Math.abs(velocity.clone().normalize().dot(up));
    this._speed = lerp(this._speed, magnitude * (1 - verticalFraction), 0.125);
  }

  setAirborne(airborne) {
    this._airborne = Boolean(airborne);
  }

  setInteracting(interacting) {
    this._interacting = Boolean(interacting);
  }

  setClipOverride(index) {
    if (index === null) {
      this._clipOverride = null;
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= CLIP_NAMES.length) {
      throw new RangeError(`AvatarAnimations: clip index must be 0..${CLIP_NAMES.length - 1} or null`);
    }
    this._clipOverride = index;
  }

  update(deltaSeconds) {
    const delta = Math.max(0, deltaSeconds);

    const ratio = delta * 60;
    this._time += delta;

    if (this._clipOverride === null) {
      this._updateInactiveTimer(delta);
      this._updateWeights(ratio);
    } else {
      this._weights.fill(0);
      this._weights[this._clipOverride] = 1;
    }
    this._applyWeights();

    this.mixer.setTime(this._time + this._animationOffset);
  }

  _updateInactiveTimer(deltaSeconds) {
    const idle = this._speed < IDLE_SPEED_EPSILON && !this._airborne && !this._interacting;
    if (!idle) {
      this._setActive();
      return;
    }
    this._inactiveMilliseconds += deltaSeconds * 1000;
    if (this._inactiveMilliseconds > this._inactiveTime && this._animation === 0) {
      this._setInactive();
    }
  }

  _setInactive() {
    if (this._inactive) return;
    this._inactive = true;
    this._animation =
      this._inactiveAnimations[Math.floor(Math.random() * this._inactiveAnimations.length)];
  }

  _setActive() {
    this._inactiveMilliseconds = 0;
    if (!this._inactive) return;
    this._inactive = false;
    this._animation = 0;
  }

  _updateWeights(ratio) {
    const animationLerp = lerpCoefFPS(this._animationLerp, ratio);
    const sprintLerp = lerpCoefFPS(this._sprintLerp, ratio);
    const weights = this._weights;

    const speedRatio = efit(this._speed, SPEED_FIT[0], SPEED_FIT[1], 0, 1);

    weights[0] = secureLerp(lerp(weights[0], fit(speedRatio, 0, 1, 1, 0), animationLerp));
    weights[2] = secureLerp(lerp(weights[2], fit(speedRatio, SPRINT_FIT[0], SPRINT_FIT[1], 0, 1), sprintLerp));
    weights[1] = 1 - weights[2];

    const runMask = 1 - weights[0];
    weights[1] *= runMask;
    weights[2] *= runMask;

    weights[3] = secureLerp(lerp(weights[3], this._airborne ? 1 : 0, animationLerp));

    const inactiveAllowed = !this._airborne;
    for (let index = 4; index < weights.length; index++) {
      const target = inactiveAllowed && this._animation === index ? 1 : 0;
      weights[index] = secureLerp(lerp(weights[index], target, animationLerp));
    }
  }

  _applyWeights() {
    for (let index = 0; index < this.actions.length; index++) {
      let laterWeight = 0;
      for (let later = this.actions.length - 1; later > Math.max(2, index); later--) {
        laterWeight += this._weights[later];
      }
      const weight = this._weights[index] * (1 - clamp(laterWeight, 0, 1));
      const action = this.actions[index];
      action.enabled = weight > 0;
      action.setEffectiveWeight(weight);
    }
  }

  get weights() {
    return this._weights;
  }

  get currentClipIndex() {
    if (this._clipOverride !== null) return this._clipOverride;
    let best = 0;
    for (let index = 1; index < this._weights.length; index++) {
      if (this._weights[index] > this._weights[best]) best = index;
    }
    return best;
  }

  get currentClipName() {
    return CLIP_NAMES[this.currentClipIndex];
  }

  get currentClipTime() {
    const action = this.actions[this.currentClipIndex];
    return action ? action.time : 0;
  }

  get currentClipFps() {
    return this.clips[this.currentClipIndex]?.userData?.fps ?? 0;
  }

  get currentClipDuration() {
    return this.clips[this.currentClipIndex]?.duration ?? 0;
  }

  get animationIndex() {
    return this._animation;
  }

  get forcedClipIndex() {
    return this._clipOverride;
  }

  get isInactive() {
    return this._inactive;
  }

  dispose() {
    this.mixer.stopAllAction();
    if (this.mesh) this.mixer.uncacheRoot(this.mesh);
    this.actions = [];
    this.clips = [];
    this.mixer = null;
  }
}
