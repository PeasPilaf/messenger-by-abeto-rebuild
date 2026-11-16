import { events } from '../core/Events.js';
import { clamp, lerpFPS } from './AudioMath.js';

export const STEP_DRY_NAME = 'footsteps';

export const STEP_WET_NAME = 'footsteps-water';

export const STEP_MAX_VOLUME = 0.2;

export const WATERLINE_RADIUS = 22;

export const STEP_LERP = 0.25;

export const GROUND = 0;

export const JUMP_SOUND = 'jump';
export const LAND_SOUND = 'land';

const RUN_WEIGHT = 1;
const SPRINT_WEIGHT = 2;

export class Footsteps {

  constructor({ audio }) {
    this.audio = audio;

    this.walk = 0;

    this.walkWater = 0;
    this._attached = false;
    this._onJump = this._onJump.bind(this);
    this._onLand = this._onLand.bind(this);
    this._lastDry = -1;
    this._lastWet = -1;
  }

  attach() {
    if (this._attached) return this;
    this._attached = true;
    events.on('character_physics_jump', this._onJump, this);
    events.on('character_physics_land', this._onLand, this);
    return this;
  }

  detach() {
    if (!this._attached) return;
    this._attached = false;
    events.off('character_physics_jump', this._onJump, this);
    events.off('character_physics_land', this._onLand, this);
  }

  update(player, ratio = 1) {
    const medium = player?.medium ?? GROUND;
    const weights = player?.weights ?? [];
    const ground = medium === GROUND ? 1 : 0;
    const locomotion = clamp((weights[RUN_WEIGHT] ?? 0) + (weights[SPRINT_WEIGHT] ?? 0), 0, 1) * ground;
    const walking = locomotion > 0.5 ? 1 : 0;
    this.walk = lerpFPS(this.walk, walking, STEP_LERP, ratio);

    const distance = positionLength(player?.position);
    this._positionLength = distance;
    const low = distance < WATERLINE_RADIUS ? 1 : 0;
    this.walkWater = lerpFPS(this.walkWater, walking * low, STEP_LERP, ratio);

    const dry = Math.max(0, this.walk - this.walkWater) * STEP_MAX_VOLUME;
    const wet = this.walkWater * STEP_MAX_VOLUME;

    if (Math.abs(dry - this._lastDry) > 1e-4 && this.audio.setVolume(STEP_DRY_NAME, dry)) {
      this._lastDry = dry;
    }
    if (Math.abs(wet - this._lastWet) > 1e-4 && this.audio.setVolume(STEP_WET_NAME, wet)) {
      this._lastWet = wet;
    }
    return this.state;
  }

  _onJump() {
    this.audio.play(JUMP_SOUND);
  }

  _onLand() {
    this.audio.play(LAND_SOUND);
  }

  get state() {
    return {
      walking: this.walk,
      water: this.walkWater,
      dryVolume: Math.max(0, this.walk - this.walkWater) * STEP_MAX_VOLUME,
      waterVolume: this.walkWater * STEP_MAX_VOLUME,
      positionLength: this._positionLength ?? null,
      waterlineRadius: WATERLINE_RADIUS,
    };
  }
}

function positionLength(position) {
  if (!position) return 0;
  if (typeof position.length === 'function') return position.length();
  return Math.hypot(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
}
