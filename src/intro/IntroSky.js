import * as THREE from 'three';

const SKY_RADIUS = 600;
const SKY_COLOR = '#75bdc3';

const VERTEX_SHADER =  `
    varying vec2 vHighPrecisionZW;
    void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vHighPrecisionZW = gl_Position.zw;
    }
`;

const FRAGMENT_SHADER =  `
    layout(location = 1) out highp vec4 gInfo;
    uniform vec3 uColor;

    varying vec2 vHighPrecisionZW;

    void main() {
        float outlineContribution = 1.0;
        float surfaceId = 1.0;
        gl_FragColor = vec4(uColor, surfaceId);

        gInfo = vec4(0.0, vec2(0.0), outlineContribution);
    }
`;

export class IntroSky {
  constructor(scene) {
    const material = new THREE.ShaderMaterial({
      name: 'intro-sky',
      uniforms: { uColor: { value: new THREE.Color(SKY_COLOR) } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: true,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), material);
    this.mesh.name = 'Sky';

    this.mesh.scale.setScalar(4);
    scene.add(this.mesh);

    this.ready = Promise.resolve(this);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
