import { Color, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { events } from '../core/Events.js';
import { PaperPanel } from './PaperPanel.js';
import { UI_FONTS, makeText, placeText, textBlock } from './UiText.js';

const FACE = '#F8F8F8';
const SHADOW = '#647A87';
const ENABLED = '#0f0f0f';
const DISABLED = '#6D6D6D';
const DOT = '#d85656';

const DOT_VERTEX =  `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOT_FRAGMENT =  `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    if (length(vUv - 0.5) > 0.5) discard;
    gl_FragColor = vec4(uColor, 1.0);
  }
`;

function colorf(hex) {
  const color = new Color(hex);
  return `${color.r},${color.g},${color.b},1`;
}

export class ChecklistUI {
  constructor(ctx) {
    this.ctx = ctx;
    this.width = 1280;
    this.height = 800;
    this.shown = false;
    this.size = 24;
    this.nothingStarted = true;
    this.dotShown = false;
    this.entries = [];
  }

  setEntries(entries) {
    this.entries = (entries ?? []).map((entry, index) => ({
      n: index + 1,
      text: String(entry.text ?? ''),
      done: Number(entry.done ?? 0),
      total: Number(entry.total ?? 0),
    }));
    this.nothingStarted = this.entries.every((entry) => entry.done === 0);
    return this;
  }

  async load() {
    const { scene, glyphs } = this.ctx;
    this.panel = new PaperPanel({
      face: FACE, shadow: SHADOW, shadowOffset: 5.5, jitter: 0.02,
      inset: [10, 10, 10, 10], alpha: 1, renderOrder: -10,
    });
    scene.add(this.panel);

    this.text = await makeText(glyphs, {
      font: UI_FONTS.body, text: 'CHECKLIST:', size: 24, maxWidth: 355,
      color: ENABLED, align: 'left', letterSpacing: -0.01, lineHeight: 1.1,
      interior: true, small: true,
    });
    scene.add(this.text);

    this.dot = new Mesh(new PlaneGeometry(1, 1), new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(DOT) },
        uShow: { value: 0 },
        uSideShow: { value: 0 },
      },
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    }));
    this.dot.name = 'checklist red dot';
    this.dot.frustumCulled = false;
    this.dot.renderOrder = 100;
    this.dot.visible = false;
    scene.add(this.dot);

    this._setVisible(false);
    this.panel.setShow(0);
    return this;
  }

  _setVisible(visible) {
    this.panel.visible = visible;
    this.text.visible = visible;
  }

  buildString() {
    const size = this.size;
    let out = 'CHECKLIST:\n\n';
    this.entries.forEach((entry, index) => {
      const complete = entry.done === entry.total && entry.done > 0;
      const started = entry.done > 0;
      let open = '';
      let close = '';
      if (!this.nothingStarted && (!started || complete)) {
        open = '{#';
        close = '{#';
        if (!started) {
          open += `colorf(${colorf(DISABLED)});`;
          close += `colorf(${colorf(ENABLED)});`;
        }
        if (complete) {
          open += 'strike(true);';
          close += 'strike(false);';
        }
        open += '}';
        close += '}';
      }
      out += `${open}${entry.n}. ${entry.text} (${entry.done}/${entry.total})${close}`;
      if (index < this.entries.length - 1) {
        out += `{#size(${(size * 0.75).toFixed(2)})}\n\n{#size(${size.toFixed(2)})}`;
      }
    });
    return out;
  }

  async rebuild() {
    this.text.textOptions.size = this.size;
    this.text.textOptions.maxWidth = this.textWidth ?? 355;
    await this.text.setText(this.buildString());
    this.resize(this.width, this.height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const { mobile, small, marginLeft, marginTop } = this.ctx.responsive;

    const buttonSize = mobile ? 45 : small ? 65 : 70;
    const outer = mobile ? 15 : 20;
    const rightGap = mobile ? 30 : 40;
    const sidePad = mobile ? 12 : 20;
    const topPad = mobile ? 35 : 50;
    const bottomPad = mobile ? 10 : 20;
    this.size = mobile ? 20 : small ? 24 : 26;
    this.textWidth = Math.min(width, 550) - sidePad * 2 - marginLeft - buttonSize - outer - rightGap;

    const panelWidth = this.textWidth + sidePad * 2;
    const panelHeight = this.text.bounds.height + topPad + bottomPad;
    const rightEdge = width - marginLeft - buttonSize - outer;
    const left = rightEdge - panelWidth;
    this.panel.setSize(panelWidth, panelHeight);
    this.panel.setScreenCentre(left + panelWidth * 0.5, marginTop + panelHeight * 0.5);
    placeText(this.text, left + sidePad, marginTop + topPad);

    this.dotSize = mobile ? 15 : 20;
    this.dot.position.set(width - marginLeft, -marginTop, 0);
    this.dot.updateMatrix();

    this.layout = { left, top: marginTop, width: panelWidth, height: panelHeight };
  }

  async show(delay = 0) {
    if (this.shown) return this;
    this.shown = true;
    this.hideDot();
    await this.rebuild();
    this._setVisible(true);
    this.text.material.setHide(0);
    this.text.material.setShow(0);
    const { tweens } = this.ctx;
    this.panel.show(tweens, { duration: 0.2, delay });
    tweens.to(this.text.material.uniforms.uShow, {
      from: { value: 0 }, to: { value: 1 }, duration: 0.2, delay: delay + 0.2, ease: 'none',
    });
    events.emit('webgl_play_audio', 'open-box2');
    events.emit('webgl_play_audio', 'open-box-checklist');
    return this;
  }

  hide() {
    if (!this.shown) return this;
    this.shown = false;
    const { tweens } = this.ctx;
    tweens.to(this.text.material.uniforms.uHide, {
      to: { value: 1 }, duration: 0.05, ease: 'none',
      onComplete: () => { this.text.visible = false; },
    });
    this.panel.hide(tweens, { duration: 0.15, delay: 0.05 });
    events.emit('webgl_play_audio', 'open-box1');
    return this;
  }

  toggle() {
    if (this.shown) this.hide();
    else this.show();
    return this;
  }

  update(showDot = false, allDone = false) {
    if (allDone) this.hideDot();
    else if (showDot) this._showDotTween(1);
    this.rebuild();
    return this;
  }

  _showDotTween(value) {
    this.dotShown = value > 0;
    const { tweens } = this.ctx;
    tweens.to(this.dot.material.uniforms.uShow, {
      to: { value }, duration: value ? 0.3 : 0.2, delay: value ? 1 : 0,
      onStart: () => { this.dot.visible = true; },
      onUpdate: () => this._applyDotScale(),
      onComplete: () => {
        this.dot.visible = value > 0;
        this._applyDotScale();
      },
    });
    return this;
  }

  showDot() {
    return this._showDotTween(1);
  }

  hideDot() {
    if (!this.dotShown) return this;
    return this._showDotTween(0);
  }

  setSideIconsVisible(visible) {
    const { tweens } = this.ctx;
    tweens.to(this.dot.material.uniforms.uSideShow, {
      to: { value: visible ? 1 : 0 },
      duration: 0.1,
      delay: visible ? 0.4 : 0.2,
      onUpdate: () => this._applyDotScale(),
    });
    return this;
  }

  _applyDotScale() {
    const show = this.dot.material.uniforms.uShow.value;
    const side = this.dot.material.uniforms.uSideShow.value;
    this.dot.scale.setScalar(this.dotSize * show * side);
    this.dot.updateMatrix();
  }
}
