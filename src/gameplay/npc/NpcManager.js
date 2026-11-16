import { Raycaster, Sphere, Vector3 } from 'three';

import npcData from '../../data/npcs.json';
import { NpcActor } from './NpcActor.js';
import { NpcDialogue } from './NpcDialogue.js';
import { resolveNpcOptions } from './npcOptions.js';

const ADVANCE_KEYS = new Set(['Space', 'KeyE', 'ArrowRight']);
const CLOSE_KEYS = new Set(['Escape']);

const scratchSphere = new Sphere();
const scratchPoint = new Vector3();

export class NpcManager {

  constructor({
    scene,
    camera,
    geometryLoader,
    glyphs,
    shared,
    data = npcData,
    voiceEvents = 'direct',
  }) {
    this.scene = scene;
    this.camera = camera;
    this.geometryLoader = geometryLoader;
    this.glyphs = glyphs;
    this.shared = shared;
    this.data = data;
    this.voiceEvents = voiceEvents;

    this.npcs = [];

    this.interactingElement = null;

    this.player = null;

    this.resolution = {
      width: globalThis.innerWidth ?? 1280,
      height: globalThis.innerHeight ?? 800,
    };

    this.raycaster = new Raycaster();
    this._hovered = null;
    this._loadPromise = null;
    this._pointer = { ndc: { x: 0, y: 0 } };
  }

  load() {
    this._loadPromise ??= this._load();
    return this._loadPromise;
  }

  async _load() {

    const loaded = await Promise.all(this.data.map((record) => this._loadOne(record)));
    this.npcs = loaded;
    return this;
  }

  async _loadOne(record) {
    const options = resolveNpcOptions(record);
    const actor = new NpcActor({
      options,
      geometryLoader: this.geometryLoader,
      shared: this.shared,
    });
    await actor.load();
    this.scene.add(actor.mesh);

    const dialogue = new NpcDialogue({
      actor,
      manager: this,
      glyphs: this.glyphs,
      camera: this.camera,
    });
    await dialogue.load();
    return { actor, dialogue };
  }

  setPlayer(player) {
    this.player = player;
  }

  setResolution(width, height) {
    this.resolution.width = Math.max(1, Math.floor(width));
    this.resolution.height = Math.max(1, Math.floor(height));
    for (const { dialogue } of this.npcs) dialogue.setResolution(width, height);
  }

  update(time, delta, ctx = {}) {
    const playerPosition = ctx.playerPosition ?? this.player?.position;
    if (!playerPosition) return;
    const controlsEnabled = ctx.controlsEnabled !== false;

    for (const { actor, dialogue } of this.npcs) {
      dialogue.update(time, delta, { playerPosition, controlsEnabled });
      actor.update(time, delta, {
        distance: dialogue.distance,
        isClose: dialogue.isClose,
        talking: dialogue.talking,
        interacting: this.interactingElement === dialogue,
        playerPosition,
      });
    }
  }

  handleClick({ clientX, clientY, x, y, element, ndc = false } = {}) {
    this._pointRay(clientX, clientY, x, y, element, ndc);
    const hit = this._pick();
    if (!hit) return null;
    return hit.dialogue.onClick() ? hit.dialogue : null;
  }

  handleHover({ clientX, clientY, x, y, element, ndc = false } = {}) {
    this._pointRay(clientX, clientY, x, y, element, ndc);
    const hit = this._pick();
    const next = hit && hit.dialogue._clickInteractionActive ? hit : null;
    if (next !== this._hovered) {
      if (this._hovered) this._hovered.dialogue.onHover(false);
      this._hovered = next;
      if (next) next.dialogue.onHover(true);
    }
    return next !== null;
  }

  _pointRay(clientX, clientY, x, y, element, ndc) {
    if (ndc) {
      this._pointer.ndc.x = x;
      this._pointer.ndc.y = y;
    } else {
      const rect = element?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 1, height: 1 };
      this._pointer.ndc.x = ((x - rect.left) / rect.width) * 2 - 1;
      this._pointer.ndc.y = -((y - rect.top) / rect.height) * 2 + 1;
    }
    this.raycaster.setFromCamera(this._pointer.ndc, this.camera);
  }

  _pick() {
    let best = null;
    let bestDistance = Infinity;
    for (const entry of this.npcs) {
      const { actor, dialogue } = entry;
      if (!actor.mesh.visible) continue;
      actor.mesh.localToWorld(scratchPoint.copy(actor.boundingSphereCenterLocal));
      scratchSphere.set(scratchPoint, actor.boundingSphereRadius);
      const hitPoint = this.raycaster.ray.intersectSphere(scratchSphere, new Vector3());
      if (!hitPoint) continue;
      const distance = this.raycaster.ray.origin.distanceToSquared(hitPoint);
      if (distance >= bestDistance) continue;
      if (!dialogue._clickInteractionActive) continue;
      bestDistance = distance;
      best = entry;
    }
    return best;
  }

  handleKey(code) {
    const active = this.interactingElement;
    if (!active) return false;
    if (ADVANCE_KEYS.has(code)) return active.requestAdvance();
    if (CLOSE_KEYS.has(code)) return active.forceClose();
    return false;
  }

  get(id) {
    return this.npcs.find((entry) => entry.actor.id === id)?.dialogue ?? null;
  }

  getActor(id) {
    return this.npcs.find((entry) => entry.actor.id === id)?.actor ?? null;
  }

  getObject(id) {
    return this.getActor(id)?.mesh ?? null;
  }

  get hovering() {
    return this._hovered !== null;
  }

  describe() {
    const active = this.interactingElement;
    return {
      interacting: active?.id ?? null,
      nearest: this.npcs
        .filter((entry) => entry.actor.mesh.visible)
        .sort((a, b) => a.dialogue.distance - b.dialogue.distance)
        .slice(0, 3)
        .map((entry) => ({
          id: entry.actor.id,
          distance: Number(entry.dialogue.distance.toFixed(2)),
          isClose: entry.dialogue.isClose,
          talking: entry.dialogue.talking,
          mode: entry.dialogue.textsBubblesEnabled ? 'bubble' : 'quest',
        })),
    };
  }

  dispose() {
    for (const { actor, dialogue } of this.npcs) {
      dialogue.dispose();
      actor.dispose();
    }
    this.npcs = [];
    this.interactingElement = null;
  }
}
