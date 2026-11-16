import {
  BufferAttribute, Color, CustomBlending, DoubleSide, Mesh, OneFactor,
  OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { events } from '../core/Events.js';
import { UI_FONTS, makeText, placeText } from './UiText.js';

const COLOR = '#ffffff';
const SHADOW_COLOR = '#030303';
const OVERLAY = '#283436';
const OVERLAY_ALPHA = 0.9;

const TINT_VERTEX =  `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const TINT_FRAGMENT =  `
  uniform vec3 uColor;
  uniform float uAlpha;
  vec3 linearToSRGB(vec3 c) {
    vec3 low = c * 12.92;
    vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(high, low, step(c, vec3(0.0031308)));
  }
  void main() {
    if (uAlpha <= 0.0001) discard;
    gl_FragColor = vec4(linearToSRGB(uColor), uAlpha);
  }
`;

function makeUnderline() {
  const vertex =  `
    uniform float uHover;
    attribute float side;
    varying vec2 vUv;
    varying float vSide;
    void main() {
      vSide = side;
      vUv = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      if (side > 0.5) world.xy += vec2(2.0, -2.0);
      world.y -= uHover * 3.0;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
`;
  const fragment =  `
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform float uShow;
    uniform float uHide;
    varying vec2 vUv;
    varying float vSide;
    void main() {
      vec3 colour = vSide > 0.5 ? uColor2 : uColor1;
      float show = step(vUv.x, uShow) * step(uHide, vUv.x);
      if (show < 0.0001) discard;

      gl_FragColor = vec4(-colour, 1.0);
    }
`;

  const face = new PlaneGeometry(1, 1);
  const shadow = new PlaneGeometry(1, 1);
  const geometry = mergeGeometries([face, shadow]);
  face.dispose();
  shadow.dispose();
  geometry.setAttribute('side', new BufferAttribute(
    new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1));

  const material = new ShaderMaterial({
    uniforms: {
      uColor1: { value: new Color(COLOR) },
      uColor2: { value: new Color(SHADOW_COLOR) },
      uShow: { value: 0 },
      uHide: { value: 0 },
      uHover: { value: 0 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.visible = false;
  return mesh;
}

export class EndScreenUI {
  constructor(ctx) {
    this.ctx = ctx;
    this.width = 1280;
    this.height = 800;
    this.shown = false;
    this.size = 24;
  }

  async load() {
    const { scene, glyphs, outline } = this.ctx;

    this.text = await makeText(glyphs, {
      font: UI_FONTS.body, text: 'PLACEHOLDER', size: 24, maxWidth: 770,
      color: COLOR, align: 'center', letterSpacing: -0.01, lineHeight: 1.1,
      shadow: true, shadowX: 0.06, shadowY: 0.06, shadowColor: SHADOW_COLOR,
      interior: true,
    });
    this.text.renderOrder = 20;
    scene.add(this.text);

    this.continueText = await makeText(glyphs, {
      font: UI_FONTS.body, text: '>CONTINUE', size: 26.4, maxWidth: 770,
      color: COLOR, align: 'center', letterSpacing: -0.01, lineHeight: 1.1,
      shadow: true, shadowX: 0.06, shadowY: 0.06, shadowColor: SHADOW_COLOR,
      interior: true,
    });
    this.continueText.renderOrder = 20;
    scene.add(this.continueText);

    this.underline = makeUnderline();
    scene.add(this.underline);

    this.tint = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
      name: 'end-screen-tint',
      uniforms: { uColor: { value: new Color(OVERLAY) }, uAlpha: { value: 0 } },
      vertexShader: TINT_VERTEX,
      fragmentShader: TINT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    this.tint.frustumCulled = false;
    this.tint.renderOrder = -1000;
    this.tint.visible = false;
    outline.scene.add(this.tint);

    this._registerInput();
    this._setVisible(false);
    return this;
  }

  _registerInput() {
    this.buttonRegion = this.ctx.input.addRegion({
      rect: { x: 0, y: 0, w: 1, h: 1 },
      enabled: false,
      cursor: true,
      onClick: () => this.clickContinue(),
      onHover: (action) => this._hover(action),
    });
  }

  _setVisible(visible) {
    this.text.visible = visible;
    this.continueText.visible = visible;
    this.underline.visible = visible;
    this.tint.visible = visible;
  }

  buildString(size) {
    let out = '';
    out += `{#size(${(size * 2).toFixed(2)})} YOU MADE IT! {#size(${size.toFixed(2)})}\n\n\n`;
    out += 'YOU FINISHED ALL THE DELIVERIES!\n';
    out += 'STAY AND EXPLORE THE WORLD, OR REFRESH YOUR BROWSER TO START AGAIN.\n\n';
    out += 'CREATED IN 2025 BY VICENTE LUCENDO AND MICHAEL SUNGAILA. MUSIC BY KEVIN COLOMBIN.\n\n';
    out += 'HI@ABETO.CO';
    return out;
  }

  async rebuild() {
    this.text.textOptions.size = this.size;
    this.text.textOptions.maxWidth = this.textWidth ?? 770;
    this.continueText.textOptions.size = this.size * 1.1;
    this.continueText.textOptions.maxWidth = this.textWidth ?? 770;
    await Promise.all([
      this.text.setText(this.buildString(this.size)),
      this.continueText.setText('>CONTINUE'),
    ]);
    this.resize(this.width, this.height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const { mobile, small } = this.ctx.responsive;
    this.size = mobile ? 20 : small ? 24 : 30;
    this.textWidth = Math.min(width, 850) - 40 * 2;

    const bodyHeight = this.text.bounds.height;
    const continueHeight = this.continueText.bounds.height;
    const gap = this.size * 2;
    const barGap = 10;
    const barHeight = 3;
    const total = bodyHeight + gap + continueHeight + barGap + barHeight;
    const topAlign = this.size * Math.abs(this.text.metrics.ascent - this.text.metrics.descent);

    const bodyBaseline = height * 0.5 + topAlign - total * 0.5 * 0.95;
    placeText(this.text, width * 0.5 - this.text.bounds.width * 0.5, bodyBaseline);
    const continueBaseline = bodyBaseline + bodyHeight - topAlign + gap;
    placeText(this.continueText, width * 0.5 - this.continueText.bounds.width * 0.5, continueBaseline);

    const barWidth = this.continueText.bounds.width;
    this.underline.scale.set(barWidth, barHeight, 1);
    this.underline.position.set(width * 0.5, -(continueBaseline + barGap), 0);
    this.underline.updateMatrix();

    const hitWidth = this.continueText.bounds.width + 40;
    const hitHeight = this.continueText.bounds.height + 40;
    this.buttonRegion.rect = {
      x: width * 0.5 - hitWidth * 0.5,
      y: continueBaseline - hitHeight * 0.6,
      w: hitWidth,
      h: hitHeight,
    };
    this.layout = { bodyBaseline, continueBaseline, total };
  }

  async show() {
    if (this.shown) return this;
    this.shown = true;
    this.size = this.ctx.responsive.mobile ? 20 : this.ctx.responsive.small ? 24 : 30;
    await this.rebuild();
    this._setVisible(true);
    this.text.material.setHide(0);
    this.continueText.material.setHide(0);
    this.underline.material.uniforms.uHide.value = 0;
    this.buttonRegion.enabled = true;

    const { tweens } = this.ctx;
    this.tint.material.uniforms.uAlpha.value = 0;
    tweens.to(this.tint.material.uniforms.uAlpha, {
      from: { value: 0 }, to: { value: OVERLAY_ALPHA }, duration: 0.6,
    });
    tweens.to(this.text.material.uniforms.uShow, {
      from: { value: 0 }, to: { value: 1 }, duration: 1.5, delay: 0.1, ease: 'none',
    });
    tweens.to(this.continueText.material.uniforms.uShow, {
      from: { value: 0 }, to: { value: 1 }, duration: 0.65, delay: 1.6, ease: 'none',
    });
    tweens.to(this.underline.material.uniforms.uShow, {
      from: { value: 0 }, to: { value: 1 }, duration: 0.65, delay: 1.7, ease: 'none',
    });
    events.emit('overlay', true);
    return this;
  }

  hide() {
    if (!this.shown) return this;
    this.shown = false;
    this.buttonRegion.enabled = false;
    const { tweens } = this.ctx;
    tweens.to(this.tint.material.uniforms.uAlpha, {
      from: { value: OVERLAY_ALPHA }, to: { value: 0 }, duration: 0.3, delay: 0.2,
      onComplete: () => { this.tint.visible = false; },
    });
    for (const object of [this.text, this.continueText]) {
      tweens.to(object.material.uniforms.uHide, {
        to: { value: 1 }, duration: 0.1, ease: 'none',
        onComplete: () => { object.visible = false; },
      });
    }
    tweens.to(this.underline.material.uniforms.uHide, {
      to: { value: 1 }, duration: 0.1, ease: 'none',
      onComplete: () => { this.underline.visible = false; },
    });
    events.emit('overlay', false);
    return this;
  }

  clickContinue() {
    events.emit('end_screen_hide');
    events.emit('end_screen_continue');
    this.hide();
  }

  _hover(action) {
    if (action !== 'hover_in' || !this.shown) return;
    const { tweens } = this.ctx;
    tweens.to(this.underline.material.uniforms.uHover, {
      from: { value: 0 }, to: { value: 1 }, duration: 0,
      onComplete: () => {
        tweens.to(this.underline.material.uniforms.uHover, {
          to: { value: 0 }, duration: 0, delay: 0.1,
        });
      },
    });
    tweens.to(this.continueText.scale, {
      from: { x: 1, y: 1 }, to: { x: 1.05, y: 1.05 }, duration: 0,
      onComplete: () => {
        tweens.to(this.continueText.scale, { to: { x: 1, y: 1 }, duration: 0, delay: 0.1 });
      },
    });
    events.emit('webgl_play_audio', 'hover2');
  }
}
