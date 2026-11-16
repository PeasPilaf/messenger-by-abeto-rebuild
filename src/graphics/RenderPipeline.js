import * as THREE from 'three';

import chunks from './shaders/chunks.glsl?raw';
import compositeVert from './shaders/composite.vert.glsl?raw';
import compositeFrag from './shaders/composite.frag.glsl?raw';
import transitionFrag from './shaders/transition.frag.glsl?raw';
import { OUTLINE } from './constants.js';

function makeFullscreenTriangle() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(
    new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return geometry;
}

export class RenderPipeline {

  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;

    const supportsFloat = renderer.extensions.has('EXT_color_buffer_float');
    this.colorTargetType = supportsFloat ? THREE.FloatType : THREE.HalfFloatType;

    this.mrt = new THREE.WebGLRenderTarget(1, 1, {
      count: 2,
      type: this.colorTargetType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      generateMipmaps: false,
    });
    this.mrt.textures[0].name = 'color';
    this.mrt.textures[1].name = 'info';

    this.mrt.depthTexture = new THREE.DepthTexture(1, 1);
    this.mrt.depthTexture.name = 'scene-depth';

    this.fallbackWater = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
    });
    this.fallbackWater.texture.name = 'water-fallback';
    this._clearFallbackWater();

    this.compositeMaterial = new THREE.ShaderMaterial({
      name: 'outlines-and-grade',
      uniforms: {
        tDiffuse: { value: this.mrt.textures[0] },
        tInfo: { value: this.mrt.textures[1] },
        tWater: { value: this.fallbackWater.texture },
        tLUT: { value: null },
        uCameraNear: { value: camera.near },
        uCameraFar: { value: camera.far },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uOutlineFade: { value: new THREE.Vector2(...OUTLINE.fade) },
        uOutlineThickness: { value: OUTLINE.thickness },
        uOutlineColor: { value: new THREE.Color(OUTLINE.color) },
        uOutlineScale: { value: OUTLINE.scale },
        uInfoRange: { value: new THREE.Vector3(...OUTLINE.infoRange) },
        uInfoMinScale: { value: OUTLINE.infoMinScale },
        uDepthRange: { value: new THREE.Vector3(...OUTLINE.depthRange) },
        uNormalRange: { value: new THREE.Vector3(...OUTLINE.normalRange) },
        uSmoothMargin: { value: OUTLINE.smoothMargin },
        uOutlineEnabled: { value: 1 },
        uLUTIntensity: { value: 1 },
        uDebugSurfaceId: { value: 0 },
        uDebugOutline: { value: 0 },
      },
      vertexShader: compositeVert,

      fragmentShader: compositeFrag.replace('/* INCLUDE_CHUNKS */', chunks),
      depthTest: false,
      depthWrite: false,
    });

    this.compositeScene = new THREE.Scene();
    const triangle = new THREE.Mesh(makeFullscreenTriangle(), this.compositeMaterial);
    triangle.frustumCulled = false;
    this.compositeScene.add(triangle);
    this.compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.finalTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.finalTarget.texture.name = 'final';

    this.transitionMaterial = new THREE.ShaderMaterial({
      name: 'transition',
      uniforms: {
        tScene: { value: this.finalTarget.texture },
        uWipe1: { value: 0 },
        uWipe2: { value: 0 },
        uWipeColor: { value: new THREE.Color('#ffffff') },
        uFlash: { value: 0 },
        uOverlay: { value: 0 },
        uOverlayColor: { value: new THREE.Color('#283436') },
      },
      vertexShader: compositeVert,
      fragmentShader: transitionFrag.replace('/* INCLUDE_CHUNKS */', chunks),
      depthTest: false,
      depthWrite: false,
    });

    this.transitionScene = new THREE.Scene();
    const transitionTriangle = new THREE.Mesh(makeFullscreenTriangle(), this.transitionMaterial);
    transitionTriangle.frustumCulled = false;
    this.transitionScene.add(transitionTriangle);

    this.overlayScene = null;
    this.overlayCamera = null;
  }

  setOverlay(overlay) {
    this.overlayScene = overlay?.scene ?? null;
    this.overlayCamera = overlay?.camera ?? null;
  }

  setLut(lutTexture) {
    this.compositeMaterial.uniforms.tLUT.value = lutTexture;
  }

  setOutlineTuning(tuning) {
    const u = this.compositeMaterial.uniforms;
    if (tuning.fade) u.uOutlineFade.value.set(...tuning.fade);
    if (tuning.thickness !== undefined) u.uOutlineThickness.value = tuning.thickness;
    if (tuning.color) u.uOutlineColor.value.set(tuning.color);
    if (tuning.infoRange) u.uInfoRange.value.set(...tuning.infoRange);
    if (tuning.infoMinScale !== undefined) u.uInfoMinScale.value = tuning.infoMinScale;
    if (tuning.depthRange) u.uDepthRange.value.set(...tuning.depthRange);
    if (tuning.normalRange) u.uNormalRange.value.set(...tuning.normalRange);
    if (tuning.scale !== undefined) u.uOutlineScale.value = tuning.scale;
    if (tuning.smoothMargin !== undefined) u.uSmoothMargin.value = tuning.smoothMargin;
  }

  setCamera(camera) {
    this.camera = camera;
    this.compositeMaterial.uniforms.uCameraNear.value = camera.near;
    this.compositeMaterial.uniforms.uCameraFar.value = camera.far;
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.mrt.setSize(w, h);
    this.fallbackWater.setSize(w, h);
    this.finalTarget.setSize(w, h);
    this.compositeMaterial.uniforms.uResolution.value.set(w, h);
  }

  setWaterTexture(texture) {
    this.compositeMaterial.uniforms.tWater.value = texture ?? this.fallbackWater.texture;
  }

  render(scene, camera, water = null) {
    const renderer = this.renderer;

    renderer.setRenderTarget(this.mrt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);

    if (water) {
      water.render(this.mrt.depthTexture, this.mrt.textures[0], this.mrt.textures[1]);
      this.setWaterTexture(water.target.texture);
    } else {
      this.setWaterTexture(null);
    }

    renderer.setRenderTarget(this.finalTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.compositeScene, this.compositeCamera);

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(this.transitionScene, this.compositeCamera);

    if (this.overlayScene && this.overlayCamera) {
      renderer.autoClear = false;
      renderer.render(this.overlayScene, this.overlayCamera);
      renderer.autoClear = true;
    }
  }

  get transition() {
    return this.transitionMaterial.uniforms;
  }

  setDebug({ surfaceId = false, outline = false } = {}) {
    this.compositeMaterial.uniforms.uDebugSurfaceId.value = surfaceId ? 1 : 0;
    this.compositeMaterial.uniforms.uDebugOutline.value = outline ? 1 : 0;
  }

  _clearFallbackWater() {
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.fallbackWater);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.setRenderTarget(previousTarget);
  }
}
