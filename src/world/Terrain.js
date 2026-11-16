import * as THREE from 'three';

import { TERRAIN } from '../graphics/constants.js';

const LOD_FILES = ['full', 'full-lod-1', 'full-lod-2', 'full-lod-3'];

const scratchDirection = new THREE.Vector3();
const scratchClosest = new THREE.Vector3();
const scratchCharacterDirection = new THREE.Vector3();
const scratchMatrix = new THREE.Matrix4();
const scratchFrustum = new THREE.Frustum();

export class Terrain {

  constructor({ scene, loadGeometry, material, chunks = TERRAIN.chunks }) {
    this.scene = scene;
    this.loadGeometry = loadGeometry;
    this.material = material;
    this.chunkCount = chunks;

    this.meshes = [[], [], [], []];

    this.bounds = [];
  }

  async load() {

    const geometries = await Promise.all(
      LOD_FILES.map((file) =>
        Promise.all(Array.from({ length: this.chunkCount }, (_, i) => this.loadGeometry(`planets/present/${file}_${i}`))),
      ),
    );

    for (let lod = 0; lod < LOD_FILES.length; lod++) {
      for (let chunk = 0; chunk < this.chunkCount; chunk++) {
        const geometry = geometries[lod][chunk];
        prepareTerrainGeometry(geometry);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.name = `terrain-lod${lod}-chunk${chunk}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        this.scene.add(mesh);
        this.meshes[lod][chunk] = mesh;

        if (lod === 0) {

          geometry.computeBoundingSphere();
          this.bounds[chunk] = geometry.boundingSphere.clone();
        }
      }
    }
  }

  update(camera, characterPosition) {
    if (this.bounds.length === 0) return;

    camera.updateMatrixWorld();
    scratchMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    scratchFrustum.setFromProjectionMatrix(scratchMatrix);

    const characterRadius = characterPosition.length();

    for (let chunk = 0; chunk < this.chunkCount; chunk++) {
      const sphere = this.bounds[chunk];
      const center = sphere.center;

      scratchDirection.copy(characterPosition).sub(center).normalize();
      const centerDistance = center.distanceTo(characterPosition);
      const reach = Math.min(centerDistance, sphere.radius);
      scratchClosest.copy(center).addScaledVector(scratchDirection, reach);

      const distanceToCharacter = characterPosition.distanceTo(scratchClosest);

      const radialDelta = Math.abs(center.length() - characterRadius);
      const facingReach = Math.min(centerDistance, sphere.radius + radialDelta);
      scratchClosest.copy(center).addScaledVector(scratchDirection, facingReach);

      scratchCharacterDirection.copy(characterPosition).divideScalar(characterRadius || 1);
      const dotCharacter = scratchCharacterDirection.dot(scratchClosest.normalize());

      const culled = !scratchFrustum.intersectsSphere(sphere);
      const hidden = dotCharacter < TERRAIN.dotThreshold || culled;

      let visibleLod = -1;
      if (!hidden) {
        if (distanceToCharacter <= TERRAIN.lod1Distance) visibleLod = 0;
        else if (distanceToCharacter <= TERRAIN.lod2Distance) visibleLod = 1;
        else if (distanceToCharacter <= TERRAIN.lod3Distance) visibleLod = 2;
        else visibleLod = 3;
      }

      for (let lod = 0; lod < 4; lod++) {
        this.meshes[lod][chunk].visible = lod === visibleLod;
      }
    }
  }
}

export function prepareTerrainGeometry(geometry) {
  const surfaceId = geometry.getAttribute('surfaceId');
  if (surfaceId && !(surfaceId.array instanceof Int32Array)) {
    geometry.setAttribute('surfaceId', new THREE.Int32BufferAttribute(Array.from(surfaceId.array), 1));
  }
  const elementId = geometry.getAttribute('elementId');
  if (elementId && !(elementId.array instanceof Int32Array)) {
    geometry.setAttribute('elementId', new THREE.Int32BufferAttribute(Array.from(elementId.array), 1));
  }

  if (!geometry.getAttribute('uv')) {

    console.warn('[terrain] geometry has no uv attribute:', geometry.name);
  }
  return geometry;
}
