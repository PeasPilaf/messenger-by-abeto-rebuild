import { Color } from 'three';
import { events } from '../core/Events.js';
import { PaperPanel } from './PaperPanel.js';
import { UI_FONTS, forceTypewriterEnd, isTyping, makeIcon, makeText, placeText, setText, textBlock, typewrite } from './UiText.js';

const BODY_FACE = '#F8F8F8';
const BODY_SHADOW = '#647A87';
const DEFAULT_PLATE = '#66BDE6';
const DEFAULT_NAME = 'Unnamed NPC';
const DEFAULT_TEXT = 'No dialog text provided';
const CHARS_PER_SECOND = 35;

export class DialogueUI {

  constructor(ctx) {
    this.ctx = ctx;
    this.width = 1280;
    this.height = 800;
    this.shown = false;
    this.displayed = false;
    this.id = null;
    this.isKeyTouching = false;
    this.layout = null;

    this.voice = 'male1';
    this._voiceToken = 0;
  }

  async load() {
    const { scene, glyphs } = this.ctx;

    this.bodyPanel = new PaperPanel({
      face: BODY_FACE, shadow: BODY_SHADOW, shadowOffset: 5.5, jitter: 0.02,
      inset: [9, 9, 20, 20], insetShiftY: 5, alpha: 1, renderOrder: -10,
    });
    scene.add(this.bodyPanel);

    this.namePanel = new PaperPanel({
      face: DEFAULT_PLATE, shadowOffset: 5.5, jitter: 0.02,
      inset: [5, 5, 5, 5], alpha: 1, renderOrder: -2,
    });
    scene.add(this.namePanel);

    this.arrowPanel = new PaperPanel({
      face: BODY_FACE, shadow: BODY_SHADOW, shadowOffset: 5.5, jitter: 0.065,
      alpha: 2, layers: 2, renderOrder: -10,
    });
    scene.add(this.arrowPanel);

    [this.bodyText, this.nameText] = await Promise.all([
      makeText(glyphs, {
        font: UI_FONTS.body, text: DEFAULT_TEXT.toUpperCase(), size: 24, maxWidth: 610,
        color: '#0f0f0f', align: 'left', letterSpacing: -0.05, lineHeight: 1.1,
        interior: true, small: true,
      }),
      makeText(glyphs, {
        font: UI_FONTS.heading, text: DEFAULT_NAME.toUpperCase(), size: 30, maxWidth: 600,
        color: '#ffffff', align: 'left', letterSpacing: -0.01, lineHeight: 1.1,
        shadow: true, shadowX: 0.08, shadowY: 0.08, shadowColor: '#0f0f0f',
        interior: true,
      }),
    ]);
    scene.add(this.bodyText, this.nameText);

    this.arrowIcon = await makeIcon(glyphs, 'ui/arrow', { height: 39, tint: DEFAULT_PLATE });
    scene.add(this.arrowIcon);

    this._setVisible(false);
    this.namePanel.setShow(0);
    this.bodyPanel.setShow(0);
    this.arrowPanel.setShow(0);

    this._registerInput();
    return this;
  }

  _registerInput() {
    const { input } = this.ctx;
    this.arrowRegion = input.addRegion({
      rect: { x: 945, y: 682.5, w: 65, h: 65 },
      enabled: false,
      cursor: true,
      onClick: () => this.clickArrow(),
      onHover: (action) => this.hoverArrow(action),
      onPress: (action) => this.pressArrow(action === 'touch_start'),
    });
  }

  _setVisible(visible) {
    this.bodyPanel.visible = visible;
    this.namePanel.visible = visible;
    this.arrowPanel.visible = visible;
    this.bodyText.visible = visible;
    this.nameText.visible = visible;
    this.arrowIcon.visible = visible;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const { marginTop, mobile, small } = this.ctx.responsive;

    const bottomOffset = marginTop * 1.35;
    const sideOuter = mobile ? 50 : 60;
    const sidePad = mobile ? 20 : 45;
    const topPad = mobile ? 46 : 60;
    const bottomPad = mobile ? 30 : 40;
    const fontSize = mobile ? 18 : small ? 24 : 26;
    const textWidth = Math.min(width, 820) - sidePad * 2 - sideOuter * 2;
    const letterSpacing = mobile ? -0.02 : -0.05;
    const bottomShift = mobile ? 30 : small ? 25 : 20;
    this.bodyFontSize = fontSize;
    this.bodyTextWidth = textWidth;
    this.bodyLetterSpacing = letterSpacing;

    const block = textBlock(this.bodyText);
    const boxWidth = textWidth + sidePad * 2;
    const boxHeight = block.height - block.topAlign + topPad + bottomPad;
    const boxBottom = height - bottomOffset - bottomShift;
    const boxTop = boxBottom - boxHeight;
    const boxLeft = width * 0.5 - boxWidth * 0.5;

    this.bodyPanel.setSize(boxWidth, boxHeight);
    this.bodyPanel.setScreenCentre(width * 0.5, boxTop + boxHeight * 0.5);

    placeText(this.bodyText, width * 0.5 - this.bodyText.bounds.width * 0.5, boxTop + topPad);

    const plateSideOuter = mobile ? 15 : 25;
    const platePad = mobile ? 20 : 30;
    const plateTopPad = mobile ? 18 : 22;
    const plateBottomPad = mobile ? 20 : 25;
    const plateFontSize = mobile ? 25 : small ? 30 : 35;
    const plateSpacing = mobile ? -0.005 : -0.01;

    this.plateFontSize = plateFontSize;
    this.plateSpacing = plateSpacing;
    const plateWidth = this.nameText.bounds.width + platePad * 2;
    const plateBlock = textBlock(this.nameText);
    const plateHeight = plateBlock.height - plateBlock.topAlign +
      plateBlock.topAlign + plateTopPad + plateBottomPad;
    const plateLeft = boxLeft - plateSideOuter;
    const plateTop = boxTop - plateHeight + 10;
    this.namePanel.setSize(plateWidth, plateHeight);
    this.namePanel.setScreenCentre(plateLeft + plateWidth * 0.5, plateTop + plateHeight * 0.5);
    placeText(this.nameText, plateLeft + platePad, plateTop + plateBlock.topAlign + plateTopPad);

    const arrowSize = mobile ? 50 : small ? 65 : 80;
    const arrowInsetX = mobile ? 25 : small ? 20 : 30;
    const arrowInsetY = mobile ? 30 : small ? 40 : 50;
    const arrowCentreX = boxLeft + boxWidth - arrowSize * 0.5 + arrowInsetX;
    const arrowCentreY = boxBottom - arrowSize * 0.5 + arrowInsetY;
    this.arrowPanel.setSize(arrowSize, arrowSize);
    this.arrowPanel.setScreenCentre(arrowCentreX, arrowCentreY);
    this.arrowSize = arrowSize;
    this.arrowIconHeight = arrowSize * 0.6;
    this.arrowIcon.scale.setScalar(this.arrowIconHeight);

    this.arrowIcon.position.set(
      arrowCentreX + this.arrowIconHeight * 0.075, -arrowCentreY, 0,
    );
    this.arrowIcon.updateMatrix();

    this.arrowRegion.rect = {
      x: arrowCentreX - arrowSize * 0.5,
      y: arrowCentreY - arrowSize * 0.5,
      w: arrowSize,
      h: arrowSize,
    };

    this.layout = {
      fontSize, textWidth, letterSpacing, plateFontSize, plateSpacing,
      boxTop, boxBottom, boxLeft, boxWidth, boxHeight,
    };
  }

  async _rebuild(text, name) {
    const { bodyFontSize, bodyTextWidth, bodyLetterSpacing, plateFontSize, plateSpacing } = this;

    this.bodyText.textOptions.size = bodyFontSize;
    this.bodyText.textOptions.maxWidth = bodyTextWidth;
    this.bodyText.textOptions.letterSpacing = bodyLetterSpacing;
    this.nameText.textOptions.size = plateFontSize;
    this.nameText.textOptions.maxWidth = 600;
    this.nameText.textOptions.letterSpacing = plateSpacing;
    await Promise.all([this.bodyText.setText(text), this.nameText.setText(name)]);
    this.resize(this.width, this.height);
  }

  _showArrowIcon(delay = 0.35) {
    const anim = { v: 0 };
    this.ctx.tweens.to(anim, {
      from: { v: 0 }, to: { v: 1 }, duration: 0.2, delay, ease: 'none',
      onStart: () => {
        this.arrowIcon.visible = true;
        this.arrowIcon.scale.setScalar(this.arrowIconHeight * 0.5);
      },
      onUpdate: () => {
        const stepped = Math.floor(anim.v * 2) / 2;
        this.arrowIcon.scale.setScalar(this.arrowIconHeight * stepped);
        this.arrowIcon.updateMatrix();
      },
    });
  }

  _hideArrowIcon() {
    this.ctx.tweens.to(this.arrowIcon.scale, {
      to: { x: 0, y: 0 }, duration: 0.05, ease: 'none',
      onComplete: () => { this.arrowIcon.visible = false; },
    });
  }

  async show({ text = DEFAULT_TEXT, name = DEFAULT_NAME, color = DEFAULT_PLATE, id = null, voice = 'male1' } = {}) {
    this.shown = true;
    this.displayed = false;
    this.id = id ?? this.id;
    this.voice = voice || 'male1';
    const accent = color || DEFAULT_PLATE;
    await this._rebuild(String(text || DEFAULT_TEXT).toUpperCase(), String(name || DEFAULT_NAME).toUpperCase());
    if (!this.shown) return;

    this.namePanel.setColors(accent);
    this.arrowIcon.material.setOverwriteColor(accent);
    this._setVisible(true);
    this.bodyText.material.setHide(0);
    this.nameText.material.setHide(0);
    this.bodyText.material.setShow(0);

    const { tweens } = this.ctx;
    this.bodyPanel.show(tweens, { duration: 0.35 });
    this.namePanel.show(tweens, { duration: 0.35 });
    this.nameText.material.setShow(0);
    tweens.to(this.nameText.material.uniforms.uShow, {
      from: { value: 0 }, to: { value: 1 }, duration: 0.35, delay: 0.25, ease: 'none',
    });
    this.arrowPanel.show(tweens, { duration: 0.3, delay: 0.3 });
    this._showArrowIcon(0.35);
    tweens.after(0.75, () => { this.arrowRegion.enabled = true; });

    this.bodyText.visible = true;
    tweens.after(0.45, () => {
      if (!this.shown) return;
      this.displayed = true;
      const token = ++this._voiceToken;
      const typing = typewrite(this.bodyText, CHARS_PER_SECOND);
      this._playVoice(true);

      typing.then(() => {
        if (token !== this._voiceToken) return;
        this._playVoice(false);
        events.emit('npc_dialog_typing_end', this.id);
      });
    });
    this.ctx.boxAudio(0.3);
    events.emit('npc_dialog_shown', this.id);
    return this;
  }

  hide() {
    if (!this.shown) return this;
    this._voiceToken++;
    this.shown = false;
    this.displayed = false;
    this.arrowRegion.enabled = false;
    this.isKeyTouching = false;
    const { tweens } = this.ctx;
    tweens.to(this.bodyText.material.uniforms.uHide, {
      to: { value: 1 }, duration: 0.05, ease: 'none',
      onComplete: () => { this.bodyText.visible = false; },
    });
    tweens.to(this.nameText.material.uniforms.uHide, {
      to: { value: 1 }, duration: 0.05, ease: 'none',
      onComplete: () => { this.nameText.visible = false; },
    });
    this.bodyPanel.hide(tweens, { duration: 0.15, delay: 0.05 });
    this.namePanel.hide(tweens, { duration: 0.1, delay: 0.05 });
    this.arrowPanel.hide(tweens, { duration: 0.1 });
    this._hideArrowIcon();
    this.ctx.boxAudio(0.1);
    this._playVoice(false);
    return this;
  }

  hideFinal(expectedId = null) {
    if (this.id === null) return this;
    if (expectedId !== null && expectedId !== this.id) return this;
    const id = this.id;
    this.id = null;
    this.hide();
    events.emit('npc_dialog_hidden', id);
  }

  advance() {
    if (!this.shown) return false;
    if (isTyping(this.bodyText)) {
      forceTypewriterEnd(this.bodyText);
      this._playVoice(false);
      return false;
    }
    events.emit('npc_force_next_dialog', this.id);
    return true;
  }

  clickArrow() {
    if (this.shown) this.advance();
  }

  close() {
    events.emit('npc_force_close_dialog', this.id);
  }

  onKey(code, type) {
    if (!this.shown || !this.displayed) return false;
    const escape = code === 'Escape';
    const advanceKey = code === 'Space' || code === 'KeyE';
    if (!escape && !advanceKey) return false;
    if (type === 'keydown') {
      if (escape) {
        this.close();
      } else if (this.bodyPanel.uniforms.uShow.value >= 0.8 && !this.bodyText.material.uniforms.uHide.value) {

        if (isTyping(this.bodyText)) {
          forceTypewriterEnd(this.bodyText);
          this._playVoice(false);
        } else if (!this.isKeyTouching) {
          this.isKeyTouching = true;
          this.pressArrow(true);
        }
      }
    } else if (advanceKey && this.isKeyTouching) {
      this.isKeyTouching = false;
      this.pressArrow(false);
      if (this.shown) this.advance();
    }
    return true;
  }

  hoverArrow(action) {
    if (action !== 'hover_in') return;
    const { tweens } = this.ctx;
    const anim = { t: 0 };
    tweens.to(anim, {
      from: { t: 0 }, to: { t: 1 }, duration: 0.07, ease: 'none',
      onStart: () => {
        this.arrowPanel.setSeed(Math.random() * 22.34);
        this.arrowPanel.setHoverScale(1.1);
        this.arrowIcon.scale.setScalar(this.arrowIconHeight * 0.935);
        this.arrowIcon.updateMatrix();
      },
      onComplete: () => {
        this.arrowPanel.setSeed(Math.random() * 3.34);
        this.arrowPanel.setHoverScale(1);
        this.arrowIcon.scale.setScalar(this.arrowIconHeight);
        this.arrowIcon.updateMatrix();
      },
    });
    events.emit('webgl_play_audio', 'hover2');
  }

  pressArrow(down) {
    this.arrowPanel.setHoverScale(down ? 0.925 : 1);
    this.arrowIcon.scale.setScalar(this.arrowIconHeight * (down ? 0.9 : 1));
    this.arrowIcon.updateMatrix();
    this.arrowPanel.setSeed(Math.random() * 43.23);
    events.emit('webgl_play_audio', down ? 'click2' : 'click3');
  }

  _playVoice(on) {

    if (this.voice !== 'quest') return;
    events.emit('webgl_set_audio_volume', 'dialogue-quest', on ? 0.075 : 0);
  }

  static plateColor(color) {
    return new Color(color ?? DEFAULT_PLATE);
  }
}
