import glyphFactory from './vendor/glyph.js';
import wasmUrl from './vendor/glyph.wasm?url';
import {
  unpackGeometry,
  computeGlyphWeights,
  computeBounds,
  computeBoxUV,
} from './GlyphGeometry.js';

const ALIGN = { left: 1, center: 2, right: 3 };

const TEXT_DEFAULTS = {
  sequence: true,
  size: 1,
  maxWidth: 15,
  horizontalStretch: 1,
  letterSpacing: 0,
  lineHeight: 1.2,
  skew: 0,
  color: [1, 1, 1],
  alpha: 1,
  align: 'left',
  justify: false,
  rightToLeft: false,
  bidirectional: false,
  vertical: false,
  grid: false,
  shadow: false,
  shadowX: 0.05,
  shadowY: 0.05,
  shadowColor: [0, 0, 0],
  shadowAlpha: 1,
  outline: false,
  outlineX: 0,
  outlineY: 0,
  outlineColor: [0, 0, 0],
  outlineAlpha: 1,
  underline: false,
  strikethrough: false,
};

const engineReady = (async () => {
  const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer();
  const Module = await glyphFactory({ wasmBinary });

  const engine = {
    Module,
    extractTextures: Module.cwrap('extractTextures', null, ['array', 'number']),
    buildText: Module.cwrap('buildText', null, [
      'array', 'number', 'number', 'string', 'boolean',
      'number', 'number', 'number', 'number', 'number', 'number',
      'number', 'number', 'number', 'number', 'number',
      'boolean', 'boolean', 'boolean', 'boolean', 'boolean', 'boolean',
      'number', 'number', 'number', 'number', 'number', 'number',
      'boolean', 'number', 'number', 'number', 'number', 'number', 'number',
      'boolean', 'boolean',
    ]),
    buildPicture: Module.cwrap('buildPicture', null, ['array', 'number', 'number', 'number']),
    cleanup: Module.cwrap('cleanup', null, []),
    getTotalMemory: Module.cwrap('getTotalMemory', null, []),
    getFreeMemory: Module.cwrap('getFreeMemory', null, []),
  };

  engine.reports = {
    textures: {
      ptrCurve: 0, ptrBand: 0, curveStorageSize: 0, bandStorageSize: 0,
      curveTextureWidth: 0, curveTextureHeight: 0,
      bandTextureWidth: 0, bandTextureHeight: 0,
      curveTextureType: 0, bandTextureType: 0, curveTexelSize: 0, bandTexelSize: 0,
    },
    geometry: {
      ptrVertex: 0, ptrTriangle: 0, indexType: 0, vertexSize: 0,
      triangleSize: 0, vertexCount: 0, triangleCount: 0,
    },
    metrics: { lines: 0, ascent: 0, descent: 0, lineGap: 0, capHeight: 0, exHeight: 0 },
  };

  engine.onTextureInfo = Module.addFunction((...args) => {
    const names = Object.keys(engine.reports.textures);
    names.forEach((name, i) => { engine.reports.textures[name] = args[i]; });
  }, 'viiiiiiiiiiii');

  engine.onGeometry = Module.addFunction((...args) => {
    const names = Object.keys(engine.reports.geometry);
    names.forEach((name, i) => { engine.reports.geometry[name] = args[i]; });
  }, 'viiiiiii');

  engine.onFontMetrics = Module.addFunction((...args) => {
    const names = Object.keys(engine.reports.metrics);
    names.forEach((name, i) => { engine.reports.metrics[name] = args[i]; });
  }, 'vifffff');

  return engine;
})();

const fontBytes = new Map();

function readTextures(Module, info) {
  const curveComponentSize = info.curveTextureType === 0 ? 2 : 4;
  const curveChannels = info.curveTexelSize / curveComponentSize;
  const bandChannels = info.bandTexelSize / 2;

  const CurveArray = info.curveTextureType === 0 ? Uint16Array : Float32Array;
  const curveLength = info.curveTextureWidth * info.curveTextureHeight * curveChannels;
  const bandLength = info.bandTextureWidth * info.bandTextureHeight * bandChannels;

  return {
    curve: {
      data: new CurveArray(Module.HEAPU8.buffer, info.ptrCurve, curveLength).slice(),
      width: info.curveTextureWidth,
      height: info.curveTextureHeight,
      type: info.curveTextureType,
    },
    band: {
      data: new Uint16Array(Module.HEAPU8.buffer, info.ptrBand, bandLength).slice(),
      width: info.bandTextureWidth,
      height: info.bandTextureHeight,
      type: info.bandTextureType,
    },
  };
}

function readGeometry(engine) {
  const { Module, reports } = engine;
  const attributes = unpackGeometry(Module.HEAPU8.buffer, reports.geometry);
  const bounds = computeBounds(attributes.position, reports.geometry.vertexCount);
  attributes.uv = computeBoxUV(attributes.position, reports.geometry.vertexCount, bounds);
  return { attributes, bounds };
}

function toTransferables(payload) {
  const buffers = [];
  const visit = (value) => {
    if (!value) return;
    if (ArrayBuffer.isView(value)) { buffers.push(value.buffer); return; }
    if (typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(payload);
  return buffers;
}

function extractTexturePayload(engine, bytes) {
  engine.extractTextures(bytes, engine.onTextureInfo);
  const textures = readTextures(engine.Module, engine.reports.textures);
  engine.cleanup();
  return textures;
}

function buildTextGeometry(engine, text, options) {
  const fontId = options.fontId;
  const bytes = fontBytes.get(fontId);
  if (!bytes) throw new Error(`glyph: font "${fontId}" was not loaded`);

  const o = { ...TEXT_DEFAULTS, ...options };
  const color = o.color;
  const shadowColor = o.shadowColor;
  const outlineColor = o.outlineColor;

  let body = text || '';
  for (const match of body.matchAll(/{#[\s\S]*?}/g)) body = body.replace(match[0], match[0].toLowerCase());

  const size = o.size;
  const maxWidth = Math.max(size, o.maxWidth);

  engine.buildText(
    bytes,
    engine.onFontMetrics,
    engine.onGeometry,
    body,
    o.sequence,
    size,
    maxWidth,
    o.horizontalStretch,
    o.letterSpacing,
    o.lineHeight,
    o.skew,
    color[0], color[1], color[2], o.alpha,
    ALIGN[o.align] ?? ALIGN.left,
    o.justify,
    o.rightToLeft,
    o.bidirectional,
    o.vertical,
    o.grid,
    o.shadow,
    o.shadowX,
    o.shadowY,
    shadowColor[0], shadowColor[1], shadowColor[2], o.shadowAlpha,
    o.outline,
    o.outlineX,
    o.outlineY,
    outlineColor[0], outlineColor[1], outlineColor[2], o.outlineAlpha,
    o.underline,
    o.strikethrough,
  );

  const vertexCount = engine.reports.geometry.vertexCount;
  const { attributes, bounds } = readGeometry(engine);

  const weights = computeGlyphWeights({ ...attributes, vertexCount }, { rightToLeft: o.rightToLeft });
  const fontMetrics = {
    size,
    lineHeight: o.lineHeight,
    ...engine.reports.metrics,
  };
  engine.cleanup();

  return {
    geometry: { ...attributes, ...weights, bounds, vertexCount, fontMetrics },
    fontMetrics,
  };
}

function buildPictureGeometry(engine, bytes, index, size) {
  engine.buildPicture(bytes, engine.onGeometry, index, size);
  const { attributes, bounds } = readGeometry(engine);
  engine.cleanup();
  return { geometry: { ...attributes, bounds, vertexCount: engine.reports.geometry.vertexCount } };
}

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    const engine = await engineReady;
    let result;

    if (type === 'loadFont') {
      fontBytes.set(event.data.fontId, new Uint8Array(event.data.bytes));
      result = { textures: extractTexturePayload(engine, fontBytes.get(event.data.fontId)) };
    } else if (type === 'loadPicture') {
      const bytes = new Uint8Array(event.data.bytes);
      const textures = extractTexturePayload(engine, bytes);
      const { geometry } = buildPictureGeometry(engine, bytes, event.data.index ?? 0, event.data.size ?? 1);
      result = { textures, geometry };
    } else if (type === 'buildText') {
      result = buildTextGeometry(engine, event.data.text, {
        ...event.data.options,
        fontId: event.data.fontId,
      });
    } else {
      throw new Error(`glyph: unknown message type "${type}"`);
    }

    self.postMessage({ id, ok: true, ...result }, toTransferables(result));
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.stack || error) });
  }
};
