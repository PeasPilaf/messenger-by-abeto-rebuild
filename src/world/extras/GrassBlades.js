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
const BLADE_SCALE = 0.7;

function createBladeGeometry() {
  const geometry = new THREE.PlaneGeometry();
  geometry.rotateZ(Math.PI);
  geometry.translate(0, -0.5, 0);
  geometry.rotateX(Math.PI * -0.5);
  geometry.scale(BLADE_SCALE, BLADE_SCALE, BLADE_SCALE);
  return geometry;
}

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

void main() {
    vRand = randomm;
    vUv = uv;

    vec3 grassBottomPos = vec3(instanceMatrix[3]);
    vec3 grassDir = grassBottomPos - charPos;
    float grassDist = length(grassDir);

    vec3 grassUp = normalize(up);
    vec3 grassCamDir = normalize(cameraPosition - grassBottomPos);
    float grassUpDisplacement = fit(max(0.0, dot(grassUp, grassCamDir)), 0.05, 0.3, 0.0, 1.0);
    vec3 grassOffset = grassBottomPos + grassUp * grassUpDisplacement * 0.02;

    vec3 camToGrass = normalize(grassOffset - cameraPosition);
    vec3 grassRight = cross(grassUp, camToGrass);
    vec3 grassForward = cross(grassRight, grassUp);
    mat3 grassTBN = mat3(grassRight, grassForward, grassUp);
    float grassScale = fit(fract(randomm.x + randomm.w * 2.0), 0.0, 1.0, 0.8, 1.3);

    vec3 grassPosition = position.xyz * grassScale;
    vec4 worldPosition = vec4(grassTBN * grassPosition + grassOffset, 1.0);

    float upMult = step(0.5, uv.y);
    float grassdisp = 0.1 + 0.2 * randomm.x;
    float grassspeed = 0.25 + 0.3 * randomm.y;
    worldPosition.xyz += grassRight * sinenoise1(vec3(grassBottomPos.x, 0.0, grassBottomPos.z) * 0.05 + time * grassspeed) * grassdisp * upMult;
    worldPosition.xyz += grassRight * sinenoise1(vec3(grassBottomPos.x, 0.0, grassBottomPos.z) * 0.1 + vec3(313.123) + time * grassspeed) * grassdisp * upMult;

    vec3 grassDisp = normalize(grassDir) * fit(grassDist, 0.0, fit(charSpeed, 0.0, 0.01, 0.0, 1.25), 1.0, 0.0)
                   * upMult * fit(charSpeed, 0.0, 0.15, 0.0, 0.3);
    if (length(grassDisp) > 0.001) {
        grassDisp *= 1.0 - abs(dot(normalize(grassDisp), grassUp));
        worldPosition.xyz += grassDisp;
    }

    wNormal = grassUp;
    wPos = worldPosition.xyz;
    vNormal = normalize((viewMatrix * vec4(grassUp, 0.0)).xyz);

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
varying vec3 wNormal;
varying vec3 vNormal;
varying vec4 vPos;
varying vec2 vUv;
varying vec4 vRand;
varying vec2 vHighPrecisionZW;

uniform sampler2D tColors;
uniform sampler2D tGrass;

void main() {
    float outlineContribution = 1.0;

    float grassUVAmount = 10.0;
    float grassUVX = mix(vUv.x, 1.0 - vUv.x, step(0.5, vRand.w));
    vec2 grassUV = vec2(
        fract(grassUVX / grassUVAmount + 1.0 / grassUVAmount * floor(vRand.y * grassUVAmount)),
        vUv.y * 0.5 + 0.5 * floor(mod(vRand.z * 2.0 + vRand.x * 3.32, 2.0)));
    if (texture2D(tGrass, grassUV).r > 0.1) discard;

    vec3 baseColor = texture2D(tColors, vec2(0.15, 0.95)).rgb;
    vec3 colorhsv = rgb2hsv(baseColor);
    vec3 baseColor2 = hsv2rgb(colorhsv - vec3(0.0, 0.0, 0.075));
    vec3 baseColor3 = hsv2rgb(colorhsv + vec3(0.0, 0.0, 0.075));

    vec3 grassColor = mix(baseColor, baseColor2, step(0.5, fract(vRand.x * 34.324 + vRand.y * 21.231)));
    grassColor = mix(grassColor, baseColor3, step(0.5, fract(vRand.z * 5.53 + vRand.w * 4.423)));

    outlineContribution *= step(0.4, sinenoise1(vec3((vUv + vec2(vRand.x * 3.34, vRand.y * 3.1)) * 7.0,
                                                     vRand.z * 12.312312)) * 0.5 + 0.5);

    vec3 colorShadow = rgb2hsv(grassColor);
    colorShadow.r -= 0.02;
    colorShadow.b *= 0.5;
    colorShadow = hsv2rgb(colorShadow);

    float shadowCut = smoothstep(0.2, 0.4, extrasShadow());
    vec3 color = mix(colorShadow, grassColor, shadowCut);

    outlineContribution *= step(0.015, vUv.y);

    float surfaceId = vRand.x;

    gl_FragColor = vec4(color, surfaceId);
    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                 encodeNormalSpheremap(normalize(vNormal)), outlineContribution);
}
`;

export class GrassBlades {
  constructor({ scene, shared }) {
    this.scene = scene;
    this.shared = shared;
    this.group = new THREE.Group();
    this.group.name = 'grass-blades';

    this.meshes = [];
    this.material = null;
  }

  async load({ geometryLoader, textureLoader }) {
    const [grassTexture, palette] = await Promise.all([
      textureLoader.load('grass-blades-highq.ktx2', 'linearfilter'),
      textureLoader.load('atlas.png', 'srgb-nearest'),
    ]);

    this.material = createExtrasMaterial({
      name: 'grass',
      shared: this.shared,
      uniforms: {
        tGrass: { value: grassTexture },
        tColors: { value: palette },
      },
      lights: true,

      defines: { USE_INSTANCING: '' },
      vertexShader: createExtrasVertex(vertexShader, { shadows: true }),
      fragmentShader: createExtrasFragment(fragmentShader, { shadows: true }),
    });

    const blade = createBladeGeometry();
    const pointCloud = await geometryLoader.load(TERRAIN.grass);
    const patches = await geometryLoader.instancedPatches(blade, pointCloud);

    for (const patch of patches) {
      const geometry = patch.geometry;

      geometry.setAttribute('instanceMatrix', new THREE.InstancedBufferAttribute(geometry._matrixArray, 16));
      const sphere = computeInstanceBounds(geometry, geometry._matrixArray, geometry.instanceCount, BLADE_SCALE);

      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = `grass-patch-${patch.instanceId}`;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.userData.boundingSphere = sphere;
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.scene.add(this.group);
  }

  update(time, dt, character) {
    const position = character?.position;
    if (this.material && position) {
      this.material.uniforms.charPos.value.copy(position);
      this.material.uniforms.charSpeed.value = character.velocity ? character.velocity.length() : 0;
    }
    for (const mesh of this.meshes) {
      mesh.visible = isWithinVisibility(mesh.userData.boundingSphere, position, VISIBILITY_THRESHOLD);
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
    return { triangles, visible, total: this.meshes.length, instances: 660 };
  }
}
