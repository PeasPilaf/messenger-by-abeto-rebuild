import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const IMAGE_ROOT = '/assets/images/';
const FONT_ROOT = '/assets/fonts/';

export function createKtx2Loader(renderer) {
  return new KTX2Loader().setTranscoderPath('/assets/libs/basis/').detectSupport(renderer);
}

export function loadKtx2(ktx2Loader, name, { srgb = false, repeat = true, mipmaps = false } = {}) {

  const url = ktx2Loader.path ? name : IMAGE_ROOT + name;
  return new Promise((resolve, reject) => {
    ktx2Loader.load(url, (texture) => {
      texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      texture.generateMipmaps = mipmaps;
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      resolve(texture);
    }, undefined, reject);
  });
}

export function loadPalette() {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(IMAGE_ROOT + 'atlas.png', (texture) => {
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve(texture);
    }, undefined, reject);
  });
}

export async function loadLut() {
  const response = await fetch('/lut32.bin');
  if (!response.ok) throw new Error('lut32.bin missing (run tools/extract-lut.mjs)');
  const bytes = new Uint8Array(await response.arrayBuffer());

  const size = 32;
  if (bytes.length !== size * size * size * 4) {
    throw new Error(`LUT size mismatch: ${bytes.length} bytes`);
  }

  const data = new Uint8Array(bytes.length);
  data.set(bytes);

  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export async function loadFaceTextures(ktx2Loader) {
  const [eyeNpc, eyeCharacter, mouth] = await Promise.all([
    loadKtx2(ktx2Loader, 'eye-highq.ktx2', { repeat: true }),
    loadKtx2(ktx2Loader, 'mainchar-eye-highq.ktx2', { repeat: true }),
    loadKtx2(ktx2Loader, 'mouth-highq.ktx2', { repeat: true }),
  ]);
  return { eyeNpc, eyeCharacter, mouth };
}

export async function loadSceneTextures(ktx2Loader) {
  const [clouds, waterNoise] = await Promise.all([
    loadKtx2(ktx2Loader, 'clouds_noise_512.ktx2', { srgb: true, repeat: true }),
    loadKtx2(ktx2Loader, 'water-noises-highq.ktx2', { repeat: true }),
  ]);
  return { clouds, waterNoise };
}

export async function loadRendererTextures(renderer) {
  const ktx2Loader = createKtx2Loader(renderer);
  const [palette, noise, noiseTerrain, faces, lut, sceneTextures] = await Promise.all([
    loadPalette(),
    loadKtx2(ktx2Loader, 'noise-simplex-layered-pixellated-highq.ktx2', { repeat: true }),
    loadKtx2(ktx2Loader, 'noises-terrain.ktx2', { repeat: true }),
    loadFaceTextures(ktx2Loader),
    loadLut(),
    loadSceneTextures(ktx2Loader),
  ]);
  return {
    palette,
    noise,
    noiseTerrain,
    eye: faces.eyeNpc,
    eyeCharacter: faces.eyeCharacter,
    mouth: faces.mouth,
    clouds: sceneTextures.clouds,
    waterNoise: sceneTextures.waterNoise,
    lut,
    ktx2Loader,
    fontRoot: FONT_ROOT,
  };
}
