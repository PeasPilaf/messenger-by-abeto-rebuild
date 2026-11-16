import * as THREE from 'three';

import { TERRAIN } from '../../assets/manifest.js';
import {
  createExtrasFragment,
  createExtrasMaterial,
  createExtrasVertex,
  isWithinVisibility,
} from './ExtrasMaterial.js';

const VISIBILITY_THRESHOLD = 25;
const SMOKE_ALPHA = 0.35;
const SMOKE_WIDTH = 0.35;

const vertexShader =  `
attribute float randomm;
attribute float thickness;
attribute vec3 nextpos;
attribute vec3 prevpos;
attribute vec3 curvepos;
attribute vec2 uv2;

varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying vec2 vUv2;
varying vec3 vWorldPos;
varying vec4 vPos;
varying float vRandom;
varying float vThickness;

void main() {
    vUv = uv;
    vUv2 = uv2;
    vRandom = randomm;
    vThickness = thickness;

    vec4 worldPos = modelMatrix * vec4(curvepos, 1.0);
    vec4 worldPrevPos = modelMatrix * vec4(prevpos, 1.0);
    vec4 worldNextPos = modelMatrix * vec4(nextpos, 1.0);

    vWorldPos = curvepos.xyz;
    vPos = viewMatrix * worldPos;

    mat4 projView = projectionMatrix * viewMatrix;
    vec4 finalPos = projView * worldPos;
    vec4 finalPrevPos = projView * worldPrevPos;
    vec4 finalNextPos = projView * worldNextPos;

    float aspect = resolution.x / resolution.y;
    vec2 aspectVec = vec2(aspect, 1.0);
    vec2 posScreen = finalPos.xy / finalPos.w * aspectVec;
    vec2 prevPosScreen = finalPrevPos.xy / finalPrevPos.w * aspectVec;
    vec2 nextPosScreen = finalNextPos.xy / finalNextPos.w * aspectVec;

    vec2 dirA = normalize(posScreen - prevPosScreen);
    vec2 dirB = normalize(nextPosScreen - posScreen);
    vec2 tangent = normalize(dirA + dirB);
    vec2 normal = normalize(vec2(-tangent.y, tangent.x));

    if (uv.x > 0.5) normal = -normal;
    normal.x /= aspect;

    float width = ${SMOKE_WIDTH} * thickness * mix(0.25, 3.0, vUv2.y);
    normal *= width;
    gl_Position = finalPos + vec4(normal.xy, 0.0, 0.0);

    vHighPrecisionZW = gl_Position.zw;
}
`;

const fragmentShader =  `
layout(location = 1) out highp vec4 gInfo;

uniform vec3 uColor;
uniform sampler2D tNoise;
uniform sampler2D tNoise2;

varying float vRandom;
varying vec2 vUv;
varying vec2 vUv2;
varying vec2 vHighPrecisionZW;
varying vec3 vWorldPos;
varying vec4 vPos;
varying float vThickness;

void main() {

    float n1 = texture2D(tNoise, vUv2 * vec2(0.25, 1.0) - vec2(vRandom, time * 0.05)).r;
    float n2 = 1.0 - texture2D(tNoise2, vec2(vUv2 * vec2(0.7, 1.5) - vec2(vRandom, time * 0.15))).r;
    n2 -= n1 * 0.4;
    n2 = pow(n2, 2.0);

    float grad = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float mask = grad * n2;
    mask -= (sin(vUv.y * 2.0 - time + vRandom * 10.0) * 0.5 + 0.5) * 0.15;
    mask *= smoothstep(0.0, 0.15, vUv2.y);
    mask *= smoothstep(1.0, 0.5, vUv2.y);

    if (mask < 0.05) discard;

    vec3 color = vec3(1.0);
    addFog(color, vPos.z);

    gl_FragColor = vec4(color, ${SMOKE_ALPHA});
    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5), vec2(0.0), 0.0);
}
`;

export class Smoke {
  constructor({ scene, shared }) {
    this.scene = scene;
    this.shared = shared;
    this.mesh = null;
  }

  async load({ geometryLoader, textureLoader }) {
    const [noise, noise2] = await Promise.all([
      textureLoader.load('clouds_noise_512.ktx2', 'srgb-repeat'),
      textureLoader.load('water-noises-highq.ktx2', 'srgb-repeat'),
    ]);

    this.material = createExtrasMaterial({
      name: 'smoke',
      shared: this.shared,
      uniforms: {
        tNoise: { value: noise },
        tNoise2: { value: noise2 },
        uColor: { value: new THREE.Color('#565c5f') },
        uWidth: { value: 1 },
      },
      vertexShader: createExtrasVertex(vertexShader),
      fragmentShader: createExtrasFragment(fragmentShader),
      transparent: true,
      blending: THREE.CustomBlending,

      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });

    const geometry = await geometryLoader.load(TERRAIN.smoke);
    geometry.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'smoke';
    this.mesh.matrixAutoUpdate = false;
    this.scene.add(this.mesh);
  }

  update(time, dt, character) {
    if (!this.mesh) return;
    this.mesh.visible = isWithinVisibility(this.mesh.geometry.boundingSphere, character?.position, VISIBILITY_THRESHOLD);
  }

  object() {
    return this.mesh;
  }

  stats() {
    if (!this.mesh) return { triangles: 0, visible: 0, total: 0 };
    const index = this.mesh.geometry.index;
    return {
      triangles: (index ? index.count : this.mesh.geometry.attributes.position.count) / 3,
      visible: this.mesh.visible ? 1 : 0,
      total: 1,
    };
  }
}
