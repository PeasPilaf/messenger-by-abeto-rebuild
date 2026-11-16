import { events } from '../core/Events.js';
import { PaperPanel } from './PaperPanel.js';
import { UI_FONTS, makeIcon, makeText, placeText, textBlock, typewrite } from './UiText.js';

const CARD_FACE = '#F8F8F8';
const CARD_SHADOW = '#647A87';
const DEFAULTS = {
  title: 'next up',
  text: 'No quest text provided',
  icon: 'ui/sidebuttons/poo.icon',
  color: '#f5fdff',
};
const DEBOUNCE = 0.5;
const AUTO_HIDE = 6;

export class QuestCardUI {
  constructor(ctx) {
    this.ctx = ctx;
    this.width = 1280;
    this.height = 800;
    this.shown = false;
    this.displayed = false;
    this.iconCache = new Map();
    this.currentIconName = null;
    this.generation = 0;
    this.pendingTimer = null;
    this.autoHideTimer = null;
  }

  async load() {
    const { scene, glyphs } = this.ctx;
    this.bodyPanel = new PaperPanel({
      face: CARD_FACE, shadow: CARD_SHADOW, shadowOffset: 5.5, jitter: 0.02,
      inset: [0, 0, 0, 0], insetShiftY: 0, alpha: 1, renderOrder: -10,
    });
    this.titlePanel = new PaperPanel({
      face: DEFAULTS.color, shadowOffset: 5.5, jitter: 0.02,
      inset: [5, 5, 5, 5], alpha: 1, renderOrder: -2,
    });
    scene.add(this.bodyPanel, this.titlePanel);

    [this.bodyText, this.titleText] = await Promise.all([
      makeText(glyphs, {
        font: UI_FONTS.body, text: 'PLACEHOLDER', size: 23, maxWidth: 300,
        color: '#0f0f0f', align: 'left', letterSpacing: -0.05, lineHeight: 1.1,
        interior: true, small: true,
      }),
      makeText(glyphs, {
        font: UI_FONTS.heading, text: 'PLACEHOLDER', size: 30, maxWidth: 400,
        color: '#ffffff', align: 'left', letterSpacing: -0.01, lineHeight: 1.1,
        shadow: true, shadowX: 0.08, shadowY: 0.08, shadowColor: '#0f0f0f',
        interior: true,
      }),
    ]);
    scene.add(this.bodyText, this.titleText);

    this.setVisible(false);
    this.bodyPanel.setShow(0);
    this.titlePanel.setShow(0);
    return this;
  }

  setVisible(visible) {
    this.bodyPanel.visible = visible;
    this.titlePanel.visible = visible;
    this.bodyText.visible = visible;
    this.titleText.visible = visible;
    if (this.iconMesh) this.iconMesh.visible = visible;
  }

  async _getIcon(name) {
    const key = String(name ?? DEFAULTS.icon).replace(/\.icon$/, '');
    if (this.iconCache.has(key)) return this.iconCache.get(key);
    const mesh = await makeIcon(this.ctx.glyphs, key, { height: 1 });

    const resolution = this.ctx.ui.deviceResolution;
    if (resolution) mesh.material.setResolution?.(resolution.width, resolution.height);
    mesh.renderOrder = -4;
    mesh.visible = false;
    this.ctx.scene.add(mesh);
    this.iconCache.set(key, mesh);
    return mesh;
  }

  display({ title, icon, text, color, isComplete = false } = {}) {
    if (this.shown) this.hide();
    if (this.pendingTimer) this.pendingTimer.kill();
    this.pendingTimer = this.ctx.tweens.after(DEBOUNCE, () => {
      this.pendingTimer = null;
      this.show({ title, icon, text, color, isComplete });
    });
    return this;
  }

  async show({ title, icon, text, color, isComplete = false } = {}) {
    this.shown = true;
    const generation = ++this.generation;
    const titleText = String(title || DEFAULTS.title).toUpperCase();
    const bodyText = String(text || DEFAULTS.text).toUpperCase();
    const cardColor = color || DEFAULTS.color;

    this.titleText.textOptions.size = this.titleFontSize ?? 30;
    this.titleText.textOptions.maxWidth = this.titleWidth ?? 400;
    this.bodyText.textOptions.size = this.cardFontSize ?? 23;
    this.bodyText.textOptions.maxWidth = this.textWidth ?? 300;

    const iconMesh = await this._getIcon(icon || DEFAULTS.icon);
    await Promise.all([
      this.titleText.setText(titleText),
      this.bodyText.setText(bodyText),
    ]);
    if (!this.shown || generation !== this.generation) return this;

    if (this.iconMesh && this.iconMesh !== iconMesh) this.iconMesh.visible = false;
    this.iconMesh = iconMesh;
    this.currentIconName = icon;

    this.iconMesh.material.setOverwriteColor(isComplete ? cardColor : '#ffffff');
    if (!isComplete) this.iconMesh.material.uniforms.uOverwriteColor.value = false;

    this.titlePanel.setColors(cardColor);
    this.resize(this.width, this.height);
    this.setVisible(true);
    this.bodyText.material.setHide(0);
    this.titleText.material.setHide(0);
    this.bodyText.material.setShow(0);
    this.titleText.material.setShow(0);

    const { tweens } = this.ctx;
    this.titlePanel.show(tweens, { duration: 0.35 });
    tweens.to(this.titleText.material.uniforms.uShow, {
      from: { value: 0 }, to: { value: 1 }, duration: 0.35, delay: 0.25, ease: 'none',
    });
    this.bodyPanel.show(tweens, { duration: 0.35, delay: 0.1 });

    tweens.after(0.55, () => {
      if (!this.shown) return;
      this.displayed = true;
      typewrite(this.bodyText, 45);
    });
    this._showIcon(tweens, 0.55);

    this.ctx.boxAudio(0.5);
    if (this.autoHideTimer) this.autoHideTimer.kill();
    this.autoHideTimer = tweens.after(AUTO_HIDE, () => this.hide());
    return this;
  }

  _showIcon(tweens, delay) {
    if (!this.iconMesh) return;
    tweens.kill(this.iconMesh.scale);
    const anim = { v: 0 };
    tweens.to(anim, {
      from: { v: 0 }, to: { v: 1 }, duration: 0.2, delay, ease: 'none',
      onStart: () => { this.iconMesh.visible = true; },
      onUpdate: () => {
        const stepped = Math.floor(anim.v * 2) / 2;
        this.iconMesh.scale.setScalar(this.iconCell * stepped);
        this.iconMesh.updateMatrix();
      },
    });
  }

  hide() {
    if (!this.shown) return this;
    this.shown = false;
    this.displayed = false;
    if (this.autoHideTimer) {
      this.autoHideTimer.kill();
      this.autoHideTimer = null;
    }
    const { tweens } = this.ctx;
    tweens.to(this.bodyText.material.uniforms.uHide, {
      to: { value: 1 }, duration: 0.05, ease: 'none',
      onComplete: () => { this.bodyText.visible = false; },
    });
    tweens.to(this.titleText.material.uniforms.uHide, {
      to: { value: 1 }, duration: 0.05, ease: 'none',
      onComplete: () => { this.titleText.visible = false; },
    });
    if (this.iconMesh) {
      tweens.to(this.iconMesh.scale, { to: { x: 0, y: 0 }, duration: 0.05, ease: 'none' });
    }
    this.bodyPanel.hide(tweens, { duration: 0.15, delay: 0.05 });
    this.titlePanel.hide(tweens, { duration: 0.1, delay: 0.05 });
    this.ctx.boxAudio(0.1);
    return this;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const { marginTop, marginLeft, mobile, small } = this.ctx.responsive;

    const outer = mobile ? 25 : 30;
    const pad = mobile ? 20 : 25;
    const topPad = 40;
    const bottomPad = mobile ? 20 : 25;
    const iconColumn = mobile ? 45 : small ? 65 : 70;
    const cardWidth = Math.min(450, width - outer * 2 - marginLeft - iconColumn);
    const iconTextGap = mobile ? 15 : 25;
    const inner = cardWidth - pad * 2 - iconTextGap;
    const iconCell = inner * 0.25;
    const textWidth = inner - iconCell;
    const fontSize = mobile ? 17 : small ? 23 : 25;
    const spacing = mobile ? -0.02 : -0.05;

    this.cardFontSize = fontSize;
    this.textWidth = textWidth;
    this.iconCell = iconCell;

    const block = textBlock(this.bodyText);
    const extraLines = block.lineSize * Math.max(0, block.lines - 1);
    const rowHeight = Math.max(extraLines, iconCell);
    const cardHeight = rowHeight + topPad + bottomPad;
    const cardBottom = height - marginTop * 1.25;
    const cardTop = cardBottom - cardHeight;

    const centreX = width * 0.5;
    const rightLimit = centreX - marginLeft - iconColumn - outer;
    const shift = Math.max(0, cardWidth * 0.5 - rightLimit);
    const cardLeft = centreX - shift - cardWidth * 0.5;

    this.bodyPanel.setSize(cardWidth, cardHeight);
    this.bodyPanel.setScreenCentre(cardLeft + cardWidth * 0.5, cardTop + cardHeight * 0.5);

    this.bodyPanel.setInset([
      pad + iconCell + iconTextGap * 0.5,
      pad,
      bottomPad,
      topPad - block.topAlign,
    ]);
    this.bodyPanel.uniforms.uInsetShiftY.value = 6;

    const iconCentreX = cardLeft + pad + iconCell * 0.5;
    const iconCentreY = cardTop + cardHeight * 0.5;
    if (this.iconMesh) {

      const aspect = this.iconMesh.geometry._bounds
        ? this.iconMesh.geometry._bounds.width : 1;
      const height = aspect > 1 ? iconCell / aspect : iconCell;
      this.iconMesh.scale.setScalar(height);
      this.iconMesh.position.set(iconCentreX, -iconCentreY, 0);
      this.iconMesh.updateMatrix();
      this.iconCellSize = height;
    }

    const textBaseline = cardTop + topPad + (rowHeight - extraLines) * 0.5;
    placeText(this.bodyText, iconCentreX + iconCell * 0.5 + iconTextGap, textBaseline);

    const plateOuter = mobile ? 15 : 25;
    const platePad = mobile ? 20 : 30;
    const plateTopPad = mobile ? 11 : 15;
    const plateBottomPad = mobile ? 15 : 22;
    const titleFontSize = mobile ? 25 : 30;
    const plateSpacing = mobile ? -0.005 : -0.01;
    this.titleFontSize = titleFontSize;
    this.titleWidth = cardWidth - platePad * 2 + plateOuter;
    this.titleText.textOptions.size = titleFontSize;
    this.titleText.textOptions.maxWidth = this.titleWidth;
    this.titleText.textOptions.letterSpacing = plateSpacing;

    const plateBlock = textBlock(this.titleText);
    const plateWidth = this.titleText.bounds.width + platePad * 2;
    const plateHeight = plateBlock.height + plateTopPad + plateBottomPad;
    const plateLeft = cardLeft - plateOuter;
    const plateTop = cardTop - plateHeight + 10;
    this.titlePanel.setSize(plateWidth, plateHeight);
    this.titlePanel.setScreenCentre(plateLeft + plateWidth * 0.5, plateTop + plateHeight * 0.5);
    placeText(this.titleText, plateLeft + platePad, plateTop + plateBlock.topAlign + plateTopPad);

    this.layout = { cardLeft, cardTop, cardWidth, cardHeight, iconCell };
  }
}
