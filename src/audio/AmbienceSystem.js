import { fit } from './AudioMath.js';

export const AMBIENCE_BASE_NAME = 'ambiance-base';
export const AMBIENCE_BASE_VOLUME = 0.5;

export const ZONE_VOLUME = 0.5;

export const ZONES = Object.freeze([
  Object.freeze({ name: 'forest', center: Object.freeze([-13.4694, -14.7504, 1.36152]), radius: 15.4, margin: 4 }),
  Object.freeze({ name: 'city', center: Object.freeze([27.6687, 13.6836, 8.14707]), radius: 27.5, margin: 10 }),
  Object.freeze({ name: 'beach', center: Object.freeze([-11.8381, 12.2255, -1.87004]), radius: 12, margin: 3.5 }),
  Object.freeze({ name: 'factory', center: Object.freeze([-2.06543, 2.01072, -32.7937]), radius: 22.5, margin: 5 }),
  Object.freeze({ name: 'waterfalls', center: Object.freeze([11.2153, -18.8393, -9.09714]), radius: 12, margin: 2 }),
  Object.freeze({ name: 'temple', center: Object.freeze([-7.21651, 34.6679, -5.4496]), radius: 10, margin: 3 }),
]);

export const SPAWN_POINTS = Object.freeze({
  city: Object.freeze([13.93, 19.31, 8.38]),
  outside: Object.freeze([5.81, 5.8, 25.78]),
});

export class AmbienceSystem {

  constructor({ audio }) {
    this.audio = audio;

    this.weights = Object.fromEntries(ZONES.map((zone) => [zone.name, 0]));

    this.zone = null;
    this._baseSet = false;

    this._lastVolume = new Map(ZONES.map((sphere) => [sphere.name, -1]));
  }

  update(position) {
    if (!position) return this.state;
    const [x, y, z] = toXYZ(position);

    let zone = null;
    let weight = 0;
    for (const sphere of ZONES) {
      const distance = Math.hypot(x - sphere.center[0], y - sphere.center[1], z - sphere.center[2]);
      const inner = Math.max(0, sphere.radius - sphere.margin);
      const w = fit(distance, sphere.radius, inner, 0, 1);
      if (w > 0) {
        zone = sphere.name;
        weight = w;
        break;
      }
    }

    for (const name of Object.keys(this.weights)) this.weights[name] = 0;
    if (zone) this.weights[zone] = weight;
    this.zone = zone;

    if (!this._baseSet && this.audio.setVolume(AMBIENCE_BASE_NAME, AMBIENCE_BASE_VOLUME)) {
      this._baseSet = true;
    }
    for (const sphere of ZONES) {
      const volume = this.weights[sphere.name] * ZONE_VOLUME;

      if (Math.abs(volume - this._lastVolume.get(sphere.name)) > 1e-4
        && this.audio.setVolume(`ambiance-${sphere.name}`, volume)) {
        this._lastVolume.set(sphere.name, volume);
      }
    }
    return this.state;
  }

  get state() {
    return {
      zone: this.zone,
      weight: this.zone ? this.weights[this.zone] : 0,
      weights: { ...this.weights },
      volumes: Object.fromEntries(
        ZONES.map((sphere) => [`ambiance-${sphere.name}`, this.weights[sphere.name] * ZONE_VOLUME]),
      ),
      baseVolume: AMBIENCE_BASE_VOLUME,
    };
  }
}

function toXYZ(position) {
  if (Array.isArray(position)) return [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0];
  return [position.x ?? 0, position.y ?? 0, position.z ?? 0];
}
