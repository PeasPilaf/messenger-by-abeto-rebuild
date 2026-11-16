import { BufferAttribute, BufferGeometry, Group, Mesh, Quaternion } from 'three';

import { TextMesh } from '../../text/TextMesh.js';
import {
  BUBBLE_POINTERS,
  BUBBLE_POSITIONS,
  BUBBLE_UVS,
  createBubblePanelMaterial,
  patchSlugMaterialForWorld,
} from './npcMaterials.js';

const SHOW_TIME = 0.65;
const HIDE_FADE = 0.075;
const HIDE_SHRINK = 0.2;
const REVEAL_DELAY = 0.35;
const REVEAL_CHARS_PER_SECOND = 15;
const TAIL_LIFT = 0.07;

const meshQuaternion = new Quaternion();

function elasticOut(progress) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const period = 1;
  return Math.pow(2, -10 * progress) * Math.sin(((progress - period / 4) * 2 * Math.PI) / period) + 1;
}

const sineIn = (progress) => 1 - Math.cos((progress * Math.PI) / 2);

let bubbleGeometry = null;
function getBubbleGeometry() {
  if (bubbleGeometry) return bubbleGeometry;
  bubbleGeometry = new BufferGeometry();
  bubbleGeometry.setAttribute('position', new BufferAttribute(BUBBLE_POSITIONS.slice(), 3));
  bubbleGeometry.setAttribute('uv', new BufferAttribute(BUBBLE_UVS.slice(), 2));
  bubbleGeometry.setAttribute('pointer', new BufferAttribute(BUBBLE_POINTERS.slice(), 1));
  bubbleGeometry.setIndex([3, 1, 0, 4, 5, 6, 0, 2, 3]);
  return bubbleGeometry;
}

export class NpcBubble extends Group {

  constructor({ actor, glyphs, style, camera }) {
    super();
    this.name = `Bubble - ${actor.id}`;
    this.actor = actor;
    this.glyphs = glyphs;
    this.style = style;

    this.text = '';
    this.camera = camera;
    this.visible = false;
    this._state = 'hidden';
    this._timer = 0;
    this._revealTimer = 0;
    this._revealStarted = false;

    this._panel = new Mesh(getBubbleGeometry(), createBubblePanelMaterial());
    this._panel.name = 'bubble background';
    this._panel.frustumCulled = false;
    this._panel.visible = false;
    this.add(this._panel);

    this._textMesh = null;
    this._textReady = null;

    const [offsetX, offsetY, offsetZ] = actor.options.bubbleOffset;
    this.position.set(offsetX, actor.bubbleAnchorY + offsetY, offsetZ);
    actor.mesh.add(this);
  }

  async setText(text) {
    if (text === this.text && this._textMesh) return;
    this.text = text;
    if (this._textMesh) {
      this._textMesh.removeFromParent();
      this._textMesh.dispose();
      this._textMesh = null;
    }
    const textMesh = new TextMesh({
      glyphs: this.glyphs,
      font: this.style.font,
      text,
      anchor: 'center',
      textOptions: {
        font: this.style.font,
        size: this.style.size,
        color: this.style.color,
        align: this.style.align,

        maxWidth: this.style.width,
        letterSpacing: this.style.letterSpacing,
        lineHeight: this.style.lineHeight,
      },
    });
    this._textMesh = textMesh;
    this.add(textMesh);
    this._textReady = textMesh.ready;
    await textMesh.ready;

    patchSlugMaterialForWorld(textMesh.material);
    this._layout();
  }

  _layout() {
    const material = this._panel.material;
    const width = this._textMesh?.width || 1;
    const height = this._textMesh?.height || 0.2;
    const size = material.uniforms.uSize.value;
    size.set(width + this.style.marginX * 2, height + this.style.marginY * 2);
    this._textMesh.position.set(0, TAIL_LIFT + size.y * 0.5, 0.02);

    this._panel.scale.setScalar(0.001);
    this._panel.visible = false;
    this._panel.material.uniforms.uOpacity.value = 1;
  }

  show(text, { immediate = false } = {}) {

    if (this._textMesh && this.text === text) {
      this._beginShow(immediate);
      return Promise.resolve();
    }
    return this.setText(text).then(() => this._beginShow(immediate));
  }

  _beginShow(immediate) {
    if (!this._textMesh) return;
    this.visible = true;
    this._state = immediate ? 'shown' : 'showing';
    this._timer = 0;
    this._revealTimer = 0;
    this._panel.visible = true;
    this._panel.scale.setScalar(immediate ? 1 : 0.001);
    this._textMesh.material.setShow(immediate ? 1 : 0);
    this._textMesh.material.setOpacity(1);
  }

  hide({ immediate = false } = {}) {
    if (!this.visible) return;
    if (immediate) {
      this.visible = false;
      this._state = 'hidden';
      this._panel.visible = false;
      return;
    }
    if (this._state === 'hiding') return;
    this._state = 'hiding';
    this._timer = 0;
  }

  update(delta) {
    if (this.visible) {

      this.actor.mesh.getWorldQuaternion(meshQuaternion);
      this.quaternion.copy(meshQuaternion).invert().multiply(this._cameraQuaternion());
    }

    if (this._state === 'showing') {
      this._timer += delta;
      const progress = Math.min(1, this._timer / SHOW_TIME);
      this._panel.scale.setScalar(Math.max(0.001, elasticOut(progress)));
      if (progress >= 1) this._state = 'shown';
      this._advanceReveal(delta);
    } else if (this._state === 'shown') {
      this._advanceReveal(delta);
    } else if (this._state === 'hiding') {
      this._timer += delta;
      if (this._timer <= HIDE_FADE) {
        if (this._textMesh) this._textMesh.material.setOpacity(1 - this._timer / HIDE_FADE);
      } else {
        const progress = Math.min(1, (this._timer - HIDE_FADE) / HIDE_SHRINK);
        this._panel.scale.setScalar(Math.max(0.001, 1 - sineIn(progress)));
        if (progress >= 1) {
          this._state = 'hidden';
          this.visible = false;
          this._panel.visible = false;
          if (this._textMesh) this._textMesh.material.setOpacity(1);
        }
      }
    }
  }

  _advanceReveal(delta) {
    if (!this._textMesh) return;
    this._revealTimer += delta;
    const typing = Math.max(1 / REVEAL_CHARS_PER_SECOND, this.text.length / REVEAL_CHARS_PER_SECOND);
    const progress = Math.min(1, Math.max(0, (this._revealTimer - REVEAL_DELAY) / typing));
    this._textMesh.material.setShow(progress);
  }

  _cameraQuaternion() {
    return this.camera.quaternion;
  }

  setCamera(camera) {
    this.camera = camera;
  }

  setResolution(width, height) {
    this._textMesh?.material?.setResolution?.(width, height);
  }

  dispose() {
    this._textMesh?.dispose();
    this._panel.material.dispose();
    this.removeFromParent();
  }
}
