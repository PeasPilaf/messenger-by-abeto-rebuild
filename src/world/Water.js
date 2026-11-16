import * as THREE from 'three';

import waterChunks from '../graphics/shaders/chunks.glsl?raw';
import { COLORS } from '../graphics/constants.js';

const vertexShader =  `
    varying vec4 vMvPos;
    varying vec2 vHighPrecisionZW;
    varying vec2 vUv;

    void main() {
        vMvPos = modelViewMatrix * vec4(position, 1.0);
        vUv = uv;
        gl_Position = projectionMatrix * vMvPos;
        vHighPrecisionZW = gl_Position.zw;
    }
`;

const fragmentShader =  `
    varying vec4 vMvPos;
    varying vec2 vHighPrecisionZW;
    varying vec2 vUv;

    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColorWaves1;
    uniform vec3 uColorWaves2;
    uniform vec2 uDepthRange;

    uniform sampler2D tNoise;
    uniform sampler2D tScene;
    uniform sampler2D tSceneInfo;

    uniform mat4 uProjMat;
    uniform mat4 uWorldMat;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uTime;
    uniform vec2 uResolution;

    /* INCLUDE_CHUNKS */

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution;

        vec2 meshUV = vUv * 1.25;

        float sceneDepth = 1.0 - textureBicubic(tSceneInfo, uv).r;
        float waterSurfaceDepth = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;

        vec3 sceneViewPos = getViewPosition(sceneDepth, uv, uCameraNear, uCameraFar, uProjMat);
        vec3 sceneWorldPos = (uWorldMat * vec4(sceneViewPos, 1.0)).xyz;
        float sceneDist = length(sceneViewPos);
        float sceneHeight = length(sceneWorldPos);
        vec3 waterViewPos = getViewPosition(waterSurfaceDepth, uv, uCameraNear, uCameraFar, uProjMat);
        vec3 waterWorldPos = (uWorldMat * vec4(waterViewPos, 1.0)).xyz;
        float waterDist = length(waterViewPos);
        float waterHeight = length(waterWorldPos);

        float viewDistDiff = sceneDist - waterDist;
        float worldHeightDiff = waterHeight - sceneHeight;

        float depthGradient = fit(viewDistDiff, 0.0, 2.5, 0.0, 1.0);

        float timeOffset = sinenoise1(vec3(meshUV * 50.0, 0.0)) * 0.5 + 0.5;

        float foam = 0.0;
        float foamMargin = fit(worldHeightDiff, 0.0, 0.3, 1.0, 0.0);
        if (foamMargin > 0.0) {
            float foamBands = foamMargin * 4.0 - uTime * 0.35 + timeOffset * 2.0;
            foam = parabola(fract(foamBands), 5.0);

            float foamNoise = texture2D(tNoise,
                meshUV * 15.0 - (uTime + floor(foamBands) * 50.342) * 0.001).r;
            foam *= foamMargin * foamNoise;

            foam = step(0.42, foam);

            float foamVisibility = fit(viewDistDiff, 0.0, 1.0, 0.0, 1.0);
            foam *= 1.0 - step(0.99, pow(foamVisibility, 2.0));
        }

        float seaTime = uTime + timeOffset * 10.0;

        vec2 offsetSea1 = vec2(cos(seaTime * 1.0 + 3.432), sin(seaTime * 2.0 + 3.234)) * 0.01;
        float noiseSea1 = texture2D(tNoise, meshUV * 8.0 - seaTime * 0.01 + offsetSea1).r;
        vec2 offsetSea2 = vec2(sin(seaTime * 1.5 + 6.54353), cos(seaTime * 0.5 + 43.342)) * 0.0085;
        float noiseSea2 = texture2D(tNoise, meshUV * 10.0 + 34.54 + seaTime * 0.015 + offsetSea2).r;
        float noiseSea = noiseSea1 * noiseSea2;

        float wavesN = step(0.1, pow(noiseSea, 2.0));
        vec3 seaColor = mix(uColorWaves1, uColor2, wavesN);

        vec2 offsetSea3 = vec2(sin(seaTime * 2.0 + 12.435), cos(seaTime * 2.75 + 34.3)) * 0.011;
        float noiseSea3 = texture2D(tNoise, meshUV * 20.0 - seaTime * 0.01 + offsetSea3 - 3.525).r;
        vec2 offsetSea4 = vec2(cos(seaTime * 1.25 + 3.345), sin(seaTime * 2.5 + 97.798)) * 0.0095;
        float noiseSea4 = texture2D(tNoise, meshUV * 10.0 + 4.5434 + seaTime * 0.02 + offsetSea4 + 2.34).r;
        float additionalNoiseSea = noiseSea3 * noiseSea4;

        float wavesN2 = step(0.45, additionalNoiseSea);
        seaColor = mix(seaColor, uColorWaves2, wavesN2);

        float colorShore = max(fit(worldHeightDiff, 0.0, 0.15, 0.0, 1.0), depthGradient);
        vec3 colorWater = mix(uColor1, seaColor, colorShore);

        float gradientScene = 1.0 - max(fit(worldHeightDiff, 0.0, 0.75, 0.0, 1.0), depthGradient);
        colorWater = mix(colorWater, uColorWaves2, gradientScene * 0.1);

        colorWater = mix(colorWater, vec3(1.0), foam);

        addFog(colorWater, vMvPos.z);

        gl_FragColor = vec4(colorWater, 1.0 - waterSurfaceDepth);
    }
`;

const WATER_DOT_THRESHOLD = 0.4;

export class Water {

  constructor({ renderer, loadGeometry, noiseTexture, sceneCamera }) {
    this.renderer = renderer;
    this.loadGeometry = loadGeometry;
    this.sceneCamera = sceneCamera;
    this.dotThreshold = WATER_DOT_THRESHOLD;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
    });
    this.target.texture.name = 'water';

    this.material = new THREE.ShaderMaterial({
      name: 'water',
      uniforms: {

        uColor1: { value: new THREE.Color('#4c868c') },
        uColor2: { value: new THREE.Color('#437a7f') },
        uColorWaves1: { value: new THREE.Color('#366a6f') },
        uColorWaves2: { value: new THREE.Color('#6facb2') },
        uDepthRange: { value: new THREE.Vector2(0.001, 0.013) },
        tNoise: { value: noiseTexture },
        tScene: { value: null },
        tSceneInfo: { value: null },
        uProjMat: { value: new THREE.Matrix4() },
        uWorldMat: { value: new THREE.Matrix4() },
        uCameraNear: { value: sceneCamera.near },
        uCameraFar: { value: sceneCamera.far },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },

        uFogColorNear: { value: new THREE.Color(COLORS.fogNear) },
        uFogColorFar: { value: new THREE.Color(COLORS.fogFar) },
        uFogDistance: { value: 0.8 },
        uFogDensity: { value: 0.011 },
      },
      vertexShader,

      fragmentShader: '#include <common>\n#include <packing>\n' + fragmentShader.replace('/* INCLUDE_CHUNKS */', waterChunks),
    });
    this.mesh = null;
  }

  async load() {
    const geometry = await this.loadGeometry('planets/present/water');
    geometry.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.scene.add(this.mesh);
  }

  setSize(width, height) {
    this.target.setSize(width, height);
    this.material.uniforms.uResolution.value.set(width, height);
  }

  update(time, sceneCamera) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uProjMat.value.copy(sceneCamera.projectionMatrix);
    this.material.uniforms.uWorldMat.value.copy(sceneCamera.matrixWorld);
    this.material.uniforms.uCameraNear.value = sceneCamera.near;
    this.material.uniforms.uCameraFar.value = sceneCamera.far;
  }

  render(sceneDepthTexture, colorTexture, infoTexture) {
    const renderer = this.renderer;

    this.scene.traverse((object) => {
      const uniforms = object.material?.uniforms;
      if (!uniforms) return;
      if (uniforms.tScene) uniforms.tScene.value = colorTexture;
      if (uniforms.tSceneInfo) uniforms.tSceneInfo.value = infoTexture;
    });
    this.material.uniforms.tScene.value = colorTexture;
    this.material.uniforms.tSceneInfo.value = infoTexture;

    this.camera.copy(this.sceneCamera);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    this.target.depthTexture = null;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.target.depthTexture = sceneDepthTexture;
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = previousAutoClear;

    this.target.depthTexture = null;
    renderer.setRenderTarget(null);
  }
}
