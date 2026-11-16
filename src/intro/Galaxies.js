import * as THREE from 'three';

import chunks from '../graphics/shaders/chunks.glsl?raw';
import { createTween } from '../core/Tween.js';

const VERTEX_SHADER =  `
    attribute float surfaceId;

    varying vec2 vHighPrecisionZW;
    varying vec2 vUv;
    varying float vSurfaceId;

    void main() {
        vSurfaceId = surfaceId;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vHighPrecisionZW = gl_Position.zw;
    }
`;

const FRAGMENT_SHADER =  `
    layout(location = 1) out highp vec4 gInfo;

    #include <common>
    #include <packing>
    /* INCLUDE_CHUNKS */

    varying vec2 vHighPrecisionZW;
    varying vec2 vUv;
    varying float vSurfaceId;

    uniform float uTime;
    uniform sampler2D tCloudNoise;
    uniform sampler2D tGalaxy;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    uniform float uShow;

    mat2 rotation2D(float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return mat2(c, s, -s, c);
    }

    void main() {

        float spinDir = vSurfaceId > 0.5 ? 1.0 : -1.0;
        vec2 uv = vUv;
        uv -= 0.5;
        uv = rotation2D(floor(uTime * 2.0 + vSurfaceId * 100.0) * 0.06 * spinDir) * uv;
        uv *= 1.5;
        uv += 0.5;

        float noise = texture2D(tCloudNoise, uv).x;

        vec2 galaxyUv = vUv;
        if (fract(vSurfaceId + 0.75) > 0.5) galaxyUv.x = 1.0 - galaxyUv.x;

        float value = texture2D(tGalaxy, galaxyUv).r;
        value = 1.0 - pow(1.0 - value, 5.0);

        if (fract(vSurfaceId + 0.2) > 0.5) {
            value = 1.0 - clamp(length(vUv - 0.5) * 8.0, 0.0, 1.0);
        }

        value -= noise * mix(0.1, 0.95, fract(vSurfaceId + 0.873));

        float alpha = step(0.25, value * uShow);
        if (alpha < 0.9) discard;

        float colorid = floor(vSurfaceId * 3.0);
        vec3 color = mix(uColor1, uColor2, clamp(colorid, 0.0, 1.0));
        color = mix(color, uColor3, clamp(colorid - 1.0, 0.0, 1.0));

        gl_FragColor = vec4(color, alpha * mix(0.3, 0.4, vSurfaceId));
        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5), vec2(0.0), 0.0);
    }
`;

export class Galaxies {

  constructor({ scene, geometryLoader, shared, textures }) {
    this.scene = scene;
    this.geometryLoader = geometryLoader;
    this.show = { value: 0 };

    this.material = new THREE.ShaderMaterial({
      name: 'intro-galaxies',
      uniforms: {
        uTime: shared.uTime,
        uColor1: { value: new THREE.Color('#4f755a') },
        uColor2: { value: new THREE.Color('#3a726b') },
        uColor3: { value: new THREE.Color('#4b5766') },
        tCloudNoise: { value: textures.cloudNoise64 },
        tGalaxy: { value: textures.galaxy },
        uShow: this.show,
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER.replace('/* INCLUDE_CHUNKS */', chunks),
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDst: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      depthWrite: false,
    });

    this.ready = this._load();
  }

  async _load() {
    this.geometry = await this.geometryLoader.load('planets/present/intro/galaxies');
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'Galaxies';
    this.mesh.renderOrder = 5;
    this.mesh.scale.setScalar(3);
    this.scene.add(this.mesh);
    return this;
  }

  playInAnimation(delay = 0) {
    createTween(this.show, {
      from: { value: 0 },
      to: { value: 1 },
      duration: 3,
      delay,
      ease: 'none',
    });
  }

  dispose() {
    this.geometry?.dispose();
    this.material.dispose();
    this.mesh?.removeFromParent();
  }
}
