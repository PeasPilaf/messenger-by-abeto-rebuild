import * as THREE from 'three';

import { TERRAIN } from '../../assets/manifest.js';
import {
  computeInstanceBounds,
  createExtrasFragment,
  createExtrasMaterial,
  createExtrasVertex,
  isWithinVisibility,
} from './ExtrasMaterial.js';

const VISIBILITY_THRESHOLD = 25;

const vertexShader =  `
attribute vec3 up;
attribute vec4 randomm;

varying vec2 vUv;
varying vec4 vRand;
varying vec2 vHighPrecisionZW;
varying vec3 wNormal;
varying vec3 wPos;
varying vec4 vPos;
varying vec3 vNormal;
varying vec3 vAnimationOffset;

mat2 rotate2d(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, s, -s, c);
}

void main() {
    vRand = randomm;
    vUv = uv;

    vec4 instancePos = instanceMatrix * vec4(position, 1.0);
    vec3 butterflyBottomPos = vec3(instanceMatrix[3]);

    float flapTimeline = fract(time * mix(1.0, 1.5, randomm.w) + randomm.x);
    float flapDisplacement = smoothstep(0.0, 0.4, flapTimeline) * 0.15;
    flapDisplacement *= smoothstep(1.0, 0.4, flapTimeline);
    flapDisplacement *= sin(time * mix(1.0, 4.0, randomm.x)) * 0.5 + 0.5;

    vAnimationOffset = vec3(
        sin(time * 2.21312 + randomm.y * 5.0 + randomm.z * 6.0),
        sin(time * 1.421 + 0.314159 + randomm.y * 10.0),
        sin(time * 1.79 + 0.27143 + randomm.z * 10.0));
    vAnimationOffset += vec3(
        sin(time * 1.31412 + randomm.x * 5.0 + randomm.w * 4.0),
        sin(time * 2.421 + 0.314159 + randomm.w * 10.0),
        sin(time * 2.69 + 1.32143 + randomm.y * 10.0));
    vAnimationOffset *= 0.5;

    vec3 posAnimation = normalize(instancePos.xyz) * flapDisplacement + 0.5 * vAnimationOffset;

    vec3 butterflyUp = normalize(up);
    vec3 butterflyOffset = butterflyBottomPos + posAnimation;
    vec3 camToButterfly = normalize(butterflyOffset - cameraPosition);
    vec3 butterflyRight = cross(butterflyUp, camToButterfly);
    vec3 butterflyForward = cross(butterflyRight, butterflyUp);
    mat3 butterflyTBN = mat3(butterflyRight, butterflyForward, butterflyUp);
    float butterflyScale = fit(fract(randomm.x + randomm.w * 2.0), 0.0, 1.0, 0.8, 1.3);

    vec3 butterflyPosition = position.xyz * butterflyScale;
    vec4 worldPosition = vec4(butterflyTBN * butterflyPosition + butterflyOffset, 1.0);

    wNormal = butterflyUp;
    wPos = worldPosition.xyz;
    vNormal = normalize((viewMatrix * vec4(butterflyUp, 0.0)).xyz);

    vec3 transformedNormal = normalize(normalMatrix * normal);
    #include <shadowmap_vertex>

    vPos = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * vPos;
    vHighPrecisionZW = gl_Position.zw;
}
`;

const fragmentShader =  `
layout(location = 1) out highp vec4 gInfo;

varying vec3 wPos;
varying vec4 vPos;
varying vec3 wNormal;
varying vec3 vNormal;
varying vec3 vAnimationOffset;
varying vec2 vUv;
varying vec4 vRand;
varying vec2 vHighPrecisionZW;

uniform sampler2D tButterfly;
uniform sampler2D tButterflyFront;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;

mat2 rotate2d(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, s, -s, c);
}

void main() {
    vec2 flapUvFront = vUv - 0.5;
    vec2 flapUvTop = flapUvFront;

    float flapTimeline = fract(time * mix(4.0, 5.5, vRand.w) + vRand.x - 0.4
                             - abs(flapUvFront.x) * 0.25 + vUv.y * 0.5);
    float flapDisplacement = smoothstep(0.0, 0.4, flapTimeline) * smoothstep(1.0, 0.4, flapTimeline);
    float wobble = (vAnimationOffset.x + vAnimationOffset.y + vAnimationOffset.z) * 0.4;

    flapUvFront.y += flapDisplacement * abs(flapUvFront.x) * 1.4;
    flapUvFront = rotate2d(wobble) * flapUvFront + 0.5;
    float front = texture2D(tButterflyFront, flapUvFront).r;

    flapUvTop.x *= mix(0.5, 2.0, flapDisplacement);
    flapUvTop = rotate2d(wobble) * flapUvTop;
    flapUvTop.y *= 1.25;
    flapUvTop += 0.5;
    float top = texture2D(tButterfly, flapUvTop).r;

    float mask = mix(front * 2.0, top * 2.0, sin(time * mix(0.5, 2.0, vRand.z) + vRand.x * 10.0) * 0.5 + 0.5);
    if (mask < 0.5) discard;

    float seed = fract(vRand.x * 34.327 + vRand.y * 21.231);
    vec3 color = uColor1;
    color = mix(color, uColor2, step(0.2, seed));
    color = mix(color, uColor3, step(0.4, seed));
    color = mix(color, uColor4, step(0.6, seed));
    color = mix(color, uColor5, step(0.8, seed));

    float shadowCut = smoothstep(0.2, 0.4, extrasShadow());
    color = mix(color * 0.5, color, shadowCut);

    addFog(color, vPos.z);
    float surfaceId = vRand.x;

    gl_FragColor = vec4(color, surfaceId);
    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                 encodeNormalSpheremap(normalize(vNormal)), 1.0);
}
`;

function createButterflyGeometry() {
  const geometry = new THREE.PlaneGeometry();
  geometry.rotateZ(Math.PI);
  geometry.translate(0, -0.5, 0);
  geometry.rotateX(Math.PI * -0.5);
  geometry.scale(0.1, 0.125, 0.125);
  geometry.scale(0.8, 0.8, 0.8);
  return geometry;
}

export class Butterflies {
  constructor({ scene, shared }) {
    this.scene = scene;
    this.shared = shared;
    this.group = new THREE.Group();
    this.group.name = 'butterflies';

    this.meshes = [];
  }

  async load({ geometryLoader, textureLoader }) {
    const [butterfly, butterflyFront] = await Promise.all([
      textureLoader.load('butterfly-highq.ktx2', 'linearfilter'),
      textureLoader.load('butterfly-front-highq.ktx2', 'linearfilter'),
    ]);

    this.material = createExtrasMaterial({
      name: 'butterflies',
      shared: this.shared,
      uniforms: {
        tButterfly: { value: butterfly },
        tButterflyFront: { value: butterflyFront },

        uColor1: { value: new THREE.Color('#ffffff') },
        uColor2: { value: new THREE.Color('#f5ba53') },
        uColor3: { value: new THREE.Color('#ffd998') },
        uColor4: { value: new THREE.Color('#9dbfe6') },
        uColor5: { value: new THREE.Color('#ade3d0') },
      },
      lights: true,
      defines: { USE_INSTANCING: '' },
      vertexShader: createExtrasVertex(vertexShader, { shadows: true }),
      fragmentShader: createExtrasFragment(fragmentShader, { shadows: true }),
    });

    const quad = createButterflyGeometry();
    const pointCloud = await geometryLoader.load(TERRAIN.butterflies);
    const patches = await geometryLoader.instancedPatches(quad, pointCloud);

    for (const patch of patches) {
      const geometry = patch.geometry;
      geometry.setAttribute('instanceMatrix', new THREE.InstancedBufferAttribute(geometry._matrixArray, 16));
      computeInstanceBounds(geometry, geometry._matrixArray, geometry.instanceCount, 0.2);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = `butterflies-patch-${patch.instanceId}`;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
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
      const index = mesh.geometry.index;
      const perInstance = index ? index.count / 3 : mesh.geometry.attributes.position.count / 3;
      if (mesh.visible) {
        triangles += perInstance * mesh.geometry.instanceCount;
        visible++;
      }
    }
    return { triangles, visible, total: this.meshes.length, instances: 80 };
  }
}
