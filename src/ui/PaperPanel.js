import { BufferGeometry, BufferAttribute, Color, Mesh, ShaderMaterial, Vector4 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PlaneGeometry } from 'three';
import { rectCenter } from './UiLayout.js';

function makePanelGeometry(layers, renderOrder) {
  const planes = [];
  for (let i = 0; i < layers; i++) planes.push(new PlaneGeometry(1, 1));
  const geometry = mergeGeometries(planes);
  for (const plane of planes) plane.dispose();

  const sides = new Float32Array(layers * 4);
  const ids = new Float32Array(layers * 4);
  for (let layer = 0; layer < layers; layer++) {
    const side = layer === 0 ? 1 : layer === 1 ? 0 : 2;
    for (let v = 0; v < 4; v++) {
      sides[layer * 4 + v] = side;
      ids[layer * 4 + v] = v + 1;
    }
  }
  geometry.setAttribute('side', new BufferAttribute(sides, 1));
  geometry.setAttribute('vertid', new BufferAttribute(ids, 1));
  geometry.userData.layers = layers;
  geometry.renderOrderHint = renderOrder;
  return geometry;
}

const VERTEX =  `
  attribute float side;
  attribute float vertid;

  uniform float uSeed;
  uniform float uShow;
  uniform float uShadowOffset;
  uniform float uJitter;
  uniform float uPopSteps;
  uniform float uScaleHover;
  uniform float uInsetShiftY;
  uniform vec3 uColor;
  uniform vec3 uColorShadow;
  uniform vec4 uInset;
  uniform float uFaceVisible;

  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    vec3 localPos = position;

    float scaleShowStepped = floor(uShow * uPopSteps) / uPopSteps;

    float vertSeed = fract(uSeed * 533.32 + vertid * 210.67644 + scaleShowStepped * 34.5435);
    float offset = (vertSeed * 2.0 - 1.0) * uJitter;
    vec3 dir = normalize(vec3(position.xy, 0.0));
    localPos += dir * offset;

    localPos.xy *= uScaleHover;

    vec4 pos = vec4(localPos * scaleShowStepped, 1.0);
    vec4 wPos = modelMatrix * pos;

    vUv = uv;
    vColor = uColor;

    if (side > 0.5 && side < 1.5) {

      wPos.xy += uShadowOffset * vec2(1.0, -1.0);
      vColor = uColorShadow;
    } else if (side > 1.5) {

      vec4 adjust = uInset * uShow;
      if (uv.x < 0.5) wPos.x += adjust.x; else wPos.x -= adjust.y;
      if (uv.y < 0.5) wPos.y += adjust.z; else wPos.y -= adjust.w;
      wPos.y -= uInsetShiftY;
      vColor = -uColor;
    }

    gl_Position = projectionMatrix * viewMatrix * wPos;
  }
`;

const FRAGMENT =  `
  uniform float uAlpha;
  varying vec2 vUv;
  varying vec3 vColor;

  void main() {

    gl_FragColor = vec4(vColor, uAlpha);
  }
`;

export class PaperPanel extends Mesh {

  constructor({
    width = 100, height = 100, face = '#F8F8F8', shadow = '#647A87',
    shadowOffset = 5.5, jitter = 0.02, inset = null, insetShiftY = 0,
    alpha = 1, renderOrder = -10, layers = 3,
  } = {}) {
    const geometry = makePanelGeometry(layers, renderOrder);
    super(geometry, new ShaderMaterial({
      name: 'ui-paper-panel',
      uniforms: {
        uColor: { value: new Color(face) },
        uColorShadow: { value: new Color(shadow) },
        uSeed: { value: Math.random() },
        uShow: { value: 0 },
        uShadowOffset: { value: shadowOffset },
        uJitter: { value: jitter },
        uPopSteps: { value: 4 },
        uScaleHover: { value: 1 },
        uInset: { value: new Vector4(...(inset ?? [0, 0, 0, 0])) },
        uInsetShiftY: { value: insetShiftY },
        uAlpha: { value: alpha },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,

      transparent: false,
      depthTest: false,
      depthWrite: false,
    }));
    this.name = 'paper panel';
    this.frustumCulled = false;
    this.renderOrder = renderOrder;
    this.visible = true;
    this.width = width;
    this.height = height;
    this.setSize(width, height);
  }

  get uniforms() {
    return this.material.uniforms;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.scale.set(width, height, 1);
    this.updateMatrix();
    return this;
  }

  setRect(rect) {
    this.setSize(rect.w, rect.h);
    this.setScreenCentre(rect.x + rect.w / 2, rect.y + rect.h / 2);
    return this;
  }

  setScreenCentre(screenX, screenY) {
    const centre = rectCenter({ x: screenX, y: screenY, w: 0, h: 0 });
    this.position.set(centre.x, centre.y, 0);
    this.updateMatrix();
    return this;
  }

  setColors(face, shadow = null) {
    this.uniforms.uColor.value.set(face);
    this.uniforms.uColorShadow.value.set(shadow ?? shade(face));
    return this;
  }

  setInset(inset) {
    this.uniforms.uInset.value.set(...inset);
    return this;
  }

  setSeed(seed = Math.random()) {
    this.uniforms.uSeed.value = seed;
    return this;
  }

  setShow(value) {
    this.uniforms.uShow.value = value;
    return this;
  }

  setHoverScale(value) {
    this.uniforms.uScaleHover.value = value;
    this.updateMatrix();
    return this;
  }

  show(tweens, { delay = 0, duration = 0.35 } = {}) {
    this.visible = true;
    this.setSeed();
    tweens.to(this.uniforms.uShow, {
      from: { value: 0 }, to: { value: 1 }, duration, delay, ease: 'none',
      onStart: () => { this.visible = true; },
    });
    return this;
  }

  hide(tweens, { delay = 0, duration = 0.15 } = {}) {
    tweens.to(this.uniforms.uShow, {
      from: { value: 1 }, to: { value: 0 }, duration, delay, ease: 'none',
      onComplete: () => { this.visible = false; },
    });
    return this;
  }
}

function shade(face) {
  return new Color(face).offsetHSL(0, -0.3, -0.2);
}
