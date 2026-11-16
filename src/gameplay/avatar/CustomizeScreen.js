import { Group, Mesh, PlaneGeometry, Raycaster, Vector2, Vector3 } from 'three';

import { events } from '../../core/Events.js';
import { ACCESSORIES, CATEGORIES, writeAccessories } from './Accessories.js';
import {
  computeCustomizeCameraPose,
  frameCamera,
  CUSTOMIZE_CAMERA,
} from './CustomizeCamera.js';
import {
  CUSTOMIZE_LAYOUT,
  createArrowGeometry,
  createCrossGeometry,
  createPlate,
  createStickerMaterial,
  falloff,
  fract,
} from './CustomizeStickers.js';

export const ACCESSORY_ARROWS = Object.freeze([
  { category: 'shoes', direction: -1 },
  { category: 'shoes', direction: 1 },
  { category: 'bottom', direction: -1 },
  { category: 'bottom', direction: 1 },
  { category: 'top', direction: -1 },
  { category: 'top', direction: 1 },
  { category: 'hair', direction: -1 },
  { category: 'hair', direction: 1 },
]);

const SHOW_DELAY = 0.25;
const SHOW_DURATION = 0.55;
const HIDE_DURATION = 0.5;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (from, to, alpha) => (1 - alpha) * from + alpha * to;

export class CustomizeScreen {

  constructor({
    avatar,
    scene = null,
    screenHeight = () => window.innerHeight,
    screenWidth = () => window.innerWidth,
    onSelectionChanged = null,
    onOpen = null,
    onClose = null,
  } = {}) {
    if (!avatar) throw new TypeError('CustomizeScreen: avatar is required');
    this.avatar = avatar;
    this.onSelectionChanged = onSelectionChanged;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this._screenHeight = screenHeight;
    this._screenWidth = screenWidth;

    this.group = new Group();
    this.group.name = 'customize-screen';
    this.group.visible = false;
    this.group.renderOrder = 20;
    scene?.add(this.group);

    this.elements = [];
    this.icons = [];
    this.isOpen = false;
    this.lastSelection = avatar.accessories?.slice() ?? [];

    this._active = false;
    this._hiding = false;
    this._elapsed = 0;
    this._show = 0;
    this._seed = Math.random();
    this._steps = [];
    this._scale = 1;
    this._queue = Promise.resolve();
    this._worldPosition = new Vector3();

    this._plateGeometry = new PlaneGeometry(1, 1);
    this._plateMaterial = createStickerMaterial(CUSTOMIZE_LAYOUT.plateColor);
    this._shadowMaterial = createStickerMaterial(CUSTOMIZE_LAYOUT.shadowColor);
    this._iconMaterial = createStickerMaterial(CUSTOMIZE_LAYOUT.inkColor, { doubleSided: true });
    this._arrowGeometry = createArrowGeometry();
    this._crossGeometry = createCrossGeometry();
    this._buildPlates();
    this._buildIcons();
    this.resize();
  }

  _buildPlates() {
    for (let index = 0; index < 9; index++) {
      const element = new Group();
      element.userData.index = index;
      const { shadow, plate } = createPlate(
        this._plateGeometry,
        this._plateMaterial,
        this._shadowMaterial,
        index,
      );
      element.add(shadow, plate);
      this.group.add(element);
      this.elements.push({ index, element, shadow, plate, size: CUSTOMIZE_LAYOUT.plateSize });
    }
  }

  _buildIcons() {
    for (let index = 0; index < 8; index++) {
      const icon = new Mesh(this._arrowGeometry, this._iconMaterial);
      icon.name = `customize-arrow-${index}`;
      icon.renderOrder = 22;
      icon.userData.index = index;

      if (index % 2 === 0) icon.rotation.z = Math.PI;
      this.group.add(icon);
      this.icons.push({ index, mesh: icon, size: 1 });
    }
    const close = new Mesh(this._crossGeometry, this._iconMaterial);
    close.name = 'customize-close';
    close.renderOrder = 22;
    close.userData.index = 8;
    this.group.add(close);
    this.icons.push({ index: 8, mesh: close, size: CUSTOMIZE_LAYOUT.closeScale });
  }

  resize() {
    const layout = CUSTOMIZE_LAYOUT;
    const height = Math.max(1, this._screenHeight());
    const width = Math.max(1, this._screenWidth());
    const scale = lerp(1, 1300 / height, 0.3);
    const xFactor = width <= height ? 0.875 : 1;
    this._scale = scale;

    for (const { index, element, size } of this.elements) {
      if (index === 8) {
        element.position.set(0, layout.closeY, 0);
        element.userData.size = size * layout.closeScale * scale;
      } else {
        const row = Math.floor(index / 2);
        const side = index % 2 === 0 ? -1 : 1;
        element.position.set(side * layout.plateX * xFactor, layout.rowY[row], 0);
        element.userData.size = size * scale;
      }
    }

    for (const { index, mesh } of this.icons) {
      if (index === 8) {
        mesh.position.set(0, layout.closeY, 0.001);
        mesh.scale.setScalar(scale * layout.closeScale);
      } else {
        const row = Math.floor(index / 2);
        const side = index % 2 === 0 ? -1 : 1;
        mesh.position.set(side * layout.arrowX * xFactor, layout.rowY[row], 0.001);
        mesh.scale.setScalar(scale);
      }
    }

    this._applyReveal(this._show);
  }

  show() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._active = true;
    this._hiding = false;
    this._elapsed = 0;
    this._seed = Math.random();

    this._steps = this.elements.map((_, index) =>
      Math.floor(2 + fract(this._seed * 4.35452 + index * 23.546) * 3),
    );
    this.group.visible = true;
    events.emit('webgl_play_audio', 'customize');
    events.emit('character_change_traits_shown');
    this.onOpen?.();
  }

  hide() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._hiding = true;
    this._elapsed = 0;
    events.emit('webgl_stop_audio', 'customize');
    events.emit('character_change_traits_hiddden');
    this.onClose?.();
  }

  update(deltaSeconds, camera) {
    if (!this._active) return;

    this._elapsed += Math.max(0, deltaSeconds);
    if (this._hiding) {
      this._show = 1 - clamp(this._elapsed / HIDE_DURATION);
      if (this._show <= 0) {
        this._active = false;
        this._hiding = false;
        this.group.visible = false;
        return;
      }
    } else {
      this._show = clamp((this._elapsed - SHOW_DELAY) / SHOW_DURATION);
    }

    this.avatar.object3D.getWorldPosition(this._worldPosition);
    this.group.position.copy(this._worldPosition);
    if (camera) this.group.quaternion.copy(camera.quaternion);
    this._applyReveal(this._show);
  }

  _applyReveal(show) {
    this._show = show;
    for (const { index, element, shadow, plate } of this.elements) {
      const steps = this._steps[index] ?? 3;
      const revealed = Math.floor(falloff(index, 0, 9, 5, show) * steps) / steps;
      const scale = element.userData.size ?? CUSTOMIZE_LAYOUT.plateSize;
      element.visible = revealed > 0.001;
      plate.scale.setScalar(scale * revealed);
      shadow.scale.setScalar(scale * revealed);
      shadow.position.set(
        CUSTOMIZE_LAYOUT.shadowOffset * this._scale,
        -CUSTOMIZE_LAYOUT.shadowOffset * this._scale,
        -0.002,
      );
    }
    for (const { index, mesh, size } of this.icons) {
      const steps = this._steps[index] ?? 3;
      const revealed = Math.floor(falloff(index, 0, 9, 5, show) * steps) / steps;
      mesh.visible = revealed > 0.001;
      mesh.scale.setScalar((size ?? 1) * this._scale * revealed);
    }
  }

  pick(camera, ndc = new Vector2()) {
    if (!this._active) return null;
    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const meshes = this.elements.filter((entry) => entry.element.visible).map((entry) => entry.plate);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length > 0 ? hits[0].object.userData.index : null;
  }

  activate(index) {
    if (index === 8) {
      this.hide();
      return Promise.resolve(this.lastSelection);
    }
    const arrow = ACCESSORY_ARROWS[index];
    if (!arrow) return Promise.resolve(this.lastSelection);
    return this.stepAccessory(arrow.category, arrow.direction);
  }

  stepAccessory(category, direction) {
    const slot = CATEGORIES.indexOf(category);
    const parts = ACCESSORIES[category];
    if (slot === -1 || !parts) return Promise.resolve(this.lastSelection);

    const selection = (this.avatar.accessories ?? []).slice();
    const current = parts.indexOf(selection[slot]);
    if (current === -1) return Promise.resolve(this.lastSelection);
    selection[slot] = parts[(current + direction + parts.length) % parts.length];

    this._queue = this._queue
      .then(async () => {

        const saved = writeAccessories(selection);
        await this.avatar.setAccessories(saved);
        this.lastSelection = saved;
        this.onSelectionChanged?.(saved);
        events.emit('webgl_play_audio', 'clothes');
        return saved;
      })
      .catch((error) => {
        console.warn('CustomizeScreen: accessory change failed', error);
        return this.lastSelection;
      });
    return this._queue;
  }

  dispose() {
    this.group.removeFromParent();
    this._plateGeometry.dispose();
    this._plateMaterial.dispose();
    this._shadowMaterial.dispose();
    this._arrowGeometry?.dispose();
    this._crossGeometry?.dispose();
    this._iconMaterial?.dispose();
    this.elements = [];
    this.icons = [];
  }
}

export { CUSTOMIZE_LAYOUT, CUSTOMIZE_CAMERA, computeCustomizeCameraPose, frameCamera };
