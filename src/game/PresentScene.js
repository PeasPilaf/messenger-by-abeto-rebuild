import * as THREE from 'three';

import { COLORS, OUTLINE } from '../graphics/constants.js';
import { createPainterlyMaterial } from '../graphics/PainterlyMaterial.js';
import { Terrain } from '../world/Terrain.js';
import { Water } from '../world/Water.js';
import { Sky } from '../world/Sky.js';
import { FollowSun } from './FollowSun.js';

export const SPAWNS = [
  { position: [5.81095, 5.80205, 25.7794], rotation: Math.PI * 0.625, radius: 1.15 },
  { position: [13.9316, 19.3062, 8.38147], rotation: Math.PI * 0.55, radius: 1.15 },
];

export class PresentScene {

  constructor({ app, camera, textures, shared, geometryLoader, spawnIndex }) {
    this.app = app;
    this.camera = camera;
    this.textures = textures;
    this.shared = shared;
    this.geometryLoader = geometryLoader;

    const query = new URLSearchParams(location.search);
    const pin = query.get('spawn');
    const index = pin !== null ? Number(pin) : Math.floor(Math.random() * SPAWNS.length);
    this.spawnIndex = Number.isInteger(spawnIndex) ? spawnIndex : index;
    this.spawn = SPAWNS[this.spawnIndex % SPAWNS.length];

    this.scene = new THREE.Scene();

    this.systems = [];

    this.player = null;

    this.focus = new THREE.Vector3().fromArray(this.spawn.position);
  }

  async load() {

    this.sun = new FollowSun().addTo(this.scene);

    this.sky = new Sky(this.scene, this.textures.clouds);
    this.sky.setResolution(this.app.resolution.x, this.app.resolution.y);
    this.app.onResize((w, h) => this.sky.setResolution(w, h));

    this.terrainMaterial = createPainterlyMaterial({ kind: 'terrain', shared: this.shared });

    this.terrain = new Terrain({
      scene: this.scene,
      loadGeometry: (name) => this.geometryLoader.load(name),
      material: this.terrainMaterial,
    });

    this.water = new Water({
      renderer: this.app.renderer,
      loadGeometry: (name) => this.geometryLoader.load(name),
      noiseTexture: this.textures.waterNoise,
      sceneCamera: this.camera,
    });
    this.app.onResize((w, h) => this.water.setSize(w, h));

    await Promise.all([this.terrain.load(), this.water.load()]);
  }

  attachPlayer(player) {
    this.player = player;
    this.scene.add(player.object);
    this.systems.unshift(player);
  }

  addSystem(system) {
    this.systems.push(system);
    return system;
  }

  addToWaterScene(object) {
    this.water.scene.add(object);
  }

  getFocus() {
    return this.player ? this.player.position : this.focus;
  }

  getCharacter() {
    if (this.player) return this.player;

    return {
      object: this._placeholderCharacter ??= makePlaceholderCharacter(this.spawn.position),
      up: this._placeholderCharacter.up,
      rotationHorizontal: this.spawn.rotation,
    };
  }

  update(time, delta) {

    this.camera.updateMatrixWorld();
    const cameraTarget = this.camera.baseTarget ?? this.getFocus();
    const cameraPosition = this.camera.basePosition ?? this.camera.position;

    const character = this.getCharacter();
    const focus = this.getFocus();

    for (const system of this.systems) system.update?.(time, delta, this);

    this.terrain.update(this.camera, focus);
    this.water.update(time, this.camera);
    this.sky.update(time, character);
    this.sun.update(character, cameraPosition, cameraTarget);
  }

  resize(width, height) {
    this.water.setSize(width, height);
    this.sky.setResolution(width, height);
  }

  render(pipeline) {
    pipeline.render(this.scene, this.camera, this.water);
  }
}

function makePlaceholderCharacter(positionArray) {
  const object = new THREE.Object3D();
  object.position.fromArray(positionArray);
  object.up.copy(object.position).normalize();

  const tangent = new THREE.Vector3(0, 0, -1).cross(object.up).normalize();
  const forward = tangent.clone().cross(object.up).normalize();
  object.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().lookAt(new THREE.Vector3(), forward, object.up),
  );
  object.rotationHorizontal = 0;
  return object;
}

export { COLORS, OUTLINE };
