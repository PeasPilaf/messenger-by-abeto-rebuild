import { Mesh, Quaternion, Vector3 } from 'three';

import { events } from '../../core/Events.js';
import { createPainterlyMaterial } from '../../graphics/PainterlyMaterial.js';
import { QUESTS } from './QuestData.js';
import { efit, parabola } from '../npc/npcMath.js';

const RECEIVE_DURATION = 1.15;
const GIVE_DURATION = 0.5;
const SPIN_RATE = 3;

const scratchStart = new Vector3();
const scratchEnd = new Vector3();
const scratchLocal = new Vector3();
const scratchSpin = new Quaternion();

const sineInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

export class RewardProp {

  constructor({ scene, geometryLoader, shared, player }) {
    this.scene = scene;
    this.geometryLoader = geometryLoader;
    this.shared = shared;
    this.player = player;

    this.geometries = new Map();
    this.mesh = null;
    this._animation = { playing: false, elapsed: 0, duration: RECEIVE_DURATION, mode: 'receive' };
    this._time = 0;

    events.on('quest_receive_model', this.receive, this);
    events.on('quest_give_model', this.give, this);
  }

  async load() {
    const paths = new Set();
    for (const quest of QUESTS) {
      for (const step of quest.steps) {
        if (step.extraData?.receiveModel) paths.add(step.extraData.receiveModel);
        if (step.extraData?.giveModel) paths.add(step.extraData.giveModel);
      }
    }
    const loaded = await Promise.all(
      [...paths].map(async (path) => [path, await this.geometryLoader.load(path)]),
    );
    for (const [path, geometry] of loaded) this.geometries.set(path, geometry);

    const first = this.geometries.values().next().value ?? null;
    this.mesh = new Mesh(first ?? undefined, createPainterlyMaterial({ kind: 'give', shared: this.shared }));
    this.mesh.name = 'Give Object';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
    return this;
  }

  receive(path) {
    this._show(path, 'receive');
  }

  give(path) {
    this._show(path, 'give');
  }

  _show(path, mode) {
    const geometry = this.geometries.get(path);
    if (!geometry || !this.mesh) return;
    this.mesh.geometry = geometry;
    this._animation = {
      playing: true,
      elapsed: 0,
      duration: mode === 'give' ? GIVE_DURATION : RECEIVE_DURATION,
      mode,
    };
    this.mesh.visible = true;
  }

  update(time, delta, player = this.player) {
    this._time = time;
    const animation = this._animation;
    if (!animation.playing || !this.mesh || !player) return;

    animation.elapsed += delta;
    const t = Math.min(1, animation.elapsed / animation.duration);
    const eased = sineInOut(t);

    scratchStart
      .copy(player.position)
      .addScaledVector(player.up, 1)
      .add(scratchLocal.set(-0.1, 0, 0.9).applyQuaternion(player.quaternion));
    scratchEnd
      .copy(player.position)
      .addScaledVector(player.up, 0.8)
      .add(scratchLocal.set(-0.1, 0, 0.1).applyQuaternion(player.quaternion));

    if (animation.mode === 'receive') this.mesh.position.lerpVectors(scratchStart, scratchEnd, eased);
    else this.mesh.position.lerpVectors(scratchEnd, scratchStart, eased);
    this.mesh.position.addScaledVector(player.up, parabola(t, 1) * 0.15);

    const scale = efit(t, 0, 0.1, 0, 1) * efit(t, 0.9, 1, 1, 0);
    this.mesh.scale.setScalar(Math.max(0, Math.min(1, scale)));

    this.mesh.quaternion.copy(player.quaternion);
    this.mesh.quaternion.premultiply(scratchSpin.setFromAxisAngle(player.up, time * SPIN_RATE));

    if (t >= 1) {
      animation.playing = false;
      this.mesh.visible = false;
    }
  }

  dispose() {
    events.off('quest_receive_model', this.receive, this);
    events.off('quest_give_model', this.give, this);
    this.mesh?.removeFromParent();
    this.mesh?.material.dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.mesh = null;
  }
}
