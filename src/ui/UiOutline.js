import {
  BufferAttribute, BufferGeometry, Color, CustomBlending, HalfFloatType,
  LinearSRGBColorSpace, Mesh, NearestFilter, OneFactor, OneMinusSrcAlphaFactor,
  OrthographicCamera, RGBAFormat, Scene, ShaderMaterial, Vector2, WebGLRenderTarget,
} from 'three';

export const UI_INK = {
  color: '#455762',
  threshold: 0.01,
  smoothMargin: 0.05,
};

const VERTEX =  `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT =  `
  uniform sampler2D tMap;
  uniform float uSmoothMargin;
  uniform vec3 uOutlineColor;
  uniform float uThreshold;

  varying vec2 vUv;

  const vec2 dirs[5] = vec2[5](
    vec2(0, 0), vec2(-1, 0), vec2(1, 0), vec2(0, -1), vec2(0, 1)
  );

  vec3 linearToSRGB(vec3 c) {
    vec3 low = c * 12.92;
    vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(high, low, step(c, vec3(0.0031308)));
  }

  void main() {
    vec2 offset = 1.0 / vec2(textureSize(tMap, 0));
    vec4 colors[5];

    float maxAlpha = 0.0;
    float minColorValue = 0.0;
    vec4 tcolor;

    for (int i = 0; i < 5; i++) {
      tcolor = texture(tMap, vUv + offset * dirs[i]);
      colors[i] = abs(tcolor);
      maxAlpha = max(maxAlpha, colors[i].a);
      minColorValue = min(minColorValue, min(tcolor.r, min(tcolor.g, tcolor.b)));
    }

    if (maxAlpha == 0.0) discard;

    vec4 result;
    if (minColorValue < 0.0 && maxAlpha <= 1.0) {
      result = colors[0];
    } else {
      vec3 centerColor = colors[0].rgb;
      vec3 variationLeft = abs(colors[1].rgb - centerColor);
      vec3 variationRight = abs(colors[2].rgb - centerColor);
      vec3 variationBottom = abs(colors[3].rgb - centerColor);
      vec3 variationTop = abs(colors[4].rgb - centerColor);

      float centerAlpha = colors[0].a;
      float variationLeftAlpha = clamp(abs(colors[1].a - centerAlpha), 0.0, 1.0);
      float variationRightAlpha = clamp(abs(colors[2].a - centerAlpha), 0.0, 1.0);
      float variationBottomAlpha = clamp(abs(colors[3].a - centerAlpha), 0.0, 1.0);
      float variationTopAlpha = clamp(abs(colors[4].a - centerAlpha), 0.0, 1.0);

      vec4 delta;
      delta.x = max(max(max(variationLeft.r, variationLeft.g), variationLeft.b), variationLeftAlpha);
      delta.y = max(max(max(variationTop.r, variationTop.g), variationTop.b), variationTopAlpha);
      delta.z = max(max(max(variationRight.r, variationRight.g), variationRight.b), variationRightAlpha);
      delta.w = max(max(max(variationBottom.r, variationBottom.g), variationBottom.b), variationBottomAlpha);

      vec2 maxDelta = max(delta.xy, delta.zw);
      float maxDeltaValue = max(maxDelta.x, maxDelta.y);
      vec3 color = mix(centerColor, uOutlineColor,
                       smoothstep(uThreshold, uThreshold + uSmoothMargin, maxDeltaValue));
      result = vec4(color, 1.0);
    }

    float alpha = clamp(result.a, 0.0, 1.0);
    vec3 linear = result.rgb / max(alpha, 1e-4);
    gl_FragColor = vec4(linearToSRGB(clamp(linear, 0.0, 1.0)) * alpha, alpha);
  }
`;

function fullscreenTriangle() {
  const triangle = new BufferGeometry();
  triangle.setAttribute('position', new BufferAttribute(
    new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  triangle.setAttribute('uv', new BufferAttribute(
    new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return triangle;
}

export class UiOutline {

  constructor(renderer) {
    this.renderer = renderer;

    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      format: RGBAFormat,
      depthBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
    });
    this.target.texture.name = 'ui-scene';
    this.target.texture.colorSpace = LinearSRGBColorSpace;

    this.material = new ShaderMaterial({
      name: 'global-ui-ink',
      uniforms: {
        tMap: { value: this.target.texture },
        uOutlineColor: { value: new Color(UI_INK.color) },
        uSmoothMargin: { value: UI_INK.smoothMargin },
        uThreshold: { value: UI_INK.threshold },
        uResolution: { value: new Vector2(1, 1) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,

      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });

    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new Mesh(fullscreenTriangle(), this.material);
    this.mesh.name = 'UI ink composite';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.scene.add(this.mesh);

    this.overlay = { scene: this.scene, camera: this.camera };
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.target.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
  }

  render(scene, camera) {
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousAlpha = renderer.getClearAlpha();
    const previousColor = renderer.getClearColor(new Color());

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.autoClear = previousAutoClear;
  }
}
