import { Group, Mesh, Quaternion, Vector3 } from 'three';

import { events } from '../../core/Events.js';
import { SlugMaterial } from '../../text/SlugMaterial.js';
import { lerpCoefFPS, lerpFPS } from './npcMath.js';
import { patchSlugMaterialForWorld } from './npcMaterials.js';

const SWAP_OUT_TIME = 0.2;
const SWAP_IN_TIME = 0.5;
const SHOW_LERP = 0.2;
const PULSE_UP = 0.15;
const PULSE_DOWN = 0.2;
const PULSE_SCALE = 1.2;

const worldQuaternion = new Quaternion();
const worldPosition = new Vector3();

function elasticOut(progress, amplitude = 1, period = 0.75) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return amplitude * Math.pow(2, -10 * progress) * Math.sin(((progress - period / 4) * 2 * Math.PI) / period) + 1;
}

export class NpcBeacon extends Group {

  constructor({ actor, glyphs, iconOptions }) {
    super();
    this.name = `icon - ${actor.id}`;
    this.actor = actor;
    this.glyphs = glyphs;
    this.options = iconOptions;

    this.visible = false;
    this.ready = null;

    this._active = false;
    this._isClose = false;
    this._questEnabled = false;
    this._show = 1;
    this._swapTimer = 0;
    this._swapIncoming = null;
    this._swapOutgoing = null;
    this._swapPhase = 'out';
    this._pulseUp = 0;
    this._pulseDown = 0;

    this._inactiveIcon = null;
    this._activeIcon = null;
    this.ready = this._createIcons();
  }

  async _createIcons() {
    const [inactive, active] = await Promise.all(
      this.options.files.map((file) => this.glyphs.buildPicture(file, { size: 1 })),
    );

    this._inactiveIcon = this._createIconMesh(inactive, this.options.sizeInactive, 'inactive');
    this._activeIcon = this._createIconMesh(active, this.options.sizeActive, 'active');
    this._activeIcon.visible = false;
    this._inactiveIcon.visible = false;

    this.position.set(0, this.actor.iconAnchorY, 0).add(new Vector3().fromArray(this.actor.options.iconOffset));
    this.actor.mesh.add(this);
  }

  _createIconMesh(picture, size, name) {
    const geometry = picture.geometry;

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometry.translate(0, geometry.boundingBox.max.y, 0);
    const material = patchSlugMaterialForWorld(new SlugMaterial({ font: picture.font }));
    material.uniforms.uReveal.value = false;
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.userData.baseScale = size;
    mesh.scale.setScalar(size);
    this.add(mesh);
    return mesh;
  }

  update(delta, state) {
    if (!this._inactiveIcon || !this._activeIcon) return;
    const ratio = delta * 60;

    this.actor.mesh.getWorldQuaternion(worldQuaternion);
    this.quaternion.copy(worldQuaternion).invert().multiply(state.camera.quaternion);

    this.getWorldPosition(worldPosition);
    const cameraDistance = state.camera.position.distanceTo(worldPosition);
    this.visible = this._active && cameraDistance < this.options.visibilityDistance;

    if (this._isClose !== state.isClose) this._startSwap(state.isClose);
    this._updateSwap(delta, state);

    const hidden = state.talking || state.textsCount === 0;
    this._show = lerpFPS(this._show, hidden ? 0 : 1, SHOW_LERP, ratio);

    let pulse = 0;
    if (this._pulseUp > 0) {
      this._pulseUp = Math.max(0, this._pulseUp - delta);
      pulse = 1 - this._pulseUp / PULSE_UP;
    } else if (this._pulseDown > 0) {
      this._pulseDown = Math.max(0, this._pulseDown - delta);
      pulse = this._pulseDown / PULSE_DOWN;
    }

    this._applyState(pulse);
  }

  _startSwap(isClose) {
    this._isClose = isClose;

    const incoming = isClose ? this._inactiveIcon : this._activeIcon;
    const outgoing = isClose ? this._activeIcon : this._inactiveIcon;
    incoming.userData.iconScale = 0;
    this._swapIncoming = incoming;
    this._swapTimer = 0;
    this._swapOutgoing = outgoing;
    this._swapPhase = 'out';
    events.emit('topicon_change', {
      object: this.actor.mesh,
      visible: this.visible,
      isClose,
      questEnabled: this._questEnabled,
    });
  }

  _updateSwap(delta) {
    if (!this._swapOutgoing) return;
    this._swapTimer += delta;
    if (this._swapPhase === 'out') {
      const t = Math.min(1, this._swapTimer / SWAP_OUT_TIME);
      this._swapOutgoing.userData.iconScale = 1 - t;
      if (t >= 1) {
        this._swapOutgoing.visible = false;
        this._swapOutgoing = null;
        this._swapIncoming.visible = true;
        this._swapPhase = 'in';
        this._swapTimer = 0;
      }
      return;
    }
    const t = Math.min(1, this._swapTimer / SWAP_IN_TIME);
    this._swapIncoming.userData.iconScale = elasticOut(t);
    if (t >= 1) {
      this._swapIncoming.userData.iconScale = 1;
      this._swapIncoming = null;
      this._swapOutgoing = null;
    }
  }

  _applyState(pulse) {
    for (const [mesh, size] of [
      [this._inactiveIcon, this.options.sizeInactive],
      [this._activeIcon, this.options.sizeActive],
    ]) {
      const iconScale = mesh.userData.iconScale ?? 1;
      mesh.scale.setScalar(size * iconScale * (1 + (PULSE_SCALE - 1) * pulse));
      mesh.material.setOpacity(this._show);
    }
    this._applyColor();
  }

  _applyColor() {
    const target = this._questEnabled ? this.options.colorHighlight : this.options.color2;
    for (const mesh of [this._inactiveIcon, this._activeIcon]) {
      const material = mesh.material;
      if (this._questEnabled) {
        material.setOverwriteColor(target);
      } else {
        material.uniforms.uOverwriteColor.value = false;
      }
    }
  }

  setQuestEnabled(enabled) {
    this._questEnabled = Boolean(enabled);
    if (this._inactiveIcon) this._applyColor();
  }

  setActive(active) {
    this._active = Boolean(active);
    if (!this._active && this._inactiveIcon) {
      this._inactiveIcon.visible = false;
      this._activeIcon.visible = false;
      this.visible = false;
    }
  }

  pulse() {
    if (!this._inactiveIcon) return;
    this._pulseUp = PULSE_UP;
    this._pulseDown = 0;
  }

  setResolution(width, height) {
    this._inactiveIcon?.material.setResolution?.(width, height);
    this._activeIcon?.material.setResolution?.(width, height);
  }

  dispose() {
    for (const mesh of [this._inactiveIcon, this._activeIcon]) {
      if (!mesh) continue;
      mesh.material.dispose();

    }
    this.removeFromParent();
  }
}
