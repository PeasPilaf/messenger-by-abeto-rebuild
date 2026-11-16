import * as THREE from 'three';

import chunks from '../graphics/shaders/chunks.glsl?raw';
import { createTween } from '../core/Tween.js';

const WOBBLE = 0.35;

const VERTEX_SHADER =  `
    attribute float surfaceId;

    attribute vec3 iForward;
    attribute vec3 iUp;
    attribute vec3 iRight;
    attribute vec3 iRand;
    attribute vec3 iOffset;

    uniform float uTime;
    uniform float uShow;
    uniform float uMultiplier;
    uniform vec3 uLightPos;

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

        vec3 pos = position * uShow;

        float multiplier = uMultiplier;
        float wingLength = abs(position.z);
        float flapAnimation = sin(position.x * 5.0 + wingLength * 5.0 * multiplier
                                  - uTime * mix(10.0 * multiplier, 17.0, iRand.x) * multiplier);
        pos.y += flapAnimation * wingLength * 0.7;
        pos *= mix(0.7, 1.2, iRand.y);
        pos.y -= 0.5;
        pos.zy = rotate(0.6 * sin(uTime * multiplier + iRand.z * 100.0 - pos.x)) * pos.zy;

        mat3 tbn = mat3(iForward, iUp, iRight);
        vec3 worldPos = iOffset + tbn * pos;
        vec3 worldNormal = tbn * normal;

        vNormal = normalize(normalMatrix * worldNormal);
        vPos = viewMatrix * vec4(worldPos, 1.0);
        vLDir = (viewMatrix * vec4(normalize(uLightPos - worldPos), 0.0)).xyz;

        gl_Position = projectionMatrix * vPos;
        vHighPrecisionZW = gl_Position.zw;
    }
`;

const FRAGMENT_SHADER =  `
    layout(location = 1) out highp vec4 gInfo;

    #include <common>
    #include <packing>
    /* INCLUDE_CHUNKS */

    uniform sampler2D tAtlas;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec4 vPos;
    varying vec3 vLDir;
    varying vec2 vHighPrecisionZW;
    flat varying float vSurfaceId;

    void main() {
        vec3 baseColor = texture(tAtlas, vUv).rgb;

        vec3 colorShadow = rgb2hsv(baseColor);
        colorShadow.b *= 0.5;
        colorShadow = hsv2rgb(colorShadow);

        vec3 nvNormal = normalize(vNormal);
        float sh = max(0.0, dot(nvNormal, normalize(vLDir)));
        sh = 1.0 - step(0.4, sh);

        vec3 col = mix(baseColor, colorShadow, sh);
        addFog(col, vPos.z);

        gl_FragColor = vec4(col, vSurfaceId);
        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                     encodeNormalSpheremap(nvNormal), 1.0);
    }
`;

function hash11(p) {
  let x = p * 0.1031;
  x = (x - Math.floor(x)) * (x + 33.33);
  x *= x + x;
  return x - Math.floor(x);
}

const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

function sampleCurve(points, progress) {
  const width = points.length;
  const index = Math.floor(mod(progress, width));
  const nextIndex = Math.floor(mod(progress + 1, width));
  const fraction = Math.abs(progress) % 1;
  return new THREE.Vector3().lerpVectors(points[index], points[nextIndex % width], fraction);
}

export class IntroBirds {

  constructor({ scene, geometryLoader, shared, textures, flocks }) {
    this.scene = scene;
    this.geometryLoader = geometryLoader;
    this.shared = shared;
    this.textures = textures;
    this.flocks = flocks;
    this.lightPosition = new THREE.Vector3();
    this.ready = this._load();
  }

  async _load() {
    this.meshes = await Promise.all(this.flocks.map((flock) => this._buildFlock(flock)));
    return this;
  }

  async _buildFlock(options) {
    const settings = {
      count: 15,
      groups: 5,
      multiplier: 1,
      speed: 1.5,
      direction: 1,
      noise: 0.4,
      ...options,
    };

    const curveGeometry = await this.geometryLoader.load(settings.curve);
    const curveAttribute = Object.entries(curveGeometry.attributes).find(([name]) => name.startsWith('position'));
    const control = [];
    const array = curveAttribute[1].array;
    for (let i = 0; i < curveAttribute[1].count; i++) {
      control.push(new THREE.Vector3(array[i * 3], array[i * 3 + 1], array[i * 3 + 2]));
    }

    const path = new THREE.CurvePath();
    for (let i = 0; i < control.length - 1; i++) path.add(new THREE.LineCurve3(control[i], control[i + 1]));
    path.add(new THREE.LineCurve3(control[control.length - 1], control[0]));

    const curvePoints = path.getSpacedPoints(control.length).slice(0, control.length);

    const birdGeometry = await this.geometryLoader.load(settings.bird);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(birdGeometry.index);
    for (const name of Object.keys(birdGeometry.attributes)) {
      geometry.setAttribute(name, birdGeometry.attributes[name]);
    }
    geometry.setAttribute('iOffset', new THREE.InstancedBufferAttribute(new Float32Array(settings.count * 3), 3));
    geometry.setAttribute('iForward', new THREE.InstancedBufferAttribute(new Float32Array(settings.count * 3), 3));
    geometry.setAttribute('iUp', new THREE.InstancedBufferAttribute(new Float32Array(settings.count * 3), 3));
    geometry.setAttribute('iRight', new THREE.InstancedBufferAttribute(new Float32Array(settings.count * 3), 3));
    geometry.setAttribute('iRand', new THREE.InstancedBufferAttribute(new Float32Array(settings.count * 3), 3));
    geometry.instanceCount = settings.count;

    const material = new THREE.ShaderMaterial({
      name: `intro-birds-${settings.curve}`,
      uniforms: {
        uTime: this.shared.uTime,
        uShow: { value: 1 },
        uMultiplier: { value: settings.multiplier },
        tAtlas: { value: this.textures.palette },
        uLightPos: { value: this.lightPosition },

        uFogColorNear: this.shared.uFogColorNear,
        uFogColorFar: this.shared.uFogColorFar,
        uFogDistance: this.shared.uFogDistance,
        uFogDensity: this.shared.uFogDensity,
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER.replace('/* INCLUDE_CHUNKS */', chunks),
      transparent: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Birds (${settings.curve})`;
    mesh.frustumCulled = false;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    this.scene.add(mesh);

    const birds = [];
    for (let i = 0; i < settings.count; i++) {
      const seed = [hash11(i * 1.618 + 0.31), hash11(i * 2.414 + 0.77), hash11(i * 3.732 + 0.13)];
      const groupOffset = Math.floor(seed[0] / (1 / settings.groups));
      const speed = 2 * settings.direction * settings.speed * (seed[1] < 0.3 ? 0.75 : 1);
      birds.push({
        seed,
        speed,
        progress: (curvePoints.length / settings.groups) * groupOffset + seed[2] * 12.4234,
        position: new THREE.Vector3(),
        previous: new THREE.Vector3(),
        forward: new THREE.Vector3(1, 0, 0),
        up: new THREE.Vector3(0, 1, 0),
        right: new THREE.Vector3(0, 0, 1),
      });
    }

    return { settings, mesh, geometry, material, birds, curvePoints };
  }

  setLightPosition(position) {
    this.lightPosition.copy(position);
  }

  update(time) {
    if (!this.meshes) return;
    for (const flock of this.meshes) {
      const { birds, geometry, curvePoints } = flock;
      const offsets = geometry.attributes.iOffset.array;
      const forwards = geometry.attributes.iForward.array;
      const ups = geometry.attributes.iUp.array;
      const rights = geometry.attributes.iRight.array;
      const randoms = geometry.attributes.iRand.array;

      for (let i = 0; i < birds.length; i++) {
        const bird = birds[i];
        const progress = bird.progress + time * bird.speed;
        const target = sampleCurve(curvePoints, progress);

        bird.previous.copy(bird.position);
        bird.position.copy(target);

        const wobble = WOBBLE * flock.settings.noise;
        bird.position.x += Math.sin(target.y * 0.3 + time * 0.23 + bird.seed[0] * 20.0) * wobble;
        bird.position.y += Math.sin(target.z * 0.3 + time * 0.19 + bird.seed[1] * 20.0) * wobble;
        bird.position.z += Math.sin(target.x * 0.3 + time * 0.21 + bird.seed[2] * 20.0) * wobble;

        bird.forward.subVectors(bird.position, bird.previous);
        if (bird.forward.lengthSq() < 1e-8) {
          bird.forward.copy(sampleCurve(curvePoints, progress + 1)).sub(target).normalize();
        } else {
          bird.forward.normalize();
        }
        bird.up.copy(bird.position).normalize();
        bird.right.crossVectors(bird.forward, bird.up);

        offsets[i * 3] = bird.position.x;
        offsets[i * 3 + 1] = bird.position.y;
        offsets[i * 3 + 2] = bird.position.z;
        forwards[i * 3] = bird.forward.x;
        forwards[i * 3 + 1] = bird.forward.y;
        forwards[i * 3 + 2] = bird.forward.z;
        ups[i * 3] = bird.up.x;
        ups[i * 3 + 1] = bird.up.y;
        ups[i * 3 + 2] = bird.up.z;
        rights[i * 3] = bird.right.x;
        rights[i * 3 + 1] = bird.right.y;
        rights[i * 3 + 2] = bird.right.z;
        randoms[i * 3] = bird.seed[0];
        randoms[i * 3 + 1] = bird.seed[1];
        randoms[i * 3 + 2] = bird.seed[2];
      }

      for (const name of ['iOffset', 'iForward', 'iUp', 'iRight', 'iRand']) {
        geometry.attributes[name].needsUpdate = true;
      }
    }
  }

  playInAnimation(delay = 0) {
    for (const { material } of this.meshes ?? []) {
      createTween(material.uniforms.uShow, {
        from: { value: 0 },
        to: { value: 1 },
        duration: 2,
        delay,
        ease: 'none',
      });
    }
  }

  dispose() {
    for (const { geometry, material, mesh } of this.meshes ?? []) {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    }
  }
}

export { sampleCurve };
