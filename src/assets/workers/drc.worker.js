const TYPED_ARRAYS = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
];

let DATA_TYPE_NAMES = null;

function dataTypeNameFor(module, TypedArrayCtor) {
  if (!DATA_TYPE_NAMES) {
    DATA_TYPE_NAMES = {
      Int8Array: module.DT_INT8,
      Uint8Array: module.DT_UINT8,
      Uint8ClampedArray: module.DT_UINT8,
      Int16Array: module.DT_INT16,
      Uint16Array: module.DT_UINT16,
      Int32Array: module.DT_INT32,
      Uint32Array: module.DT_UINT32,
      Float32Array: module.DT_FLOAT32,
      Float64Array: module.DT_FLOAT64,
    };
  }
  const dataType = DATA_TYPE_NAMES[TypedArrayCtor.name];
  if (dataType === undefined) {
    throw new Error(`Draco: no DataType for ${TypedArrayCtor.name}`);
  }
  return dataType;
}

let decoderModulePromise = null;

function loadDecoderModule(wrapperUrl, wasmUrl) {
  if (!decoderModulePromise) {
    decoderModulePromise = (async () => {

      const [wrapper, wasmResponse] = await Promise.all([
        importShippedWrapper(wrapperUrl),
        fetch(wasmUrl),
      ]);
      if (!wasmResponse.ok) {
        throw new Error(`Draco: could not fetch ${wasmUrl} (HTTP ${wasmResponse.status})`);
      }
      const wasmBinary = await wasmResponse.arrayBuffer();

      const module = await wrapper.default({ wasmBinary });
      if (!module || typeof module.Decoder !== 'function') {
        throw new Error('Draco: wrapper did not produce a Decoder class');
      }
      return module;
    })().catch((error) => {

      decoderModulePromise = null;
      throw error;
    });
  }
  return decoderModulePromise;
}

async function importShippedWrapper(wrapperUrl) {
  const response = await fetch(wrapperUrl);
  if (!response.ok) {
    throw new Error(`Draco: could not fetch ${wrapperUrl} (HTTP ${response.status})`);
  }
  const source = await response.text();
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return await import( blobUrl);
  } finally {

    URL.revokeObjectURL(blobUrl);
  }
}

function parseContainer(buffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes.length > 0 && bytes[0] === 0x3c ) {
    throw new Error('Draco: file starts with "<" — an HTML/404 body, not a geometry asset');
  }

  const hasDracoMagic =
    bytes.length >= 5 &&
    bytes[0] === 0x44 &&
    bytes[1] === 0x52 &&
    bytes[2] === 0x41 &&
    bytes[3] === 0x43 &&
    bytes[4] === 0x4f;

  if (hasDracoMagic) {

    return { isStandard: true, info: null, payload: new Int8Array(buffer) };
  }

  if (bytes.length < 4) {
    throw new Error(`Draco: file too short (${bytes.length} bytes) for either container variant`);
  }
  const jsonLength = new DataView(buffer).getUint32(0, true);
  if (jsonLength === 0 || 4 + jsonLength >= bytes.length) {
    throw new Error(`Draco: implausible headerless JSON length ${jsonLength} for ${bytes.length}-byte file`);
  }
  const jsonText = new TextDecoder().decode(bytes.subarray(4, 4 + jsonLength));
  const info = JSON.parse(jsonText);
  const payload = new Int8Array(buffer, 4 + jsonLength);
  return { isStandard: false, info, payload };
}

function readInfoMetadata(module, decoder, geometry) {
  const querier = new module.MetadataQuerier();
  try {
    const metadata = decoder.GetMetadata(geometry);
    if (!querier.HasEntry(metadata, 'info')) return null;
    return JSON.parse(querier.GetStringEntry(metadata, 'info'));
  } finally {
    module.destroy(querier);
  }
}

function readAttribute(module, decoder, geometry, name, typeId, uniqueId, numPoints) {
  const TypedArrayCtor = TYPED_ARRAYS[typeId];
  if (TypedArrayCtor === undefined) {
    throw new Error(`attribute "${name}" has unknown type id ${typeId}`);
  }

  const attribute = decoder.GetAttributeByUniqueId(geometry, uniqueId);
  if (!attribute || attribute.ptr === 0) {
    throw new Error(`GetAttributeByUniqueId(${uniqueId}) returned nothing for "${name}"`);
  }

  const components = attribute.num_components();
  const count = numPoints * components;
  const byteLength = count * TypedArrayCtor.BYTES_PER_ELEMENT;
  const pointer = module._malloc(byteLength);
  if (!pointer) {
    throw new Error(`Draco: out of wasm heap allocating ${byteLength} bytes for "${name}"`);
  }
  try {
    const status = decoder.GetAttributeDataArrayForAllPoints(
      geometry,
      attribute,
      dataTypeNameFor(module, TypedArrayCtor),
      byteLength,
      pointer,
    );
    if (!status) {
      throw new Error(`GetAttributeDataArrayForAllPoints failed for "${name}"`);
    }

    const array = new TypedArrayCtor(module.HEAPU8.buffer, pointer, count).slice();
    return { name, array, components };
  } finally {
    module._free(pointer);
  }
}

function readIndices(module, decoder, geometry) {
  const numFaces = geometry.num_faces();
  if (numFaces === 0) return null;
  const indexCount = numFaces * 3;
  const byteLength = indexCount * Uint32Array.BYTES_PER_ELEMENT;
  const pointer = module._malloc(byteLength);
  if (!pointer) {
    throw new Error(`Draco: out of wasm heap allocating ${byteLength} index bytes`);
  }
  try {
    decoder.GetTrianglesUInt32Array(geometry, byteLength, pointer);
    return new Uint32Array(module.HEAPU8.buffer, pointer, indexCount).slice();
  } finally {
    module._free(pointer);
  }
}

function decodeContainer(module, buffer) {
  const { isStandard, info: headerInfo, payload } = parseContainer(buffer);

  const decoder = new module.Decoder();
  let geometry = null;
  try {

    const declaredType = !isStandard && headerInfo ? headerInfo.type : undefined;
    const payloadHasDracoHeader =
      payload.length >= 5 &&
      payload[0] === 0x44 && payload[1] === 0x52 && payload[2] === 0x41 && payload[3] === 0x43 && payload[4] === 0x4f;
    const geometryType = declaredType === 1
      ? module.POINT_CLOUD
      : declaredType === 0
        ? module.TRIANGULAR_MESH
        : decoder.GetEncodedGeometryType(payload);
    const isMesh = geometryType === module.TRIANGULAR_MESH;
    let status;

    if (isMesh) {
      geometry = new module.Mesh();
      status = decoder.DecodeArrayToMesh(payload, payload.byteLength, geometry);
    } else if (geometryType === module.POINT_CLOUD) {
      geometry = new module.PointCloud();
      status = decoder.DecodeArrayToPointCloud(payload, payload.byteLength, geometry);
    } else {
      throw new Error('Draco: unexpected encoded geometry type (neither mesh nor point cloud)');
    }
    if (!status.ok() || geometry.ptr === 0) {
      const hint = !isStandard && !payloadHasDracoHeader
        ? ' (variant B payload has no "DRACO" file header; the shipped decoder needs one)'
        : '';
      throw new Error(`Draco: decode failed — ${status.error_msg()}${hint}`);
    }

    const info = isStandard ? readInfoMetadata(module, decoder, geometry) : headerInfo;
    if (!info || !Array.isArray(info.attributes)) {
      throw new Error('Draco: missing "info" descriptor (no metadata entry and no JSON prefix)');
    }

    const numPoints = geometry.num_points();
    const attributes = {};
    const itemSizes = {};
    info.attributes.forEach(([name, typeId], uniqueId) => {
      const { array, components } = readAttribute(module, decoder, geometry, name, typeId, uniqueId, numPoints);
      attributes[name] = array;
      itemSizes[name] = components;
    });

    const indices = isMesh ? readIndices(module, decoder, geometry) : null;
    const numFaces = isMesh ? (indices ? indices.length / 3 : 0) : 0;

    return {
      info,
      attributes,
      itemSizes,
      numPoints,
      numFaces,
      indices,
      userData: info.userData ?? null,
      kind: isMesh ? 'mesh' : 'points',
    };
  } finally {
    if (geometry) module.destroy(geometry);
    module.destroy(decoder);
  }
}

function transferListFor(result) {
  const buffers = [];
  for (const array of Object.values(result.attributes)) buffers.push(array.buffer);
  if (result.indices) buffers.push(result.indices.buffer);
  return buffers;
}

self.onmessage = async (event) => {
  const { id, buffer, wrapperUrl, wasmUrl } = event.data;
  if (!(buffer instanceof ArrayBuffer)) {
    self.postMessage({ id, ok: false, error: 'Draco: message did not carry an ArrayBuffer' });
    return;
  }
  try {
    const module = await loadDecoderModule(wrapperUrl, wasmUrl);
    const result = decodeContainer(module, buffer);
    self.postMessage({ id, ok: true, result }, transferListFor(result));
  } catch (error) {

    self.postMessage({ id, ok: false, error: error && error.stack ? String(error.stack) : String(error) });
  }
};
