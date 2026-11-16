import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeAccessoryGeometries(geometries) {
  if (!Array.isArray(geometries) || geometries.length === 0) {
    throw new Error('mergeAccessoryGeometries: no accessory geometries to merge');
  }
  const merged = mergeGeometries(geometries, false);
  if (!merged) {
    throw new Error('mergeAccessoryGeometries: accessory geometries do not share one attribute layout');
  }

  merged.computeBoundingBox();
  return merged;
}
