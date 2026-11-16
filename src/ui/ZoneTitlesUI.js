import { events } from '../core/Events.js';
import { UI_FONTS, makeText, placeText } from './UiText.js';

export class ZoneTitlesUI {
  constructor(ctx) {
    this.ctx = ctx;
    this.width = 1280;
    this.height = 800;
    this.visibleTitle = null;
    this.pending = null;
    this.block = null;
    this.fontSize = 85;
  }

  load() {
    return this;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const { mobile, small, marginLeft, marginTop } = this.ctx.responsive;
    this.fontSize = mobile ? 55 : small ? 85 : 110;
    const maxWidthLimit = mobile ? 375 : small ? 600 : 750;
    const buttonSize = mobile ? 45 : small ? 65 : 70;
    this.maxWidth = Math.min(width, maxWidthLimit) - marginLeft * 2 - buttonSize - 40;
    this.marginLeft = marginLeft;
    this.marginTop = marginTop;

    if (this.block) {
      this.block.mesh.textOptions.size = this.fontSize;
      this.block.mesh.textOptions.maxWidth = this.maxWidth;
      this._place(this.block.mesh);
    }
    return this;
  }

  _place(mesh) {

    const lineSize = mesh.metrics.size * mesh.metrics.lineHeight;
    const extra = lineSize * Math.max(0, mesh.metrics.lines - 1);
    placeText(mesh, this.marginLeft, this.height - this.marginTop * 1.5 - extra);
    mesh.rotation.z = 0.05;
    mesh.updateMatrix();
    return mesh;
  }

  async _ensure(text) {
    if (this.block && this.block.text === text) return this.block.mesh;
    if (this.block) {
      this.ctx.scene.remove(this.block.mesh);
      this.block.mesh.dispose?.();
      this.block = null;
    }
    const mesh = await makeText(this.ctx.glyphs, {
      font: UI_FONTS.title,
      text: text.toUpperCase(),
      size: this.fontSize,
      maxWidth: this.maxWidth,
      color: '#F8F8F8',
      align: 'left',
      letterSpacing: -0.05,
      lineHeight: 0.8,
      shadow: true,
      shadowX: 0.04,
      shadowY: 0.04,
      shadowColor: '#647A87',
      interior: false,
      glyphTilt: 0.075,
    });
    const resolution = this.ctx.ui.deviceResolution;
    if (resolution) mesh.material.setResolution?.(resolution.width, resolution.height);
    mesh.visible = false;
    mesh.renderOrder = -50;
    this.ctx.scene.add(mesh);
    this.block = { text, mesh };
    this._place(mesh);
    return mesh;
  }

  async show(text) {
    if (!text) return this;
    if (this.visibleTitle) this.hide(0.25);
    const mesh = await this._ensure(String(text));
    mesh.visible = true;
    mesh.material.setShow(0);
    mesh.material.setHide(0);
    this.visibleTitle = mesh;
    const { tweens } = this.ctx;
    events.emit('webgl_play_audio', 'title');
    events.emit('ui_zone_title_show', text);
    tweens.to(mesh.material.uniforms.uShow, {
      from: { value: 0 }, to: { value: 1 }, duration: 1.5, ease: 'none',
      onComplete: () => this.hide(4),
    });
    this._autoHide = tweens.after(4 + 1.5, () => this.hide(0));
    return this;
  }

  hide(delay = 0) {
    if (!this.visibleTitle) return this;
    const mesh = this.visibleTitle;
    this.visibleTitle = null;
    if (this._autoHide) {
      this._autoHide.kill();
      this._autoHide = null;
    }
    const { tweens } = this.ctx;
    tweens.to(mesh.material.uniforms.uShow, { to: { value: 1 }, duration: 0 });
    tweens.to(mesh.material.uniforms.uHide, {
      to: { value: 1 }, duration: 0.35, delay, ease: 'none',
      onComplete: () => {
        mesh.visible = false;
        mesh.material.setHide(0);
      },
    });
    return this;
  }

  hideAll() {
    return this.hide(0);
  }
}
