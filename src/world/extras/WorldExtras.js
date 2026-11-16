import * as THREE from 'three';

import { createExtrasShared } from './ExtrasMaterial.js';
import { TreeLeaves } from './TreeLeaves.js';
import { GrassBlades } from './GrassBlades.js';
import { Cables } from './Cables.js';
import { Smoke } from './Smoke.js';
import { Waterfalls } from './Waterfalls.js';
import { Butterflies } from './Butterflies.js';
import { Birds, FLOCKS } from './Birds.js';
import { Emojis } from './Emojis.js';

const FALLBACK_UP = new THREE.Vector3(0, 1, 0);

export class WorldExtras {

  constructor({ app, scene, geometryLoader, textureLoader, camera = null, character = null }) {
    this.app = app;

    const isPresentScene = scene && typeof scene.getCharacter === 'function';
    this.present = isPresentScene ? scene : null;
    this.scene = isPresentScene ? scene.scene : scene;
    this.geometryLoader = geometryLoader;
    this.textureLoader = textureLoader;
    this.camera = camera;
    this.character = character;

    this.shared = createExtrasShared();

    const drawScene = this.scene;
    this.leaves = new TreeLeaves({ scene: drawScene, shared: this.shared });
    this.grass = new GrassBlades({ scene: drawScene, shared: this.shared });
    this.cables = new Cables({ scene: drawScene, shared: this.shared });
    this.smoke = new Smoke({ scene: drawScene, shared: this.shared });
    this.waterfalls = new Waterfalls({ scene: drawScene, shared: this.shared });
    this.butterflies = new Butterflies({ scene: drawScene, shared: this.shared });
    this.birds = FLOCKS.map((flock) => new Birds({ scene: drawScene, shared: this.shared, flock }));
    this.emojis = new Emojis({ scene: drawScene, shared: this.shared });

    this.systems = {
      leaves: this.leaves,
      grass: this.grass,
      cables: this.cables,
      smoke: this.smoke,
      waterfalls: this.waterfalls,
      butterflies: this.butterflies,
      birds: { object: () => this.birds.map((flock) => flock.object()), stats: () => mergeStats(this.birds) },
      emojis: this.emojis,
    };

    this._scratch = new THREE.Vector3();
  }

  async load() {
    const loaders = { geometryLoader: this.geometryLoader, textureLoader: this.textureLoader };
    await Promise.all([
      this.leaves.load(loaders),
      this.grass.load(loaders),
      this.cables.load(loaders),
      this.smoke.load(loaders),
      this.waterfalls.load(loaders),
      this.butterflies.load(loaders),
      ...this.birds.map((flock) => flock.load(loaders)),
      this.emojis.load(loaders),
    ]);
    this.setSize(this.app?.resolution?.x, this.app?.resolution?.y);
    if (this.camera) this.setCamera(this.camera);
    return this;
  }

  setSize(width, height) {
    const w = width || this.app?.resolution?.x || 1;
    const h = height || this.app?.resolution?.y || 1;
    this.shared.resolution.value.set(w, h);
  }

  setCamera(camera) {
    this.camera = camera;
    this.shared.uNearFar.value.set(camera.near, camera.far);
    this.waterfalls.setCamera(camera);
  }

  update(time, dt, context = null) {
    const { shared } = this;
    shared.time.value = time;

    if (context && typeof context.getCharacter === 'function') this.present = context;
    const sceneContext = context && typeof context.getCharacter === 'function' ? context : this.present;
    let character = this.character;
    if (sceneContext) {
      character = sceneContext.getCharacter() ?? sceneContext.player ?? character;
      if (!this.camera && sceneContext.camera) this.setCamera(sceneContext.camera);
    } else if (context && context.position) {
      character = context;
    }

    const position = character?.position;
    if (position) {
      shared.charPos.value.copy(position);
      shared.charSpeed.value = character.velocity ? character.velocity.length() : 0;
    }

    if (this.app?.resolution) this.shared.resolution.value.set(this.app.resolution.x, this.app.resolution.y);

    for (const system of [this.leaves, this.grass, this.cables, this.smoke, this.waterfalls,
      this.butterflies, ...this.birds, this.emojis]) {
      system.update(time, dt, character);
    }
    this.waterfalls.setCamera(this.camera ?? this.app?.pipeline?.camera ?? FALLBACK_CAMERA);
  }

  setWaterSceneTextures(colorTexture, infoTexture) {
    this.waterfalls.setSceneTextures(colorTexture, infoTexture);
  }

  get waterMeshes() {
    return this.waterfalls.waterMeshes;
  }

  setVisible(name, visible) {
    const system = this.systems[name];
    if (!system) return;
    const objects = system.object ? system.object() : system;
    for (const object of Array.isArray(objects) ? objects : [objects]) {
      if (object) object.visible = visible;
    }
  }

  stats() {
    const result = {};
    for (const [name, system] of Object.entries(this.systems)) {
      result[name] = system.stats ? system.stats() : { triangles: 0, visible: 0, total: 0 };
    }
    return result;
  }
}

function mergeStats(birds) {
  let triangles = 0;
  let visible = 0;
  let total = 0;
  for (const flock of birds) {
    const stats = flock.stats();
    triangles += stats.triangles;
    visible += stats.visible;
    total += stats.total;
  }
  return { triangles, visible, total };
}

const FALLBACK_CAMERA = new THREE.PerspectiveCamera(45, 1, 0.2, 175);

export { FLOCKS };
