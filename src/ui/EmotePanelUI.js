import { events } from '../core/Events.js';
import { PaperPanel } from './PaperPanel.js';
import { makeIcon } from './UiText.js';

const FACE = '#F8F8F8';
const SHADOW = '#647A87';

export const EMOJI_MAP = { 1: 2, 2: 0, 3: 1, 4: 8, 5: 5, 6: 6, 7: 7, 8: 9, 9: 3, 0: 4 };

export class EmotePanelUI {
  constructor(ctx) {
    this.ctx = ctx;
    this.width = 1280;
    this.height = 800;
    this.shown = false;
    this.icons = [];
    this.regions = [];
    this.iconSize = 44;
  }

  async load() {
    const { scene, glyphs } = this.ctx;
    this.panel = new PaperPanel({
      face: FACE, shadow: SHADOW, shadowOffset: 5.5, jitter: 0.02,
      alpha: 1, layers: 2, renderOrder: -10,
    });
    this.panel.setShow(0);
    this.panel.visible = false;
    scene.add(this.panel);

    this.icons = await Promise.all(
      Array.from({ length: 10 }, (_, index) => makeIcon(glyphs, `ui/emojis/${index}`, { height: 1 })),
    );
    for (const icon of this.icons) {
      icon.visible = false;
      icon.renderOrder = 1;
      scene.add(icon);
    }
    this._registerInput();
    return this;
  }

  _registerInput() {
    const { input } = this.ctx;
    for (let index = 0; index < 10; index++) {
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

    const buttonSize = mobile ? 45 : small ? 65 : 70;
    const outer = mobile ? 15 : 20;
    const rightGap = mobile ? 30 : 40;
    const sidePad = mobile ? 12 : small ? 15 : 20;
    const padY = mobile || small ? 15 : 20;
    const maxWidth = mobile ? 375 : small ? 475 : 550;
    const gapX = mobile ? 13 : small ? 17 : 20;
    const gapY = mobile ? 10 : small ? 15 : 20;

    const innerWidth = Math.min(width, maxWidth) - sidePad * 2 - marginLeft - buttonSize - outer - rightGap;
    const iconSize = (innerWidth - gapX * 4) / 5;
    const panelWidth = innerWidth + sidePad * 2;
    const panelHeight = iconSize * 2 + gapY + padY * 2;
    const rightEdge = width - marginLeft - buttonSize - outer;
    const bottom = height - marginTop;
    const left = rightEdge - panelWidth;
    const top = bottom - panelHeight;

    this.iconSize = iconSize;
    this.panel.setSize(panelWidth, panelHeight);
    this.panel.setScreenCentre(left + panelWidth * 0.5, top + panelHeight * 0.5);

    for (let index = 0; index < 10; index++) {
      const column = index % 5;
      const row = index < 5 ? 0 : 1;
      const centreX = rightEdge - sidePad - iconSize * 0.5 - (gapX + iconSize) * column;
      const centreY = bottom - padY - iconSize * 0.5 - (row === 0 ? 0 : gapY + iconSize);
      const icon = this.icons[index];
      icon.userData.baseSize = iconSize;
      icon.scale.setScalar(iconSize);
      icon.position.set(centreX, -centreY, 0);
      icon.updateMatrix();
      this.regions[index].rect = {
        x: centreX - iconSize * 0.5,
        y: centreY - iconSize * 0.5,
        w: iconSize,
        h: iconSize,
      };
    }
    this.layout = { left, top, panelWidth, panelHeight, rightEdge, bottom };
  }

  show(delay = 0) {
    if (this.shown) return this;
    this.shown = true;
    const { tweens } = this.ctx;
    this.panel.visible = true;
    this.panel.setSeed();
    this.panel.show(tweens, { duration: 0.15, delay });

    this.icons.forEach((icon, index) => {
      const row = index < 5 ? 0 : 1;
      this.ctx.tweens.kill(icon.scale);
      icon.visible = true;
      const base = icon.userData.baseSize;
      const anim = { v: 0 };
      icon.scale.setScalar(0);
      tweens.to(anim, {
        from: { v: 0 }, to: { v: 1 }, duration: 0.15, delay: delay + 0.15 + row * 0.075, ease: 'none',
        onUpdate: () => {
          const stepped = Math.floor(anim.v * 3) / 3;
          icon.scale.setScalar(base * stepped);
          icon.updateMatrix();
        },
      });
    });
    tweens.after(delay + 0.3, () => {
      this.regions.forEach((region) => { region.enabled = true; });
    });
    events.emit('webgl_play_audio', 'open-box2');
    events.emit('webgl_play_audio', 'open-box-emote');
    return this;
  }

  hide() {
    if (!this.shown) return this;
    this.shown = false;
    this.regions.forEach((region) => { region.enabled = false; });
    const { tweens } = this.ctx;
    for (const icon of this.icons) {
      tweens.to(icon.scale, { to: { x: 0, y: 0 }, duration: 0.05, ease: 'none', onComplete: () => { icon.visible = false; } });
    }
    this.panel.hide(tweens, { duration: 0.15, delay: 0.05 });
    events.emit('webgl_play_audio', 'open-box1');
    return this;
  }

  toggle() {
    if (this.shown) this.hide();
    else this.show();
    return this;
  }

  setOpen(open) {
    if (open) this.show();
    else this.hide();
    return this;
  }

  _click(index) {
    if (!this.shown) return;
    const emote = EMOJI_MAP[(index + 1) % 10];
    if (typeof emote === 'number') events.emit('character_emoji_display', emote);
    this.hide();
  }

  _hover(index, action) {
    if (!this.shown || action !== 'hover_in') return;

    const icon = this.icons[index];
    const base = icon.userData.baseSize;
    const { tweens } = this.ctx;
    tweens.to(icon.scale, {
      to: { x: base * 0.95, y: base * 0.95 }, duration: 0.07, ease: 'none',
      onComplete: () => {
        tweens.to(icon.scale, { to: { x: base, y: base }, duration: 0 });
      },
    });
  }

  _press(index, down) {
    if (!this.shown) return;
    const icon = this.icons[index];
    const base = icon.userData.baseSize;
    this.panel.setSeed();
    icon.scale.setScalar(base * (down ? 0.875 : 1));
    icon.updateMatrix();
  }
}
