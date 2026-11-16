import * as THREE from 'three';

import { createIntroMaterial } from './IntroMaterial.js';

const GEO = {
  planet: 'planets/present/intro/planet',
  water: 'planets/present/intro/water',
  trees: 'planets/present/intro/trees',
  clouds: 'planets/present/intro/clouds',
};

export class IntroPlanet {

  constructor(planetGroup, { geometryLoader, shared, textures }) {
    this.group = planetGroup;
    this.geometryLoader = geometryLoader;
    this.shared = shared;
    this.textures = textures;
    this.meshes = {};
  }

  async load() {
    const [planet, water, trees, clouds] = await Promise.all([
      this.geometryLoader.load(GEO.planet),
      this.geometryLoader.load(GEO.water),
      this.geometryLoader.load(GEO.trees),
      this.geometryLoader.load(GEO.clouds),
    ]);

    const surfaceMaterial = createIntroMaterial({ kind: 'surface', shared: this.shared, textures: this.textures });
    const waterMaterial = createIntroMaterial({ kind: 'water', shared: this.shared, textures: this.textures });

    const cloudMaterial = createIntroMaterial({
      kind: 'cloud',
      shared: this.shared,
      textures: this.textures,
      color: '#F8F8F8',
    });

    const add = (name, geometry, material, { cast, receive }) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      this.group.add(mesh);
      this.meshes[name] = mesh;
      return mesh;
    };

    add('Planet', planet, surfaceMaterial, { cast: true, receive: true });
    add('Water', water, waterMaterial, { cast: false, receive: true });
    add('Trees', trees, surfaceMaterial, { cast: true, receive: true });
    add('Clouds', clouds, cloudMaterial, { cast: false, receive: false });

    this.materials = { surfaceMaterial, waterMaterial, cloudMaterial };
    return this;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    for (const material of Object.values(this.materials ?? {})) material.dispose();
    this.group.clear();
  }
}
