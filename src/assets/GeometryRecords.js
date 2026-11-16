import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
} from 'three';

export function normalizeGeometryName(name) {
  let clean = String(name).trim();
  if (clean.startsWith('./')) clean = clean.slice(2);
  if (clean.startsWith('/')) clean = clean.slice(1);
  if (clean.toLowerCase().endsWith('.drc')) clean = clean.slice(0, -4);
  return clean;
}

export function recordFromDecodedAttribute(decoded, name) {
  return {
    array: decoded.attributes[name],
    itemSize: decoded.itemSizes[name],
    normalized: false,
  };
}

export function recordsFromDecoded(decoded) {
  const attributes = {};
  for (const name of Object.keys(decoded.attributes)) {
    attributes[name] = recordFromDecodedAttribute(decoded, name);
  }
  const index = decoded.indices
    ? { array: decoded.indices, itemSize: 1, normalized: false }
    : null;
  return { attributes, index };
}

export function recordsFromGeometry(geometry) {
  const attributes = {};
  for (const name in geometry.attributes) {
    const attribute = geometry.attributes[name];
    attributes[name] = {
      array: attribute.array.slice(),
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
    };
  }
  const index = geometry.index
    ? { array: geometry.index.array.slice(), itemSize: 1, normalized: geometry.index.normalized }
    : null;
  return { attributes, index };
}

export function cloneRecords(records) {
  const attributes = {};
  for (const name of Object.keys(records.attributes)) {
    const record = records.attributes[name];
    attributes[name] = { array: record.array.slice(), itemSize: record.itemSize, normalized: record.normalized };
  }
  const index = records.index
    ? { array: records.index.array.slice(), itemSize: 1, normalized: records.index.normalized }
    : null;
  return { attributes, index };
}

export function buildBufferGeometry(record) {
  const geometry = new BufferGeometry();
  if (record.index) {
    geometry.setIndex(new BufferAttribute(record.index.array, record.index.itemSize, record.index.normalized));
  }
  for (const name of Object.keys(record.attributes)) {
    const attribute = record.attributes[name];
    geometry.setAttribute(name, new BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized));
  }
  if (record.userData) geometry.userData = record.userData;
  return geometry;
}

export function buildInstancedBufferGeometry(record) {
  const geometry = new InstancedBufferGeometry();
  geometry.instanceCount = record.instanceCount;

  geometry._matrixArray = record.matrixArray;
  if (record.index) {
    geometry.setIndex(new BufferAttribute(record.index.array, record.index.itemSize, record.index.normalized));
  }
  for (const name of Object.keys(record.attributes)) {
    const attribute = record.attributes[name];
    const AttributeCtor = attribute.isInstanced ? InstancedBufferAttribute : BufferAttribute;
    geometry.setAttribute(name, new AttributeCtor(attribute.array, attribute.itemSize, attribute.normalized));
  }
  if (record.userData) geometry.userData = record.userData;
  return geometry;
}
