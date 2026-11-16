import * as THREE from 'three';

import { COLORS } from '../graphics/constants.js';

const SKY_RADIUS = 55;
const PARALLAX_AMOUNT = 0.9;

const vertexShader =  `
    varying vec2 vHighPrecisionZW;
    varying vec2 vUv;
    void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vHighPrecisionZW = gl_Position.zw;
        vUv = uv;
    }
`;

const fragmentShader =  `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform sampler2D tCloudNoise;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;

    varying vec2 vHighPrecisionZW;
    varying vec2 vUv;

    layout(location = 1) out highp vec4 gInfo;

    void main() {
        vec2 screenUv = gl_FragCoord.xy / uResolution;

        float t = uTime * 0.0005;

        vec2 uv = vUv * 1.0;

        float noise = texture2D(tCloudNoise, uv * vec2(1.0, 2.0) + vec2(t)).r;
        noise *= texture2D(tCloudNoise, uv * vec2(1.0, 2.0)).r;

        noise *= smoothstep(0.1, 0.2, 1.0 - abs(vUv.y - 0.5) * 2.0);

        float blend = step(0.27, noise);

        float id = mix(0.01, 1.0, blend);
        vec3 cloudColor = mix(uColor3, uColor2, screenUv.y);
        vec3 color = mix(uColor1, cloudColor, blend);

        gl_FragColor = vec4(color, id);
        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5), vec2(0.0), 1.0);
    }
`;

export class Sky {
  constructor(scene, cloudNoiseTexture) {
    this.scene = scene;

    this.lastRotation = new THREE.Quaternion();
    this.currentRotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI * 0.5,
    );
    this._q0 = new THREE.Quaternion();
    this._q1 = new THREE.Quaternion();

    this.material = new THREE.ShaderMaterial({
      name: 'sky',
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        tCloudNoise: { value: cloudNoiseTexture },

        uColor1: { value: new THREE.Color('#75bdc3') },
        uColor2: { value: new THREE.Color('#9fe2e0') },
        uColor3: { value: new THREE.Color('#b9ebea') },
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: true,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 32), this.material);
    this.mesh.name = 'sky';
    this.mesh.rotation.x = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  setResolution(width, height) {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  update(time, character) {
    this.material.uniforms.uTime.value = time;
    if (!character) return;

    const local = character.object;

    this._q0.copy(local.quaternion).premultiply(
      this._q1.setFromAxisAngle(local.up, Math.PI - local.rotationHorizontal),
    );
    this.mesh.quaternion.copy(this._q0);

    this._q1.copy(this._q0).invert().multiply(this.lastRotation);
    this.lastRotation.copy(this._q0);
    this._q0.copy(this.currentRotation).premultiply(this._q1);
    this.currentRotation.slerp(this._q0, PARALLAX_AMOUNT);
    this.mesh.quaternion.multiply(this.currentRotation);
  }
}

export { COLORS };
