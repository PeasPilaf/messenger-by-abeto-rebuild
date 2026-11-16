import {
  EquirectangularReflectionMapping,
  EquirectangularRefractionMapping,
  ImageBitmapLoader,
  LinearFilter,
  MirroredRepeatWrapping,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader as ThreeTextureLoader,
} from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import {
  BASIS_TRANSCODER_ROOT,
  FALLBACK_TEXTURE_KTX2,
  FALLBACK_TEXTURE_PNG,
  IMAGE_ROOT,
} from './manifest.js';

const BITMAP_EXTENSIONS = ['png', 'jpg', 'jpeg', 'avif'];
const UV_CHECKER_TEXTURE = 'uv/uvchecker-srgb.png';

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export class TextureLoader {

  constructor(options = {}) {

    const isRenderer = options !== null && typeof options === 'object' &&
      (options.isWebGLRenderer === true || options.isWebGPURenderer === true);
    const { renderer = null, imageRoot = IMAGE_ROOT } = isRenderer ? { renderer: options } : options;
    this.imageRoot = imageRoot;
    this.renderer = renderer;

    this._cache = new Map();
    this._ktx2Loader = null;
    this._imageBitmapLoader = null;
    this._basicLoader = null;
  }

  setRenderer(renderer) {
    this.renderer = renderer;
    if (this._ktx2Loader) this._ktx2Loader.detectSupport(renderer);
    return this;
  }

  load(name = UV_CHECKER_TEXTURE, mode = '') {
    const key = `${name}_<>_${mode}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const promise = this._loadWithFallback(name, mode).catch((error) => {
      this._cache.delete(key);
      throw error;
    });
    this._cache.set(key, promise);
    return promise;
  }

  async _loadWithFallback(name, mode) {
    try {
      return await this._load(name, mode);
    } catch (error) {
      const modeString = mode.toLowerCase();

      if (modeString.includes('lut') || modeString.includes('3d')) throw error;
      console.warn('Texture load:', error, name);
      const fallback = extensionOf(name) === 'ktx2' ? FALLBACK_TEXTURE_KTX2 : FALLBACK_TEXTURE_PNG;
      return this._load(fallback, mode);
    }
  }

  async _load(name, mode) {
    const extension = extensionOf(name);
    let texture;
    if (extension === 'ktx2') {
      texture = await this._ktx2().loadAsync(name);
    } else if (BITMAP_EXTENSIONS.includes(extension)) {
      texture = await this._loadBitmap(name, mode);
    } else {

      throw new Error(`TextureLoader: no loader for ".${extension}" (${name})`);
    }
    return this._applyMode(texture, name, mode);
  }

  async _loadBitmap(name, mode) {
    const flip = !mode.toLowerCase().includes('noflip');
    if (typeof createImageBitmap === 'function') {
      const loader = this._imageBitmap();

      loader.setOptions({ imageOrientation: flip ? 'flipY' : 'none', premultiplyAlpha: 'none' });
      const bitmap = await loader.loadAsync(name);
      const texture = new Texture(bitmap);
      texture.flipY = false;
      texture.needsUpdate = true;
      return texture;
    }

    const texture = await this._basic().loadAsync(name);
    texture.flipY = flip;
    return texture;
  }

  _applyMode(texture, name, mode) {
    const modeString = mode.toLowerCase();

    if (modeString.includes('srgb') || name === UV_CHECKER_TEXTURE) {
      texture.colorSpace = SRGBColorSpace;
    }

    if (modeString.includes('repeat')) {
      if (modeString.includes('mirror')) {
        texture.wrapS = MirroredRepeatWrapping;
        texture.wrapT = MirroredRepeatWrapping;
      } else {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
      }
    }

    if (modeString.includes('lut')) {

      const filter = modeString.includes('luttetrahedral') ? NearestFilter : LinearFilter;
      texture.magFilter = filter;
      texture.minFilter = filter;
    } else if (modeString.includes('data') || modeString.includes('linearfilter')) {
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearFilter;
    } else if (modeString.includes('nearest')) {
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
    }

    if (modeString.includes('nearest') || modeString.includes('data') || modeString.includes('nomipmaps')) {
      texture.generateMipmaps = false;
    }

    if (modeString.includes('pmrem')) {
      texture.mapping = modeString.includes('refraction')
        ? EquirectangularRefractionMapping
        : EquirectangularReflectionMapping;
    }

    texture.needsUpdate = true;
    return texture;
  }

  get ktx2Loader() {
    return this._ktx2();
  }

  _ktx2() {
    if (this._ktx2Loader) return this._ktx2Loader;
    this._ktx2Loader = new KTX2Loader()
      .setTranscoderPath(BASIS_TRANSCODER_ROOT)
      .setPath(this.imageRoot)
      .setWorkerLimit(1);
    if (this.renderer) this._ktx2Loader.detectSupport(this.renderer);
    return this._ktx2Loader;
  }

  _imageBitmap() {
    if (this._imageBitmapLoader) return this._imageBitmapLoader;
    this._imageBitmapLoader = new ImageBitmapLoader().setPath(this.imageRoot);
    return this._imageBitmapLoader;
  }

  _basic() {
    if (this._basicLoader) return this._basicLoader;
    this._basicLoader = new ThreeTextureLoader().setPath(this.imageRoot);
    return this._basicLoader;
  }

  dispose() {
    if (this._ktx2Loader) this._ktx2Loader.dispose();
    this._ktx2Loader = null;
    this._cache.clear();
  }
}
