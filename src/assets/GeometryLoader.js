import { BufferAttribute, BufferGeometry, Quaternion, Vector3 } from 'three';
import { decodeDrcUrl } from './DrcDecoder.js';
import {
  buildBufferGeometry,
  buildInstancedBufferGeometry,
  cloneRecords,
  normalizeGeometryName,
  recordFromDecodedAttribute,
  recordsFromDecoded,
  recordsFromGeometry,
} from './GeometryRecords.js';

export { normalizeGeometryName };

const GEOMETRY_WORKER_URL = new URL('./workers/geometry.worker.js', import.meta.url);

const BATCH_ID_ATTRIBUTE = 'batchId';
const INSTANCE_ID_ATTRIBUTE = 'instanceId';
export { BATCH_ID_ATTRIBUTE, INSTANCE_ID_ATTRIBUTE };

let geometryWorker = null;
let nextRequestId = 1;
const pendingRequests = new Map();

function getGeometryWorker() {
  if (geometryWorker) return geometryWorker;
  geometryWorker = new Worker(GEOMETRY_WORKER_URL, { type: 'module', name: 'geometry-worker' });
  geometryWorker.onmessage = (event) => {
    const { id, ok, result, error } = event.data ?? {};
    const request = pendingRequests.get(id);
    if (!request) return;
    pendingRequests.delete(id);
    if (ok) request.resolve(result);
    else request.reject(new Error(error || 'GeometryLoader: geometry worker reported an error'));
  };
  geometryWorker.onerror = (event) => {
    const error = new Error(`GeometryLoader: geometry worker failed — ${event.message || 'unknown error'}`);
    for (const request of pendingRequests.values()) request.reject(error);
    pendingRequests.clear();
    geometryWorker.terminate();
    geometryWorker = null;
    console.error(error.message);
  };
  return geometryWorker;
}

function postToGeometryWorker(action, payload) {
  const worker = getGeometryWorker();
  const transfers = [];
  for (const records of [payload.attributes, payload.attributesInstanced]) {
    if (!records) continue;
    for (const record of Object.values(records)) transfers.push(record.array.buffer);
  }
  if (payload.index) transfers.push(payload.index.array.buffer);

  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, action, ...payload }, transfers);
  });
}

export class GeometryLoader {
  constructor() {

    this._decodedCache = new Map();

    this._geometryCache = new Map();

    this._batchedCache = new Map();

    this._instancedCache = new Map();
  }

  _cached(cache, key, factory) {
    if (cache.has(key)) return cache.get(key);
    const promise = factory().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
    return promise;
  }

  _decoded(name) {
    const key = normalizeGeometryName(name);
    return this._cached(this._decodedCache, key, () => decodeDrcUrl(`${key}.drc`));
  }

  load(name) {
    const key = normalizeGeometryName(name);
    return this._cached(this._geometryCache, key, async () => {
      const decoded = await this._decoded(key);
      const geometry = new BufferGeometry();
      for (const attributeName of Object.keys(decoded.attributes)) {
        const record = recordFromDecodedAttribute(decoded, attributeName);
        geometry.setAttribute(
          attributeName,
          new BufferAttribute(record.array, record.itemSize, record.normalized),
        );
      }
      if (decoded.indices) {
        geometry.setIndex(new BufferAttribute(decoded.indices, 1));
      }

      geometry.userData = decoded.userData ? { ...decoded.userData } : {};
      return geometry;
    });
  }

  batched(name) {
    const key = normalizeGeometryName(name);
    return this._cached(this._batchedCache, key, async () => {
      const decoded = await this._decoded(key);
      if (!decoded.attributes[BATCH_ID_ATTRIBUTE] || !decoded.indices) {
        throw new Error(`GeometryLoader.batched: "${key}" has no batchId attribute or no index`);
      }
      const { attributes, index } = cloneRecords(recordsFromDecoded(decoded));
      const records = await postToGeometryWorker('batched', { attributes, index });
      return records.map((record) => ({
        geometry: buildBufferGeometry(record),
        batchId: record.userData.batchId,
      }));
    });
  }

  instanced(base, extra) {
    const cacheKey =
      typeof base === 'string' && typeof extra === 'string'
        ? `instanced|${normalizeGeometryName(base)} <> ${normalizeGeometryName(extra)}`
        : null;
    const build = async () => {
      const [baseRecords, instancedRecords] = await Promise.all([
        this._recordsFor(base),
        this._recordsFor(extra),
      ]);
      const result = await postToGeometryWorker('instanced', {
        attributes: baseRecords.attributes,
        index: baseRecords.index,
        attributesInstanced: instancedRecords.attributes,
      });
      return buildInstancedBufferGeometry(result);
    };
    return cacheKey ? this._cached(this._instancedCache, cacheKey, build) : build();
  }

  instancedPatches(base, extra) {
    const cacheKey =
      typeof base === 'string' && typeof extra === 'string'
        ? `instancedPatches|${normalizeGeometryName(base)} <> ${normalizeGeometryName(extra)}`
        : null;
    const build = async () => {
      const [baseRecords, instancedRecords] = await Promise.all([
        this._recordsFor(base),
        this._recordsFor(extra),
      ]);
      const patches = await postToGeometryWorker('instancedPatches', {
        attributes: baseRecords.attributes,
        index: baseRecords.index,
        attributesInstanced: instancedRecords.attributes,
      });
      return patches.map((record) => ({
        geometry: buildInstancedBufferGeometry(record),
        instanceId: record.userData.instanceId,
      }));
    };
    return cacheKey ? this._cached(this._instancedCache, cacheKey, build) : build();
  }

  async _recordsFor(source) {
    if (typeof source === 'string') return recordsFromGeometry(await this.load(source));
    if (source && source.isBufferGeometry) return recordsFromGeometry(source);
    throw new TypeError('GeometryLoader: expected an asset name or a BufferGeometry');
  }

  async loadBones(name) {
    const key = normalizeGeometryName(name);
    const decoded = await this._decoded(key);
    const { position, quaternion, scale, hierarchy } = decoded.attributes;
    if (!position || !quaternion || !scale || !hierarchy) {
      throw new Error(`GeometryLoader.loadBones: "${key}" is not a skeleton point cloud`);
    }
    const joints = [];
    for (let joint = 0; joint < decoded.numPoints; joint++) {
      joints.push({
        position: new Vector3().fromArray(position, joint * 3),

        quaternion: new Quaternion().fromArray(quaternion, joint * 4).normalize(),
        scale: new Vector3().fromArray(scale, joint * 3),
        parent: hierarchy[joint] - 1,
      });
    }
    const rootIndexes = joints.map((joint, index) => (joint.parent === -1 ? index : -1)).filter((index) => index >= 0);
    return { joints, jointCount: joints.length, rootIndexes };
  }

  async loadAnimation(name) {
    const key = normalizeGeometryName(name);
    const decoded = await this._decoded(key);
    const { position, quaternion, scale } = decoded.attributes;
    const fps = decoded.userData?.fps;
    const frames = decoded.userData?.frames;
    if (!position || !quaternion || !scale) {
      throw new Error(`GeometryLoader.loadAnimation: "${key}" is not an animation point cloud`);
    }
    if (!Number.isFinite(fps) || !Number.isFinite(frames) || frames <= 0) {
      throw new Error(`GeometryLoader.loadAnimation: "${key}" has no userData {fps, frames}`);
    }
    const jointCount = decoded.numPoints / frames;
    if (!Number.isInteger(jointCount)) {
      throw new Error(
        `GeometryLoader.loadAnimation: "${key}" has ${decoded.numPoints} points, not a multiple of ${frames} frames`,
      );
    }

    const tracks = new Array(jointCount);
    for (let joint = 0; joint < jointCount; joint++) {
      tracks[joint] = {
        position: new Float32Array(frames * 3),
        quaternion: new Float32Array(frames * 4),
        scale: new Float32Array(frames * 3),
      };
    }

    const quaternionScratch = new Quaternion();
    for (let frame = 0; frame < frames; frame++) {
      const frameBase = frame * jointCount;
      for (let joint = 0; joint < jointCount; joint++) {
        const sourcePoint = frameBase + joint;
        const track = tracks[joint];
        track.position[frame * 3 + 0] = position[sourcePoint * 3 + 0];
        track.position[frame * 3 + 1] = position[sourcePoint * 3 + 1];
        track.position[frame * 3 + 2] = position[sourcePoint * 3 + 2];
        quaternionScratch.fromArray(quaternion, sourcePoint * 4).normalize();
        track.quaternion[frame * 4 + 0] = quaternionScratch.x;
        track.quaternion[frame * 4 + 1] = quaternionScratch.y;
        track.quaternion[frame * 4 + 2] = quaternionScratch.z;
        track.quaternion[frame * 4 + 3] = quaternionScratch.w;
        track.scale[frame * 3 + 0] = scale[sourcePoint * 3 + 0];
        track.scale[frame * 3 + 1] = scale[sourcePoint * 3 + 1];
        track.scale[frame * 3 + 2] = scale[sourcePoint * 3 + 2];
      }
    }

    return {
      fps,
      frames,
      jointCount,
      joints: jointCount,
      duration: frames / fps,
      tracks,
    };
  }

  dispose() {
    for (const request of pendingRequests.values()) {
      request.reject(new Error('GeometryLoader: disposed while a request was in flight'));
    }
    pendingRequests.clear();
    if (geometryWorker) {
      geometryWorker.terminate();
      geometryWorker = null;
    }
    this._decodedCache.clear();
    this._geometryCache.clear();
    this._batchedCache.clear();
    this._instancedCache.clear();
  }
}
