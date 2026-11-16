import * as THREE from 'three';

import { BIRDS } from '../../assets/manifest.js';
import { createExtrasFragment, createExtrasMaterial, createExtrasVertex } from './ExtrasMaterial.js';

export const FLOCKS = [
  {
    name: 'birds',
    count: 15,
    groups: 5,
    curve: BIRDS.curves[0],
    bird: BIRDS.meshes[0],
    multiplier: 1,
    speed: 1.5,
    direction: 1,
  },
  {
    name: 'birds2',
    count: 20,
    groups: 5,
    curve: BIRDS.curves[1],
    bird: BIRDS.meshes[1],
    multiplier: 1.25,
    speed: 0.7,
    direction: -1,
  },
];

const vertexShader =  `
attribute float surfaceId;
attribute vec4 aRand;

uniform vec3 uLightPos;
uniform float uMultiplier;
uniform float uShow;

varying vec2 vUv;
varying vec4 vPos;
varying vec3 vLDir;
varying vec3 vNormal;
varying vec2 vHighPrecisionZW;
flat varying float vSurfaceId;

mat2 rotate(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, s, -s, c);
}

void main() {
    vUv = uv;

    vSurfaceId = fract(surfaceId + float(gl_InstanceID) * 5.435435);

    vec3 rand = aRand.xyz;

    vec3 pos = position * uShow;
    float multiplier = uMultiplier;
    float wingLength = abs(position.z);
    float flap = sin(position.x * 5.0 + wingLength * 5.0 * multiplier
                   - time * mix(10.0 * multiplier, 17.0, rand.x) * multiplier);
    pos.y += flap * wingLength * 0.7;
    pos *= mix(0.7, 1.2, rand.y);
    pos.y -= 0.5;
    pos.zy = rotate(0.6 * sin(time * multiplier + rand.z * 100.0 - pos.x)) * pos.zy;

    vec3 n = mat3(instanceMatrix) * normal;
    vNormal = normalize(normalMatrix * n);

    vec4 worldPosition = instanceMatrix * vec4(pos, 1.0);
    vPos = viewMatrix * worldPosition;
    vLDir = (viewMatrix * vec4(normalize(uLightPos - worldPosition.xyz), 0.0)).xyz;

    gl_Position = projectionMatrix * vPos;
    vHighPrecisionZW = gl_Position.zw;
}
`;

const fragmentShader =  `
layout(location = 1) out highp vec4 gInfo;

uniform sampler2D tAtlas;

varying vec2 vUv;
varying vec3 vNormal;
varying vec4 vPos;
varying vec3 vLDir;
varying vec2 vHighPrecisionZW;
flat varying float vSurfaceId;

void main() {
    vec3 baseColor = texture2D(tAtlas, vUv).rgb;
    vec3 colorShadow = rgb2hsv(baseColor);
    colorShadow.b *= 0.5;
    colorShadow = hsv2rgb(colorShadow);

    vec3 nvNormal = normalize(vNormal);
    float sh = max(0.0, dot(nvNormal, normalize(vLDir)));
    sh = 1.0 - step(0.4, sh);

    vec3 color = mix(baseColor, colorShadow, sh);
    addFog(color, vPos.z);

    gl_FragColor = vec4(color, vSurfaceId);
    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                 encodeNormalSpheremap(nvNormal), 1.0);
}
`;

function sinenoise1(x, y, z) {
  const layers = [
    [1.5, 3.4598, 1.234], [3.12, -3.234, 4.221], [0.355, 2.3, -1.375],
    [-0.156, -3.34, -0.4566], [-4.1235, -0.485, -1.45], [2.54, -0.879, -2.123],
  ];
  let value = 0;
  for (const [fx, fy, fz] of layers) value += Math.sin(x * fx + y * fy + z * fz);
  return value / 6;
}

function hash11(p) {
  let value = p % 1;
  if (value < 0) value += 1;
  value = (value * 0.1031) % 1;
  value *= value + 33.33;
  value *= value + value;
  return value % 1;
}

export class Birds {

  constructor({ scene, shared, flock }) {
    this.scene = scene;
    this.shared = shared;
    this.flock = flock;
    this.mesh = null;
    this._sun = null;

    this._position = [];
    this._previous = [];
    this._velocity = [];
    this._seeds = new Float32Array(flock.count * 4);
    this._matrix = new THREE.Matrix4();
    this._forward = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._target = new THREE.Vector3();
  }

  async load({ geometryLoader, textureLoader, atlas }) {
    const [birdGeometry, curveGeometry, birdTexture] = await Promise.all([
      geometryLoader.load(this.flock.bird),
      geometryLoader.load(this.flock.curve),
      textureLoader.load('atlas.png', 'srgb-nearest'),
    ]);
    this.atlas = birdTexture ?? atlas;

    const positions = curveGeometry.getAttribute('position_1');
    const points = [];
    for (let i = 0; i < positions.count; i++) {
      points.push(new THREE.Vector3().fromBufferAttribute(positions, i));
    }
    this.curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
    this.curveWidth = positions.count;

    this._curveSamples = this.curve.getSpacedPoints(this.curveWidth);

    const count = this.flock.count;
    for (let i = 0; i < count; i++) {
      const point = this._curveSamples[0].clone();
      this._position.push(point.clone());
      this._previous.push(point.clone());
      this._velocity.push(new THREE.Vector3());

      const seed = hash11(i * 0.61803398875 + 0.13);
      this._seeds[i * 4 + 0] = seed;
      this._seeds[i * 4 + 1] = hash11(seed * 7.31 + 0.7);
      this._seeds[i * 4 + 2] = hash11(seed * 3.17 + 0.31);
      this._seeds[i * 4 + 3] = hash11(seed * 11.7 + 0.5);
    }
    birdGeometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(this._seeds, 4));

    this.material = createExtrasMaterial({
      name: this.flock.name,
      shared: this.shared,
      uniforms: {
        tAtlas: { value: this.atlas },
        uLightPos: { value: new THREE.Vector3(0, 1, 0) },
        uMultiplier: { value: this.flock.multiplier },
        uShow: { value: 1 },
      },
      vertexShader: createExtrasVertex(vertexShader),
      fragmentShader: createExtrasFragment(fragmentShader),
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(birdGeometry, this.material, count);
    this.mesh.name = this.flock.name;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this._simulate(0, 0, true);
    this._simulate(1 / 60, 1, true);
    this.scene.add(this.mesh);
  }

  _targetAt(progress, index) {

    const width = this.curveWidth;
    let wrapped = progress % width;
    if (wrapped < 0) wrapped += width;
    const scaled = (wrapped / width) * (this._curveSamples.length - 1);
    const lo = Math.floor(scaled);
    const hi = Math.min(this._curveSamples.length - 1, lo + 1);
    return this._target.copy(this._curveSamples[lo]).lerp(this._curveSamples[hi], scaled - lo);
  }

  _simulate(time, dtRatio, snap) {
    const { count, groups, speed, direction } = this.flock;
    const noise = this.flock.noise ?? 0.4;
    for (let i = 0; i < count; i++) {

      const flockHash = hash11(this._seeds[i * 4 + 3] * 8.54534);
      const flockIndex = Math.floor(flockHash * groups);
      const speedVariation = hash11(i / this.curveWidth) > 0.3 ? 1.0 : 0.75;
      const progress = time * 2 * direction * speed * speedVariation
        + (this.curveWidth / groups) * flockIndex
        + this._seeds[i * 4 + 2] * 12.4234;
      const target = this._targetAt(progress, i);

      const position = this._position[i];
      const velocity = this._velocity[i];

      if (snap) {
        position.copy(target);
        velocity.set(0, 0, 0);
        this._previous[i].copy(position);
        continue;
      }

      const nAmount = 0.005 * noise * dtRatio;
      velocity.x += sinenoise1(position.x, position.y + this._seeds[i * 4 + 3] * 53.5645, position.z + time * 0.05) * nAmount;
      velocity.y += sinenoise1(position.x, position.y + this._seeds[i * 4 + 3] * 653.8667, position.z + time * 0.1) * nAmount;
      velocity.z += sinenoise1(position.x, position.y + this._seeds[i * 4 + 3] * 21.65465, position.z + time * 0.025) * nAmount;

      velocity.addScaledVector(target.sub(position), 0.0003 * dtRatio);
      velocity.multiplyScalar(Math.pow(0.99, dtRatio));
      position.addScaledVector(velocity, dtRatio);
    }
  }

  update(time, dt, character) {
    if (!this.mesh) return;

    if (!this._sun) {
      this._sun = this.scene.getObjectByProperty('isDirectionalLight', true) ?? null;
    }
    if (this._sun) this.material.uniforms.uLightPos.value.copy(this._sun.position);

    this._simulate(time, dt * 60, false);

    const count = this.flock.count;
    for (let i = 0; i < count; i++) {
      const position = this._position[i];
      const previous = this._previous[i];
      this._forward.copy(position).sub(previous);
      if (this._forward.lengthSq() < 1e-10) this._forward.set(0, 0, 1);
      this._forward.normalize();
      this._up.copy(position).normalize();
      this._right.crossVectors(this._forward, this._up).normalize();
      this._matrix.makeBasis(this._forward, this._up, this._right);
      this._matrix.setPosition(position);
      this.mesh.setMatrixAt(i, this._matrix);
      previous.copy(position);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  object() {
    return this.mesh;
  }

  stats() {
    const index = this.mesh?.geometry?.index;
    const triangles = this.mesh
      ? ((index ? index.count : this.mesh.geometry.attributes.position.count) / 3) * this.flock.count
      : 0;
    return { triangles, visible: this.mesh?.visible ? 1 : 0, total: this.flock.count };
  }
}
