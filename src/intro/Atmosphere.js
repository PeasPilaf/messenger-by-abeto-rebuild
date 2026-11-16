import * as THREE from 'three';

import chunks from '../graphics/shaders/chunks.glsl?raw';

const VERTEX_SHADER =  `
    varying vec2 vHighPrecisionZW;
    varying vec3 vNormal;
    varying vec3 vPos;
    varying vec3 vMvPos;

    void main() {
        vPos = position;
        vMvPos = vec3(modelViewMatrix * vec4(position, 1.0));
        gl_Position = projectionMatrix * vec4(vMvPos, 1.0);
        vHighPrecisionZW = gl_Position.zw;
        vNormal = normalize(normalMatrix * normal);
    }
`;

const FRAGMENT_SHADER =  `
    layout(location = 1) out highp vec4 gInfo;

    #include <common>
    #include <packing>
    /* INCLUDE_CHUNKS */

    varying vec2 vHighPrecisionZW;
    varying vec3 vNormal;
    varying vec3 vMvPos;
    varying vec3 vPos;

    uniform sampler2D tCloudNoise;
    uniform vec3 uColor1;
    uniform float uShow;

    void main() {

        float fresnel = abs(dot(normalize(vNormal), normalize(vMvPos.xyz)));

        float noise = triplanar(tCloudNoise, vNormal, vPos, 0.015).x;
        noise *= 1.0 - pow(1.0 - fresnel, 2.0);
        noise *= uShow;

        if (noise < 0.3) discard;

        gl_FragColor = vec4(uColor1, 0.434532);
        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5), vec2(0.0), 0.0);
    }
`;

export class Atmosphere {

  constructor(scene, cloudNoise64) {
    this.show = { value: 0 };

    this.material = new THREE.ShaderMaterial({
      name: 'intro-atmosphere',
      uniforms: {
        uColor1: { value: new THREE.Color('#568f66') },
        tCloudNoise: { value: cloudNoise64 },
        uShow: this.show,
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER.replace('/* INCLUDE_CHUNKS */', chunks),
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDst: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(38, 32, 32), this.material);
    this.mesh.name = 'Atmosphere';
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
