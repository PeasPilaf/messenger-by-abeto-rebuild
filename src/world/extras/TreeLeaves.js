import * as THREE from 'three';

import { TERRAIN } from '../../assets/manifest.js';
import {
  createExtrasFragment,
  createExtrasMaterial,
  createExtrasVertex,
  isWithinVisibility,
} from './ExtrasMaterial.js';

const VISIBILITY_THRESHOLD = 35;

const LEAF_COLORS = ['#5b9f7b', '#649c75', '#4e8c6d'];
const U_SCALE = 0.28;
const U_LEAVES_SHAKE = 0.25;
const U_SHAKE_SPEED = 0.75;

const vertexShader =  `
#define PI2 6.283185307179586

attribute vec3 centr;
attribute vec3 centr_tree;
attribute vec4 rand;
attribute int detail;
attribute int leavescolor;

varying vec2 vUv;
varying vec4 vRand;
varying vec4 vPos;
varying vec2 vHighPrecisionZW;
flat varying vec3 vCentrTree;
flat varying vec3 vNormal;
flat varying vec3 vLightDir;
flat varying int vDetail;
flat varying float vColor;

uniform float uLeavesShake;
uniform float uShakeSpeed;
uniform float uScale;

void main() {

    vUv = mix(uv, vec2(1.0 - uv.x, uv.y), step(0.5, rand.x));
    vRand = rand;
    vDetail = detail;
    vCentrTree = centr_tree;
    vColor = float(leavescolor);

    vLightDir = vec3(0.0);
    #if NUM_DIR_LIGHTS > 0
        vLightDir = normalize(directionalLights[0].direction);
    #endif

    float scale = mix(0.5, 1.0, vRand.w) * uScale;

    float shake = sinenoise1(vec3(centr * 2.0) + vec3(-time * 0.1 * uShakeSpeed, 0.0,
                     time * 0.15 * uShakeSpeed)) * PI2 * uLeavesShake * mix(0.25, 1.0, vRand.y);

    mat3 rot = mat3(1.0);
    if (detail == 1) {

        vec2 aspectVec = vec2(resolution.x / resolution.y, 1.0);
        vec4 quadPos = projectionMatrix * modelViewMatrix * vec4(centr, 1.0);
        vec4 bushPos = projectionMatrix * modelViewMatrix * vec4(centr_tree, 1.0);
        vec2 quad2D = quadPos.xy / quadPos.w * aspectVec;
        vec2 bush2D = bushPos.xy / bushPos.w * aspectVec;
        vec2 dir = normalize(quad2D - bush2D);
        float angle = atan(dir.y, dir.x);
        rot = rotateZ(angle - PI2 * 0.25);
    } else {
        rot = rotateZ(fit(vRand.z, 0.0, 1.0, -PI2, PI2) + shake);
    }

    float distToPlayer = length(charPos - centr);
    float disp = fit(distToPlayer, 0.0, fit(charSpeed, 0.0, 0.001, 0.0, 0.85), 1.0, 0.0)
               * fit(charSpeed, 0.0, 0.15, 0.0, 10.0);
    if (length(disp) > 0.001) rot = rotateZ(sin(disp) * 0.15 * sign(rand.w - 0.5)) * rot;

    vec3 posLeaf = rot * vec3(uv * 2.0 - 1.0, 0.0) * scale;
    vec3 pos = centr + getViewRight() * posLeaf.x + getViewUp() * posLeaf.y + getViewBack() * posLeaf.z;

    vec3 shakeX = getViewRight() * sin((centr.x + centr.y) * 2.0 + 534.35 + time * 1.1) * 0.025;
    vec3 shakeZ = getViewBack() * sin((centr.z + centr.y) * 2.0 + 543.55 + time * 0.55) * 0.025;
    pos += shakeX + shakeZ;

    vNormal = normalize(normalMatrix * normal);

    vec3 transformedNormal = vNormal;
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    #include <shadowmap_vertex>

    vPos = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * vPos;

    vec4 centrPos = projectionMatrix * modelViewMatrix * vec4(centr_tree, 1.0);
    vHighPrecisionZW = centrPos.zw;
}
`;

const fragmentShader =  `
layout(location = 1) out highp vec4 gInfo;

varying vec2 vUv;
varying vec4 vPos;
varying vec4 vRand;
varying vec2 vHighPrecisionZW;
flat varying vec3 vCentrTree;
flat varying int vDetail;
flat varying vec3 vNormal;
flat varying vec3 vLightDir;
flat varying float vColor;

uniform sampler2D tTrees;
uniform sampler2D tTreeDetail;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

void main() {

    float surfaceId = fract((vCentrTree.x + vCentrTree.y + vCentrTree.z) * 3.424);
    float negativeDistance = perspectiveDepthToViewZ(gl_FragCoord.z, uNearFar.x, uNearFar.y);

    if (vDetail == 1) {

        float shapes = 5.0;
        float shapesStep = 1.0 / shapes;
        float offset = floor(mod((vRand.z * 4.35 + vRand.w * 43.5) * shapes, shapes));
        vec2 uv = vec2(vUv.x * shapesStep + offset * shapesStep, vUv.y);
        if (texture2D(tTreeDetail, uv).r > 0.9) discard;
        surfaceId = fract(vRand.x * 32.234);
        gl_FragDepth = viewZToPerspectiveDepth(negativeDistance + 0.2, uNearFar.x, uNearFar.y);
    } else {
        float shape = texture2D(tTrees, vUv).r;
        if (shape > 0.9) discard;
        float noise = sinenoise1(vec3(vUv * mix(0.8, 1.0, vRand.z) * 5.0, time * 0.1));
        gl_FragDepth = viewZToPerspectiveDepth(negativeDistance + noise * 0.1, uNearFar.x, uNearFar.y);
    }

    float outlineContribution = step(sinenoise1(vec3(vUv * 2.0, vRand.x + vRand.w * 34.32)), 0.35);

    float light = dot(normalize(vNormal), normalize(vLightDir));
    light = min(light, extrasShadow());

    vec3 grassColor = mix(uColor1, uColor2, clamp(vColor, 0.0, 1.0));
    grassColor = mix(grassColor, uColor3, clamp(vColor - 1.0, 0.0, 1.0));

    vec3 colorShadow = rgb2hsv(grassColor);
    colorShadow.r -= 0.02;
    colorShadow.b *= 0.5;
    colorShadow = hsv2rgb(colorShadow);

    vec3 color = mix(colorShadow, grassColor, smoothstep(0.0, 0.1, light));
    addFog(color, vPos.z);

    gl_FragColor = vec4(color, surfaceId);
    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5), vec2(0.0), outlineContribution);
}
`;

export class TreeLeaves {

  constructor({ scene, shared }) {
    this.scene = scene;
    this.shared = shared;
    this.group = new THREE.Group();
    this.group.name = 'tree-leaves';

    this.meshes = [];
    this.material = null;
    this.visible = true;

    this._scratch = new THREE.Vector3();
  }

  async load({ geometryLoader, textureLoader }) {
    const [trees, detail] = await Promise.all([
      textureLoader.load('tree-leaves.ktx2', 'repeat'),
      textureLoader.load('tree-leaves-detail.ktx2', 'repeat'),
    ]);

    this.material = createExtrasMaterial({
      name: 'tree-leaves',
      shared: this.shared,
      uniforms: {
        uScale: { value: U_SCALE },
        uLeavesShake: { value: U_LEAVES_SHAKE },
        uShakeSpeed: { value: U_SHAKE_SPEED },
        tTrees: { value: trees },
        tTreeDetail: { value: detail },
        uColor1: { value: new THREE.Color(LEAF_COLORS[0]) },
        uColor2: { value: new THREE.Color(LEAF_COLORS[1]) },
        uColor3: { value: new THREE.Color(LEAF_COLORS[2]) },
      },
      lights: true,
      vertexShader: createExtrasVertex(vertexShader, { shadows: true }),
      fragmentShader: createExtrasFragment(fragmentShader, { shadows: true }),
      shadowSide: THREE.FrontSide,
    });

    const batched = await Promise.all(TERRAIN.treeLeaves.map((name) => geometryLoader.batched(name)));
    for (const treeBatches of batched) {
      for (const { geometry } of treeBatches) {
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.name = 'tree-leaves-tree';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        this.meshes.push(mesh);
      }
    }
    this.scene.add(this.group);
  }

  update(time, dt, character) {
    if (!this.material) return;
    const position = character?.position;
    if (position) {

      this._scratch.copy(position).normalize().add(position);
      this.material.uniforms.charPos.value.copy(this._scratch);
      this.material.uniforms.charSpeed.value = character.velocity ? character.velocity.length() : 0;
    }

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
      const count = index ? index.count : mesh.geometry.attributes.position.count;
      if (mesh.visible) {
        triangles += count / 3;
        visible++;
      }
    }
    return { triangles, visible, total: this.meshes.length };
  }
}
