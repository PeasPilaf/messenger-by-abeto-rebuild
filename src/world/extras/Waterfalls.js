import * as THREE from 'three';

import { TERRAIN } from '../../assets/manifest.js';
import {
  createExtrasFragment,
  createExtrasMaterial,
  createExtrasVertex,
  isWithinVisibility,
} from './ExtrasMaterial.js';
import {
  BEACH_FRAGMENT,
  BEACH_VERTEX,
  INLET_FRAGMENT,
  INLET_VERTEX,
  SPLASH_FRAGMENT,
  SPLASH_VERTEX,
  WATERFALL_FRAGMENT,
  WATERFALL_VERTEX,
} from './WaterfallShaders.js';

const VISIBILITY_THRESHOLD = 25;

const TYPES = [
  {
    name: 'waterfall_vfx',
    file: 'planets/present/waterfall_vfx',
    surfaceId: 0.3,
    colors: ['#66acb2', '#216c72', '#afe7eb'],
    textures: { tNoise: 'waterNoise', tNoise2: 'noiseBlur', tNoise3: 'cloudNoise' },
    vertex: WATERFALL_VERTEX,
    fragment: WATERFALL_FRAGMENT,
  },
  {
    name: 'waterfallsplash_vfx',
    file: 'planets/present/waterfallsplash_vfx',
    surfaceId: 0.32,
    colors: ['#75bdc3', '#468c92', '#afe7eb'],
    textures: { tNoise: 'waterNoise' },
    vertex: SPLASH_VERTEX,
    fragment: SPLASH_FRAGMENT,
  },
  {
    name: 'waterfall_inlet_vfx',
    file: 'planets/present/waterfall_inlet_vfx',
    surfaceId: 0.34,
    colors: ['#62acb2', '#468c92', '#afe7eb'],
    textures: { tNoise: 'waterNoise', tNoise2: 'noisePixellated' },
    vertex: INLET_VERTEX,
    fragment: INLET_FRAGMENT,
  },
  {
    name: 'beachfoam_vfx',
    file: 'planets/present/beachfoam_vfx',
    surfaceId: 0.36,
    colors: ['#376b6f', '#467d7f', '#bcb1a4'],
    textures: { tNoise: 'waterNoise', tNoise2: 'noiseBlur' },
    vertex: BEACH_VERTEX,
    fragment: BEACH_FRAGMENT,
    usesSceneDepth: true,
  },
];

export class Waterfalls {
  constructor({ scene, shared }) {
    this.scene = scene;
    this.shared = shared;

    this.group = new THREE.Group();
    this.group.name = 'waterfalls-preview';

    this.waterGroup = new THREE.Group();
    this.waterGroup.name = 'waterfalls';

    this.meshes = [];

    this.waterMeshes = [];
    this.materials = [];
    this._sceneTextures = null;
  }

  async load({ geometryLoader, textureLoader }) {

    const [waterNoise, noiseBlur, noisePixellated, cloudNoise] = await Promise.all([
      textureLoader.load('water-noises-highq.ktx2', 'linearfilter-repeat'),
      textureLoader.load('noise-simplex-layered-blur-highq.ktx2', 'linearfilter-repeat'),
      textureLoader.load('noise-simplex-layered-pixellated-highq.ktx2', 'linearfilter-repeat'),
      textureLoader.load('clouds_noise_512.ktx2', 'linearfilter-repeat'),
    ]);
    const textures = { waterNoise, noiseBlur, noisePixellated, cloudNoise };

    const geometries = await Promise.all(
      TYPES.map((type) => geometryLoader.load(type.file)),
    );

    TYPES.forEach((type, index) => {
      const geometry = geometries[index];
      geometry.computeBoundingSphere();

      for (const waterPass of [false, true]) {
        const material = this._createMaterial(type, textures, waterPass);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${type.name}${waterPass ? '' : '-preview'}`;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        if (waterPass) {
          this.waterGroup.add(mesh);
          this.waterMeshes.push(mesh);
        } else {
          this.group.add(mesh);
          this.meshes.push(mesh);
        }
        this.materials.push(material);
      }
    });

    this.scene.add(this.group);
    if (this._sceneTextures) this.setSceneTextures(...this._sceneTextures);
  }

  _createMaterial(type, textures, waterPass) {
    const uniforms = {
      uColor1: { value: new THREE.Color(type.colors[0]) },
      uColor2: { value: new THREE.Color(type.colors[1]) },
      uColor3: { value: new THREE.Color(type.colors[2]) },
    };
    for (const [uniformName, textureKey] of Object.entries(type.textures)) {
      uniforms[uniformName] = { value: textures[textureKey] };
    }
    if (type.usesSceneDepth) {
      Object.assign(uniforms, {
        tScene: { value: null },
        tSceneInfo: { value: null },
        uProjMat: { value: new THREE.Matrix4() },
        uWorldMat: { value: new THREE.Matrix4() },
        uCameraNear: { value: 0.2 },
        uCameraFar: { value: 175 },
        uHasScene: { value: 0 },
      });
    }
    if (!waterPass) uniforms.uSurfaceId = { value: type.surfaceId };

    return createExtrasMaterial({
      name: `${type.name}${waterPass ? '' : '-preview'}`,
      shared: this.shared,
      uniforms,
      defines: waterPass ? { WATER_PASS: '' } : {},
      vertexShader: createExtrasVertex(type.vertex),
      fragmentShader: createExtrasFragment(type.fragment),
      side: THREE.DoubleSide,
    });
  }

  setSceneTextures(colorTexture, infoTexture) {
    this._sceneTextures = [colorTexture, infoTexture];
    for (const material of this.materials) {
      const u = material.uniforms;
      if (!u.tSceneInfo) continue;
      u.tScene.value = colorTexture ?? null;
      u.tSceneInfo.value = infoTexture ?? null;
      u.uHasScene.value = colorTexture && infoTexture ? 1 : 0;
    }
  }

  setCamera(camera) {
    for (const material of this.materials) {
      const u = material.uniforms;
      if (!u.uProjMat) continue;
      u.uProjMat.value.copy(camera.projectionMatrix);
      u.uWorldMat.value.copy(camera.matrixWorld);
      u.uCameraNear.value = camera.near;
      u.uCameraFar.value = camera.far;
    }
  }

  update(time, dt, character) {
    const position = character?.position;
    for (const mesh of this.meshes) {
      mesh.visible = isWithinVisibility(mesh.geometry.boundingSphere, position, VISIBILITY_THRESHOLD);
    }
    for (const mesh of this.waterMeshes) {
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
      if (!mesh.visible) continue;
      const index = mesh.geometry.index;
      triangles += (index ? index.count : mesh.geometry.attributes.position.count) / 3;
      visible++;
    }
    return { triangles, visible, total: this.meshes.length };
  }
}
