import * as THREE from 'three';

import { EMOJIS } from '../../assets/manifest.js';
import {
  createExtrasFragment,
  createExtrasMaterial,
  createExtrasVertex,
} from './ExtrasMaterial.js';

export const MAX_EMOJIS = 64;

export const EMOJI_EXPIRATION = 2;

const vertexShader =  `

attribute float surfaceId;
attribute vec3 aOffset;
attribute vec3 aUp;
attribute float aRandom;
attribute float aScale;

uniform float uEmojiIndex;

varying vec2 vUv;
varying vec3 vNormal;
varying vec4 vPos;
varying vec3 vLightDir;
varying vec2 vHighPrecisionZW;
flat varying float vSurfaceId;
varying vec3 vLocalPos;

void main() {
    vUv = uv;
    vSurfaceId = surfaceId;
    vLocalPos = position;
    vLightDir = vec3(0.0);
    #if NUM_DIR_LIGHTS > 0
        vLightDir = normalize(directionalLights[0].direction);
    #endif

    mat4 rot = rotation3D(aUp, time * 1.5 + (aRandom + uEmojiIndex) * 32.2432);
    vec3 pos = (rot * vec4(position * aScale, 1.0)).xyz;
    vec3 normalRotated = (rot * vec4(normal, 0.0)).xyz;

    vec3 wPos = aOffset + pos;
    vNormal = normalize(normalMatrix * normalRotated);
    vPos = viewMatrix * vec4(wPos, 1.0);
    gl_Position = projectionMatrix * vPos;
    vHighPrecisionZW = gl_Position.zw;

    vec3 transformedNormal = vNormal;
    vec4 worldPosition = vec4(wPos, 1.0);
    #include <shadowmap_vertex>
}
`;

const fragmentShader =  `
layout(location = 1) out highp vec4 gInfo;

uniform sampler2D tAtlas;

varying vec2 vUv;
varying vec3 vNormal;
varying vec4 vPos;
varying vec3 vLightDir;
varying vec2 vHighPrecisionZW;
flat varying float vSurfaceId;
varying vec3 vLocalPos;

void main() {
    float light = dot(normalize(vNormal), normalize(vLightDir));
    light = min(light, extrasShadow());

    vec3 color = texture2D(tAtlas, vUv).rgb;
    vec3 colorShadow = rgb2hsv(color);
    colorShadow.r -= 0.02;
    colorShadow.b *= 0.5;
    colorShadow = hsv2rgb(colorShadow);
    color = mix(colorShadow, color, smoothstep(0.2, 0.4, light));

    addFog(color, vPos.z);

    gl_FragColor = vec4(color, vSurfaceId);

    float outlineNoise = sinenoise1(vLocalPos * 25.0 + vec3(3.324, 34.2, 56.343) * vSurfaceId) * 0.5 + 0.5;
    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                 encodeNormalSpheremap(normalize(vNormal)), step(0.3, outlineNoise));
}
`;

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function emojiScale(life) {
  return smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.7, life);
}

function createEmojiInstanceGeometry(baseGeometry, capacity) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.instanceCount = 0;
  geometry.index = baseGeometry.index;
  for (const [name, attribute] of Object.entries(baseGeometry.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  const make = (itemSize) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * itemSize), itemSize);
  geometry.setAttribute('aOffset', make(3));
  geometry.setAttribute('aUp', make(3));
  geometry.setAttribute('aRandom', make(1));
  geometry.setAttribute('aScale', make(1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  return geometry;
}

export class Emojis {
  constructor({ scene, shared }) {
    this.scene = scene;
    this.shared = shared;
    this.group = new THREE.Group();
    this.group.name = 'emojis';

    this.meshes = [];
    this.materials = [];

    this.particles = [];
  }

  async load({ geometryLoader, textureLoader }) {
    const [atlas, geometries] = await Promise.all([
      textureLoader.load('atlas.png', 'srgb-nearest'),
      Promise.all(EMOJIS.map((name) => geometryLoader.load(name))),
    ]);

    geometries.forEach((baseGeometry, type) => {
      const geometry = createEmojiInstanceGeometry(baseGeometry, MAX_EMOJIS);
      const material = createExtrasMaterial({
        name: `emojis-${type}`,
        shared: this.shared,
        uniforms: {
          tAtlas: { value: atlas },
          uEmojiIndex: { value: type },
        },
        lights: true,

        vertexShader: createExtrasVertex(vertexShader, { shadows: true }),
        fragmentShader: createExtrasFragment(fragmentShader, { shadows: true }),
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `emoji-${type}`;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.materials.push(material);
    });

    this.scene.add(this.group);
  }

  spawn({ position, up, scale = 0.8 + Math.random() * 0.2, emoji = Math.floor(Math.random() * EMOJIS.length) }) {
    if (this.particles.length >= MAX_EMOJIS) return -1;
    const direction = up ? up.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const particle = {
      type: emoji % EMOJIS.length,
      position: position.clone(),
      up: direction,

      velocity: direction.clone().multiplyScalar(0.02),
      random: Math.random(),
      scale,
      life: 1,
      age: 0,
    };
    this.particles.push(particle);
    return this.particles.length - 1;
  }

  spawnAboveCharacter(character, emoji) {
    const radius = character.radius ?? character.boundingRadius ?? 1.2;
    return this.spawn({
      position: character.position.clone().addScaledVector(character.up, radius * 1.05),
      up: character.up,
      emoji,
    });
  }

  update(time, dt, character) {
    if (this.meshes.length === 0) return;
    const dtRatio = dt * 60;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += dt;
      if (particle.age >= EMOJI_EXPIRATION) {
        this.particles.splice(i, 1);
        continue;
      }

      particle.life = Math.max(0, 1 - particle.age / EMOJI_EXPIRATION);
      particle.velocity.addScaledVector(particle.up, 0.00075 * dtRatio);
      particle.velocity.multiplyScalar(Math.pow(0.9, dtRatio));
      particle.position.addScaledVector(particle.velocity, dtRatio);
    }

    const counts = new Array(this.meshes.length).fill(0);

    for (const particle of this.particles) {
      const mesh = this.meshes[particle.type];
      const geometry = mesh.geometry;
      const index = counts[particle.type]++;
      const offset = geometry.getAttribute('aOffset');
      const upAttribute = geometry.getAttribute('aUp');
      const randomAttribute = geometry.getAttribute('aRandom');
      const scaleAttribute = geometry.getAttribute('aScale');
      offset.setXYZ(index, particle.position.x, particle.position.y, particle.position.z);
      upAttribute.setXYZ(index, particle.up.x, particle.up.y, particle.up.z);
      randomAttribute.setX(index, particle.random);
      scaleAttribute.setX(index, particle.scale * emojiScale(particle.life));
    }

    for (let type = 0; type < this.meshes.length; type++) {
      const mesh = this.meshes[type];
      const count = counts[type];
      mesh.visible = count > 0;
      mesh.geometry.instanceCount = count;
      if (count === 0) continue;
      for (const name of ['aOffset', 'aUp', 'aRandom', 'aScale']) {
        mesh.geometry.getAttribute(name).needsUpdate = true;
      }
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
      const perType = (index ? index.count : mesh.geometry.attributes.position.count) / 3;
      triangles += perType * mesh.geometry.instanceCount;
      visible++;
    }
    return { triangles, visible, active: this.particles.length, capacity: MAX_EMOJIS };
  }
}
