import { BufferAttribute, BufferGeometry, Mesh, Raycaster, Vector3 } from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HITMESH_NAMES = [
  'planets/present/hitmesh_0',
  'planets/present/hitmesh_1',
  'planets/present/hitmesh_2',
  'planets/present/hitmesh_3',
  'planets/present/hitmesh_4',
];

export const SKIP_COLLISION_ATTRIBUTE = 'skipcollision';

const scratch = new Vector3();

export function mergeHitmeshes(geometries) {
  if (!geometries || geometries.length === 0) {
    throw new Error('CollisionWorld: no hitmesh geometries to merge');
  }

  const prepared = geometries.map((geometry, i) => {
    if (!geometry.attributes.position) {
      throw new Error(`CollisionWorld: hitmesh ${i} has no position attribute`);
    }

    if (!geometry.index) {
      const count = geometry.attributes.position.count;
      const index = new Uint32Array(count);
      for (let v = 0; v < count; v++) index[v] = v;
      geometry.setIndex(new BufferAttribute(index, 1));
    }

    const copy = geometry.clone();
    const skip = copy.getAttribute(SKIP_COLLISION_ATTRIBUTE);
    const flags = new Float32Array(copy.attributes.position.count);
    if (skip) {
      for (let v = 0; v < flags.length; v++) flags[v] = skip.getX(v);
    }
    copy.setAttribute(SKIP_COLLISION_ATTRIBUTE, new BufferAttribute(flags, 1));

    if (!copy.getAttribute('normal')) {
      copy.computeVertexNormals();
    }
    return copy;
  });

  const merged = mergeGeometries(prepared, false);
  if (!merged) {
    throw new Error(
      'CollisionWorld: mergeGeometries failed — hitmeshes disagree on attribute layout',
    );
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export class CollisionWorld {

  constructor({ loadGeometry, names = HITMESH_NAMES, buildBvh = true } = {}) {
    if (typeof loadGeometry !== 'function') {
      throw new Error('CollisionWorld: loadGeometry(name) is required');
    }
    this.loadGeometry = loadGeometry;
    this.names = names;
    this.buildBvh = buildBvh;

    this.geometry = null;

    this.boundsTree = null;

    this.mesh = null;

    this.timings = { load: 0, merge: 0, bvh: 0 };

    this._raycaster = new Raycaster();

    this._raycaster.firstHitOnly = true;

    this._loaded = false;
  }

  async load() {
    if (this._loaded) return this;

    const startLoad = performance.now();
    const geometries = await Promise.all(this.names.map((name) => this.loadGeometry(name)));
    this.timings.load = performance.now() - startLoad;

    const startMerge = performance.now();
    this.geometry = mergeHitmeshes(geometries);
    this.timings.merge = performance.now() - startMerge;

    if (this.buildBvh) {
      const startBvh = performance.now();

      this.boundsTree = new MeshBVH(this.geometry);
      this.geometry.boundsTree = this.boundsTree;
      this.timings.bvh = performance.now() - startBvh;
    }

    this.mesh = new Mesh(this.geometry);
    this.mesh.raycast = acceleratedRaycast;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrixWorld(true);

    this._loaded = true;
    return this;
  }

  raycast(origin, direction, { far = Infinity } = {}) {
    if (!this._loaded) return null;
    this._raycaster.set(origin, scratch.copy(direction).normalize());
    this._raycaster.far = far;
    const hits = this._raycaster.intersectObject(this.mesh);
    return hits.length > 0 ? hits[0] : null;
  }

  shapecast(callbacks) {
    if (!this.boundsTree) return false;
    return this.boundsTree.shapecast(callbacks);
  }

  closestPointToPoint(point, target = undefined, minThreshold = 0, maxThreshold = Infinity) {
    if (!this.boundsTree) return null;
    return this.boundsTree.closestPointToPoint(point, target, minThreshold, maxThreshold);
  }

  isSkippedTriangle(faceIndex) {
    if (!this.geometry) return false;
    const skip = this.geometry.getAttribute(SKIP_COLLISION_ATTRIBUTE);
    if (!skip) return false;
    const index = this.geometry.index;
    const firstVertex = index ? index.getX(faceIndex * 3) : faceIndex * 3;
    return skip.getX(firstVertex) > 0;
  }

  countSkippedTriangles() {
    if (!this.geometry) return 0;
    const skip = this.geometry.getAttribute(SKIP_COLLISION_ATTRIBUTE);
    if (!skip) return 0;
    const index = this.geometry.index;
    const triangles = index ? index.count / 3 : skip.count / 3;
    let skipped = 0;
    for (let t = 0; t < triangles; t++) {
      const firstVertex = index ? index.getX(t * 3) : t * 3;
      if (skip.getX(firstVertex) > 0) skipped++;
    }
    return skipped;
  }

  get triangleCount() {
    if (!this.geometry) return 0;
    return this.geometry.index ? this.geometry.index.count / 3 : this.geometry.attributes.position.count / 3;
  }

  dispose() {
    if (this.geometry) {
      this.geometry.boundsTree = null;
      this.geometry.dispose();
    }
    this.geometry = null;
    this.boundsTree = null;
    this.mesh = null;
    this._loaded = false;
  }
}
