import {
  DataTexture, RGBAFormat, HalfFloatType, FloatType,
  RGIntegerFormat, UnsignedShortType,
  BufferGeometry, BufferAttribute, Box3, Sphere, Vector3, Color,
} from 'three';
import { createWorkerClient } from './WorkerClient.js';

const FONT_MAGIC = 'guls';

export class GlyphLoader {

  constructor({ fontsPath, iconsPath, base = import.meta.env.BASE_URL } = {}) {
    const root = base.endsWith('/') ? base : `${base}/`;
    this.fontsPath = fontsPath ?? `${root}assets/fonts/`;
    this.iconsPath = iconsPath ?? `${root}assets/images/`;

    this._worker = createWorkerClient(
      new Worker(new URL('./glyph.worker.js', import.meta.url), { type: 'module', name: 'glyph' }),
    );
    this._fonts = new Map();
    this._pictures = new Map();
  }

  _fontName(name) {
    return String(name).replace(/\//g, '').replace(/\.font$/, '');
  }

  _iconName(name) {
    return String(name).replace(/\.icon$/, '');
  }

  loadFont(name) {
    const id = this._fontName(name);
    if (!this._fonts.has(id)) {
      this._fonts.set(id, this._loadFont(id).catch((error) => {
        this._fonts.delete(id);
        throw error;
      }));
    }
    return this._fonts.get(id);
  }

  async _loadFont(id) {
    const bytes = await fetchBytes(`${this.fontsPath}${id}.font`);
    assertGlyphAsset(bytes, `${this.fontsPath}${id}.font`);
    const { textures } = await this._worker.request({
      type: 'loadFont', fontId: id, bytes: bytes.buffer,
    });
    return {
      name: id,
      curveTexture: makeCurveTexture(textures.curve),
      bandTexture: makeBandTexture(textures.band),
      metrics: null,
      lastBounds: null,
    };
  }

  async buildText(text, opts = {}) {
    const font = typeof opts.font === 'object' && opts.font
      ? opts.font
      : await this.loadFont(opts.font ?? 'heading');

    const options = { ...opts, fontId: font.name };
    delete options.font;
    if (opts.color) options.color = toLinearRGB(opts.color);
    if (opts.shadowColor) options.shadowColor = toLinearRGB(opts.shadowColor);
    if (opts.outlineColor) options.outlineColor = toLinearRGB(opts.outlineColor);

    const { geometry, fontMetrics } = await this._worker.request({
      type: 'buildText', fontId: font.name, text, options,
    });

    font.metrics = fontMetrics;
    font.lastBounds = geometry.bounds;
    return { geometry: toBufferGeometry(geometry), font };
  }

  buildPicture(name, opts = {}) {
    const id = this._iconName(name);
    const key = `${id}#${opts.index ?? 0}@${opts.size ?? 1}`;
    if (!this._pictures.has(key)) {
      this._pictures.set(key, this._buildPicture(id, opts).catch((error) => {
        this._pictures.delete(key);
        throw error;
      }));
    }
    return this._pictures.get(key);
  }

  async _buildPicture(id, { index = 0, size = 1 } = {}) {
    const bytes = await fetchBytes(`${this.iconsPath}${id}.icon`);
    assertGlyphAsset(bytes, `${this.iconsPath}${id}.icon`);
    const { textures, geometry } = await this._worker.request({
      type: 'loadPicture', iconId: id, bytes: bytes.buffer, index, size,
    });
    return {
      geometry: toBufferGeometry(geometry),
      font: {
        name: id,
        curveTexture: makeCurveTexture(textures.curve),
        bandTexture: makeBandTexture(textures.band),
        metrics: null,
        lastBounds: geometry.bounds,
        picture: true,
      },
    };
  }

  dispose() {
    this._worker.dispose();
    for (const promise of this._fonts.values()) {
      promise.then((font) => { font.curveTexture.dispose(); font.bandTexture.dispose(); }).catch(() => {});
    }
    for (const promise of this._pictures.values()) {
      promise.then(({ geometry, font }) => {
        geometry.dispose(); font.curveTexture.dispose(); font.bandTexture.dispose();
      }).catch(() => {});
    }
    this._fonts.clear();
    this._pictures.clear();
  }
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`glyph: ${url} -> HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function assertGlyphAsset(bytes, url) {
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (bytes.length < 16 || magic !== FONT_MAGIC) {
    throw new Error(
      `glyph: ${url} is not a glyph container (magic "${magic}", ${bytes.length} bytes) — ` +
      'the asset is missing or is an HTML error page',
    );
  }
}

function toLinearRGB(color) {
  if (Array.isArray(color)) return [color[0], color[1], color[2]];
  if (color && color.isColor) return [color.r, color.g, color.b];
  const parsed = new Color(color);
  return [parsed.r, parsed.g, parsed.b];
}

function makeCurveTexture({ data, width, height, type }) {
  const texture = new DataTexture(
    data, width, height, RGBAFormat, type === 0 ? HalfFloatType : FloatType,
  );
  texture.name = 'slug-curve';
  texture.needsUpdate = true;
  return texture;
}

function makeBandTexture({ data, width, height }) {
  const texture = new DataTexture(data, width, height, RGIntegerFormat, UnsignedShortType);
  texture.name = 'slug-band';
  texture.needsUpdate = true;
  return texture;
}

function toBufferGeometry(payload) {
  const geometry = new BufferGeometry();
  geometry.setIndex(new BufferAttribute(payload.index, 1));
  for (const name of ['position', 'posnorm', 'texcoord', 'jacobian', 'banding', 'color', 'uv',
    'centr', 'textWeights', 'lineWeights']) {
    if (!payload[name]) continue;
    geometry.setAttribute(name, new BufferAttribute(payload[name], itemSize(name)));
  }

  const { min, max, center, radius } = payload.bounds;
  geometry.boundingBox = new Box3(
    new Vector3().fromArray(min),
    new Vector3().fromArray(max),
  );
  geometry.boundingSphere = new Sphere(new Vector3().fromArray(center), radius);

  if (payload.fontMetrics) geometry._fontMetrics = payload.fontMetrics;
  if (payload.bounds) geometry._bounds = payload.bounds;
  return geometry;
}

function itemSize(name) {
  switch (name) {
    case 'position':
    case 'centr':
    case 'lineWeights': return 3;
    case 'posnorm':
    case 'uv':
    case 'textWeights': return 2;
    default: return 4;
  }
}
