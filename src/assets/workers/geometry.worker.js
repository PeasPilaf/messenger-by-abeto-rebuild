function composeMatrix(out, offset, px, py, pz, qx, qy, qz, qw, sx, sy, sz) {
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  out[offset] = (1 - (yy + zz)) * sx;
  out[offset + 1] = (xy + wz) * sx;
  out[offset + 2] = (xz - wy) * sx;
  out[offset + 3] = 0;
  out[offset + 4] = (xy - wz) * sy;
  out[offset + 5] = (1 - (xx + zz)) * sy;
  out[offset + 6] = (yz + wx) * sy;
  out[offset + 7] = 0;
  out[offset + 8] = (xz + wy) * sz;
  out[offset + 9] = (yz - wx) * sz;
  out[offset + 10] = (1 - (xx + yy)) * sz;
  out[offset + 11] = 0;
  out[offset + 12] = px;
  out[offset + 13] = py;
  out[offset + 14] = pz;
  out[offset + 15] = 1;
}

const BATCH_ID_ATTRIBUTE = 'batchId';
const INSTANCE_ID_ATTRIBUTE = 'instanceId';
const TRANSFORM_ATTRIBUTES = ['scale', 'quaternion', 'position'];

function splitIntoBatches(attributes, index) {
  const batchIdAttribute = attributes[BATCH_ID_ATTRIBUTE];
  if (!batchIdAttribute || !index) {
    throw new Error('Geometry does not have a batchId attribute or an index (geometryworker:1:6)');
  }

  const batchIds = new Set();
  const remappedIndexByBatch = new Map();
  const localIndexByBatch = new Map();
  const indexArray = index.array;
  const batchIdArray = batchIdAttribute.array;

  for (let i = 0; i < indexArray.length; i++) {
    const globalVertex = indexArray[i];
    const batchId = batchIdArray[globalVertex];
    batchIds.add(batchId);
    if (!remappedIndexByBatch.has(batchId)) {
      remappedIndexByBatch.set(batchId, []);
      localIndexByBatch.set(batchId, new Map());
    }
    const localIndex = localIndexByBatch.get(batchId);
    const remappedIndex = remappedIndexByBatch.get(batchId);
    if (localIndex.has(globalVertex)) {
      remappedIndex.push(localIndex.get(globalVertex));
    } else {
      const newLocalVertex = localIndex.size;
      localIndex.set(globalVertex, newLocalVertex);
      remappedIndex.push(newLocalVertex);
    }
  }

  const sortedBatchIds = Array.from(batchIds).sort((a, b) => a - b);
  const geometries = [];

  for (const batchId of sortedBatchIds) {
    const localIndex = localIndexByBatch.get(batchId);
    const remappedIndex = remappedIndexByBatch.get(batchId);
    const batchAttributes = {};

    for (const name in attributes) {
      if (name === BATCH_ID_ATTRIBUTE || name === 'index') continue;
      const { array, itemSize, normalized } = attributes[name];
      const out = new array.constructor(localIndex.size * itemSize);

      for (const [globalVertex, localVertex] of localIndex) {
        const sourceOffset = globalVertex * itemSize;
        const targetOffset = localVertex * itemSize;
        for (let component = 0; component < itemSize; component++) {
          out[targetOffset + component] = array[sourceOffset + component];
        }
      }
      batchAttributes[name] = { array: out, itemSize, normalized };
    }

    const IndexArrayCtor = remappedIndex.length >= 65535 ? Uint32Array : Uint16Array;
    const batchIndex = { array: new IndexArrayCtor(remappedIndex), itemSize: 1, normalized: false };

    geometries.push({ attributes: batchAttributes, index: batchIndex, userData: { batchId } });
  }

  return geometries;
}

function mergeInstanced(attributes, index, attributesInstanced) {
  const instancedNames = Object.keys(attributesInstanced);
  if (instancedNames.length === 0) {
    throw new Error('instanced: no per-instance attributes were supplied');
  }
  const firstAttribute = attributesInstanced[instancedNames[0]];
  const instanceCount = firstAttribute.array.length / firstAttribute.itemSize;

  const mergedAttributes = { ...attributes };
  for (const name of instancedNames) {
    if (TRANSFORM_ATTRIBUTES.includes(name)) continue;
    const record = attributesInstanced[name];
    mergedAttributes[name] = {
      array: record.array,
      itemSize: record.itemSize,
      normalized: record.normalized,
      isInstanced: true,
    };
  }

  const matrixArray = new Float32Array(instanceCount * 16);
  const sourcePosition = attributesInstanced.position;
  const sourceQuaternion = attributesInstanced.quaternion;
  const sourceScale = attributesInstanced.scale;

  for (let instance = 0; instance < instanceCount; instance++) {

    let px = 0, py = 0, pz = 0;
    let qx = 0, qy = 0, qz = 0, qw = 1;
    let sx = 1, sy = 1, sz = 1;

    if (sourceScale) {
      if (sourceScale.itemSize === 1) {
        sx = sy = sz = sourceScale.array[instance];
      } else {
        sx = sourceScale.array[instance * 3];
        sy = sourceScale.array[instance * 3 + 1];
        sz = sourceScale.array[instance * 3 + 2];
      }
    }
    if (sourceQuaternion) {
      qx = sourceQuaternion.array[instance * 4];
      qy = sourceQuaternion.array[instance * 4 + 1];
      qz = sourceQuaternion.array[instance * 4 + 2];
      qw = sourceQuaternion.array[instance * 4 + 3];
      const length = Math.hypot(qx, qy, qz, qw) || 1;
      qx /= length; qy /= length; qz /= length; qw /= length;
    }
    if (sourcePosition) {
      px = sourcePosition.array[instance * 3];
      py = sourcePosition.array[instance * 3 + 1];
      pz = sourcePosition.array[instance * 3 + 2];
    }

    composeMatrix(matrixArray, instance * 16, px, py, pz, qx, qy, qz, qw, sx, sy, sz);
  }

  return { attributes: mergedAttributes, index: index ?? null, instanceCount, matrixArray };
}

function splitInstancedPatches(attributes, index, attributesInstanced) {
  const instanceIdAttribute = attributesInstanced[INSTANCE_ID_ATTRIBUTE];
  if (!instanceIdAttribute) {
    throw new Error('Geometry does not have an instanceId attribute (geometryworker:1783)');
  }

  const pointsByInstance = new Map();
  const instanceIdArray = instanceIdAttribute.array;
  for (let point = 0; point < instanceIdArray.length; point++) {
    const instanceId = instanceIdArray[point];
    if (!pointsByInstance.has(instanceId)) pointsByInstance.set(instanceId, []);
    pointsByInstance.get(instanceId).push(point);
  }

  const sortedInstanceIds = Array.from(pointsByInstance.keys()).sort((a, b) => a - b);
  const patches = [];

  for (const instanceId of sortedInstanceIds) {
    const pointIndices = pointsByInstance.get(instanceId);
    const patchInstancedAttributes = {};

    for (const name in attributesInstanced) {
      if (name === INSTANCE_ID_ATTRIBUTE) continue;
      const { array, itemSize, normalized } = attributesInstanced[name];
      const out = new array.constructor(pointIndices.length * itemSize);
      pointIndices.forEach((sourcePoint, targetPoint) => {
        for (let component = 0; component < itemSize; component++) {
          out[targetPoint * itemSize + component] = array[sourcePoint * itemSize + component];
        }
      });
      patchInstancedAttributes[name] = { array: out, itemSize, normalized };
    }

    const patch = mergeInstanced(attributes, index, patchInstancedAttributes);
    patch.userData = { instanceId };
    patches.push(patch);
  }

  return patches;
}

function addAttributeBuffers(target, attributes) {
  for (const record of Object.values(attributes)) target.add(record.array.buffer);
}

function addGeometryBuffers(target, geometry) {
  addAttributeBuffers(target, geometry.attributes);
  if (geometry.index) target.add(geometry.index.array.buffer);
  if (geometry.matrixArray) target.add(geometry.matrixArray.buffer);
}

function transferListFor(result) {
  const buffers = new Set();
  if (Array.isArray(result)) {
    for (const geometry of result) addGeometryBuffers(buffers, geometry);
  } else {
    addGeometryBuffers(buffers, result);
  }
  return Array.from(buffers);
}

self.onmessage = (event) => {
  const { id, action, attributes, index, attributesInstanced } = event.data ?? {};
  try {
    let result;
    if (action === 'batched') {
      result = splitIntoBatches(attributes, index);
    } else if (action === 'instanced') {
      result = mergeInstanced(attributes, index, attributesInstanced);
    } else if (action === 'instancedPatches') {
      result = splitInstancedPatches(attributes, index, attributesInstanced);
    } else {
      throw new Error(`geometry.worker: unknown action "${action}"`);
    }
    self.postMessage({ id, ok: true, result }, transferListFor(result));
  } catch (error) {
    self.postMessage({ id, ok: false, error: error && error.stack ? String(error.stack) : String(error) });
  }
};
