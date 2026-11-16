import { events } from '../core/Events.js';
import { PaperPanel } from './PaperPanel.js';
import { makeIcon } from './UiText.js';

const FACE = '#F8F8F8';
const SHADOW = '#647A87';
const ICON_NAMES = ['list', 'sound', 'sound-muted', 't-shirt', 'poo'];
const ICON_SCALES = [0.475, 0.675, 0.675, 0.525, 0.65];
const CLICK_EVENTS = [
  'ui_quest_log_toggle',
  'audio_mute_toggle',
  'character_change_traits_show',
  'ui_emojis_toggle',
];

export class SideButtonsUI {
  constructor(ctx) {
    this.ctx = ctx;
    this.width = 1280;
    this.height = 800;
    this.shown = false;
    this.muted = true;
    this.size = 65;
    this.squares = [];
    this.icons = [];
    this.regions = [];
    this.anim = { show: 0 };
  }

  async load() {
    const { scene, glyphs } = this.ctx;
    for (let i = 0; i < 4; i++) {
      const square = new PaperPanel({
        face: FACE, shadow: SHADOW, shadowOffset: 5.5, jitter: 0.065,
        alpha: 1, layers: 2, renderOrder: 0,
      });
      square.setShow(0);
      square.visible = false;
      scene.add(square);
      this.squares.push(square);
    }
    this.icons = await Promise.all(ICON_NAMES.map((name) => makeIcon(glyphs, `ui/sidebuttons/${name}`, { height: 1 })));
    for (const icon of this.icons) {
      icon.visible = false;
      icon.renderOrder = 1;
      scene.add(icon);
    }
    this._syncMuteIcons();
    this._registerInput();
    return this;
  }

  _registerInput() {
    const { input } = this.ctx;
    for (let index = 0; index < 4; index++) {
      const region = input.addRegion({
        rect: { x: 0, y: 0, w: 1, h: 1 },
        enabled: false,
        cursor: true,
        onClick: () => this._click(index),
        onHover: (action) => this._hover(index, action),
        onPress: (action) => this._press(index, action === 'touch_start'),
      });
      this.regions.push(region);
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const { mobile, small, marginLeft, marginTop } = this.ctx.responsive;
    const size = mobile ? 45 : small ? 65 : 70;
    const gap = mobile ? 40 : small ? 50 : 60;
    this.size = size;

    const centreX = width - marginLeft - size * 0.5;
    const tops = [marginTop];
    for (let index = 1; index <= 3; index++) {
      const c = 3 - index;
      tops[index] = height - marginTop - size - (size * 0.5 + gap) * c;
    }

    for (let index = 0; index < 4; index++) {
      const square = this.squares[index];
      square.setSize(size, size);
      square.setScreenCentre(centreX, tops[index] + size * 0.5);
    }

    const iconSquare = [0, 1, 1, 2, 3];
    for (let index = 0; index < this.icons.length; index++) {
      const iconSize = size * ICON_SCALES[index];
      this.icons[index].userData.baseSize = iconSize;
      this.icons[index].scale.setScalar(iconSize);
      const squareIndex = iconSquare[index];
      this.icons[index].position.set(centreX, -(tops[squareIndex] + size * 0.5), 0);
      this.icons[index].updateMatrix();
    }

    for (let index = 0; index < 4; index++) {
      this.regions[index].rect = { x: centreX - size / 2, y: tops[index], w: size, h: size };
    }
    this.layout = { size, gap, centreX, tops };
  }

  show(delay = 0) {
    if (this.shown) return this;
    this.shown = true;
    const { tweens } = this.ctx;
    this.squares.forEach((square, index) => {
      square.visible = true;
      square.setSeed();
      square.show(tweens, { duration: 0.5, delay: delay + index * 0.06 });
    });

    this.icons.forEach((icon, index) => {
      this.ctx.tweens.kill(icon.scale);
      icon.visible = true;
      const anim = { v: 0 };
      const base = icon.userData.baseSize;
      icon.scale.setScalar(0);
      tweens.to(anim, {
        from: { v: 0 }, to: { v: 1 }, duration: 0.15, delay: delay + 0.1 + index * 0.09, ease: 'none',
        onUpdate: () => {
          const stepped = Math.floor(anim.v * 3) / 3;
          icon.scale.setScalar(base * stepped);
          icon.updateMatrix();
        },
      });
    });
    tweens.after(delay + 0.1, () => events.emit('webgl_play_audio', 'buttons'));
    tweens.after(delay + 0.55, () => {
      this.regions.forEach((region) => { region.enabled = true; });
      this._syncMuteIcons();
      events.emit('ui_sideicons_shown');
    });
    return this;
  }

  hide(delay = 0) {
    if (!this.shown) return this;
    this.shown = false;
    this.regions.forEach((region) => { region.enabled = false; });
    const { tweens } = this.ctx;
    this.icons.forEach((icon, index) => {
      tweens.to(icon.scale, {
        to: { x: 0, y: 0 }, duration: 0.3, delay: delay + index * 0.01, ease: 'none',
        onComplete: () => { icon.visible = false; },
      });
    });
    this.squares.forEach((square, index) => {
      square.hide(tweens, { duration: 0.35, delay: delay + index * 0.01 });
    });
    tweens.after(delay + 0.35, () => events.emit('ui_sideicons_hidden'));
    return this;
  }

  setVisible(visible) {
    if (visible) this.show();
    else this.hide();
    return this;
  }

  setMuteState(muted) {
    this.muted = typeof muted === 'boolean' ? muted : this.muted;
    this._syncMuteIcons();
    return this;
  }

  _syncMuteIcons() {
    if (this.icons.length < 3) return;
    this.icons[1].visible = this.shown && !this.muted;
    this.icons[2].visible = this.shown && this.muted;
  }

  _iconForSquare(squareIndex) {
    if (squareIndex === 0) return this.icons[0];
    if (squareIndex === 1) return this.muted ? this.icons[2] : this.icons[1];
    if (squareIndex === 2) return this.icons[3];
    return this.icons[4];
  }

  _click(index) {
    if (!this.shown) return;
    const name = CLICK_EVENTS[index];
    if (name) events.emit(name);
  }

  _hover(index, action) {
    if (!this.shown || action !== 'hover_in') return;
    const square = this.squares[index];
    const icon = this._iconForSquare(index);
    const { tweens } = this.ctx;
    const anim = { t: 0 };
    tweens.to(anim, {
      from: { t: 0 }, to: { t: 1 }, duration: 0.07, ease: 'none',
      onStart: () => {
        square.setSeed(Math.random() * 22.34);
        square.setHoverScale(1.1);
        this._setIconScale(icon, 0.935);
      },
      onComplete: () => {
        square.setSeed(Math.random() * 3.34);
        square.setHoverScale(1);
        this._setIconScale(icon, 1);
      },
    });
    events.emit('webgl_play_audio', 'hover2');
  }

  _press(index, down) {
    if (!this.shown) return;
    const square = this.squares[index];
    const icon = this._iconForSquare(index);
    square.setSeed(Math.random() * 43.23);
    square.setHoverScale(down ? 0.925 : 1);
    if (icon) this._setIconScale(icon, down ? 0.9 : 1);
    events.emit('webgl_play_audio', down ? 'click2' : 'click3');
  }

  _setIconScale(icon, factor) {
    if (!icon) return;
    icon.scale.setScalar(icon.userData.baseSize * factor);
    icon.updateMatrix();
  }
}
