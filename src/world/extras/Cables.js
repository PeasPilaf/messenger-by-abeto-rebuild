import * as THREE from 'three';

import { TERRAIN } from '../../assets/manifest.js';
import {
  createExtrasFragment,
  createExtrasMaterial,
  createExtrasVertex,
  isWithinVisibility,
} from './ExtrasMaterial.js';

const VISIBILITY_THRESHOLD = 25;
const CABLE_COLOR = '#565c5f';

const vertexShader =  `
attribute float randomm;
attribute vec3 nextpos;
attribute vec3 prevpos;
attribute vec3 curvepos;

uniform float uWidth;

varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying vec4 vPos;
varying float vRandom;

void main() {
    vUv = uv;
    vRandom = randomm;

    vec4 worldPos = modelMatrix * vec4(curvepos, 1.0);
    vec4 worldPrevPos = modelMatrix * vec4(prevpos, 1.0);
    vec4 worldNextPos = modelMatrix * vec4(nextpos, 1.0);

    vec4 viewPos = viewMatrix * worldPos;
    vPos = viewPos;

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

    float width = viewPos.z * 0.0009 * aspect;
    normal *= width;
    gl_Position = finalPos + vec4(normal.xy, 0.0, 0.0);

    vHighPrecisionZW = gl_Position.zw;
}
`;

const fragmentShader =  `
layout(location = 1) out highp vec4 gInfo;

uniform vec3 uColor;
uniform sampler2D tNoise;

varying float vRandom;
varying vec2 vUv;
varying vec4 vPos;
varying vec2 vHighPrecisionZW;

void main() {

    float n = texture2D(tNoise, vec2(0.5 + vRandom, vUv.y * 0.2)).r;
    if (n < 0.25) discard;

    vec3 color = uColor;
    addFog(color, vPos.z);

    gl_FragColor = vec4(color, 1.0);
    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5), vec2(0.0), 0.0);
}
`;

export class Cables {
  constructor({ scene, shared }) {
    this.scene = scene;
    this.shared = shared;
    this.group = new THREE.Group();
    this.group.name = 'cables';

    this.meshes = [];
  }

  async load({ geometryLoader, textureLoader }) {
    const noise = await textureLoader.load('clouds_noise_512.ktx2', 'srgb-repeat');
    this.material = createExtrasMaterial({
      name: 'cables',
      shared: this.shared,
      uniforms: {
        tNoise: { value: noise },
        uColor: { value: new THREE.Color(CABLE_COLOR) },
        uWidth: { value: 1 },
      },
      vertexShader: createExtrasVertex(vertexShader),
      fragmentShader: createExtrasFragment(fragmentShader),
      side: THREE.DoubleSide,
    });

    const geometries = await Promise.all(TERRAIN.cables.map((name) => geometryLoader.load(name)));
    for (const geometry of geometries) {
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = 'cable';
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.scene.add(this.group);
  }

  update(time, dt, character) {
    const position = character?.position;
    for (const mesh of this.meshes) {
      mesh.visible = isWithinVisibility(mesh.geometry.boundingSphere, position, VISIBILITY_THRESHOLD);
    }
  }

  object() {
    return this.group;
  }

  stats() {
    let triangles = 0;
    let visible = 0;
    for (const mesh of this.meshes) {
      if (!mesh.visible) continue;
      const index = mesh.geometry.index;
      triangles += (index ? index.count : mesh.geometry.attributes.position.count) / 3;
      visible++;
    }
    return { triangles, visible, total: this.meshes.length };
  }
}
