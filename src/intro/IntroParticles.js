import * as THREE from 'three';

import chunks from '../graphics/shaders/chunks.glsl?raw';
import { createTween } from '../core/Tween.js';

const VERTEX_SHADER =  `
    uniform float uShow1;
    uniform float uTime;
    uniform vec2 uResolution;
    attribute vec3 color;

    varying vec3 vNoise;
    varying float vProgress;
    varying float vRotation;
    varying float vSize;
    varying vec2 vHighPrecisionZW;

    void main() {
        vNoise = color;

        float steppedTime = floor(uTime * 2.0) / 2.0;
        vec3 pos = position;

        vRotation = sin(steppedTime + vNoise.r * 20.0) * 3.14 * vNoise.g;
        pos.y += vRotation * 0.1;

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

        vProgress = fract(vNoise.g * 20.0);
        vProgress = floor(vProgress * 16.0) / 16.0;
        vProgress = clamp(vProgress, 0.0, 1.0);

        vSize = vNoise.b;
        if (vSize > 0.5) vSize *= 2.0;

        gl_Position = projectionMatrix * mvPos;
        vHighPrecisionZW = gl_Position.zw;

        gl_PointSize = (uResolution.y / mix(70.0, 50.0, vSize)) * uShow1;
    }
`;

const FRAGMENT_SHADER =  `
    layout(location = 1) out highp vec4 gInfo;

    #include <common>
    #include <packing>
    /* INCLUDE_CHUNKS */

    varying vec3 vNoise;
    varying float vProgress;
    varying float vRotation;
    varying float vSize;
    varying vec2 vHighPrecisionZW;

    uniform sampler2D tSprites;
    uniform vec3 uColor;
    uniform float uShow1;

    mat2 rotate(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat2(c, s, -s, c);
    }

    void main() {
        vec2 uv = gl_PointCoord.xy;

        uv -= 0.5;
        uv = rotate(vRotation) * uv;
        uv += 0.5;

        uv.y = 1.0 - uv.y;
        uv.x /= 16.0;
        uv.x += 1.0 / 16.0;
        uv.x += vProgress;

        float sprite = texture2D(tSprites, uv).r;
        float alpha = sprite;
        if (alpha < 0.5) discard;

        alpha *= smoothstep(0.0, 0.1, uShow1);

        vec3 color = mix(uColor + uColor * 0.5, uColor * uColor, vNoise.r);

        float outlineContribution = 0.0;
        float depth = 1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5);

        if (vSize > 1.5) {
            outlineContribution = 0.1;
            depth = 0.1;
        }

        gl_FragColor = vec4(color, alpha);
        gInfo = vec4(depth, 0.0, 0.0, outlineContribution);
    }
`;

export class IntroParticles {

  constructor({ scene, geometryLoader, shared, sprites, resolution }) {
    this.scene = scene;
    this.geometryLoader = geometryLoader;
    this.show = { value: 0 };
    this.material = new THREE.ShaderMaterial({
      name: 'intro-particles',
      uniforms: {
        uTime: shared.uTime,
        uShow1: this.show,
        tSprites: { value: sprites },
        uColor: { value: new THREE.Color('#6a8f89') },
        uResolution: { value: new THREE.Vector2(resolution.x, resolution.y) },
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
    this.geometry = await this.geometryLoader.load('planets/intro/points');
    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.name = 'stars';
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.scene.add(this.mesh);
    return this;
  }

  setResolution(width, height) {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  playInAnimation(delay = 0) {
    createShowTween(this.show, delay);
    this.mesh.rotation.y = -Math.PI * 0.75;
    createTweenRotation(this.mesh.rotation, delay + 0.5);
  }

  dispose() {
    this.geometry?.dispose();
    this.material.dispose();
    this.mesh?.removeFromParent();
  }
}

function createShowTween(show, delay) {
  createTween(show, {
    from: { value: 0 },
    to: { value: 1 },
    duration: 2,
    delay,
    ease: 'sine.inOut',
  });
}

function createTweenRotation(rotation, delay) {
  createTween(rotation, { to: { y: 0 }, duration: 4, delay, ease: 'inOut3' });
}
