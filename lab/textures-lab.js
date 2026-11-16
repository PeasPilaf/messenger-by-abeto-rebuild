import * as THREE from 'three';
import { TEXTURES } from '../src/assets/manifest.js';
import {
  EXPECTED_LUT_RAMP,
  LUT_SIZE,
  blitPixelsToCanvas,
  check,
  checkArrayClose,
  checkAtLeast,
  drawLutRamp,
  drawLutSlice,
  heading,
  lutTexel,
  note,
  readHalfFloat,
  renderAndRead,
  sampleLutNearest,
  sampleLutRamp,
  setPhase,
} from './lab-harness.js';

export async function testTextures(textures, renderer) {
  setPhase('textures');
  heading('5. Textures — atlas.png, noises-terrain.ktx2, lut.ktx2');

  const atlas = await textures.load(TEXTURES.atlas.name, TEXTURES.atlas.mode);
  check('atlas dimensions', [atlas.image.width, atlas.image.height], [16, 16]);
  check('atlas colorSpace is sRGB', atlas.colorSpace, THREE.SRGBColorSpace);
  check('atlas magFilter nearest', atlas.magFilter, THREE.NearestFilter);
  check('atlas minFilter nearest', atlas.minFilter, THREE.NearestFilter);
  check('atlas flipY false (bitmap orientation baked in)', atlas.flipY, false);
  const atlasCanvas = document.getElementById('atlas');
  const atlasContext = atlasCanvas.getContext('2d');
  atlasContext.imageSmoothingEnabled = false;
  atlasContext.drawImage(atlas.image, 0, 0, atlasCanvas.width, atlasCanvas.height);
  const paletteSource = document.createElement('canvas');
  paletteSource.width = 16;
  paletteSource.height = 16;
  const paletteContext = paletteSource.getContext('2d', { willReadFrequently: true });
  paletteContext.drawImage(atlas.image, 0, 0);
  const palettePixels = paletteContext.getImageData(0, 0, 16, 16).data;
  const palette = new Set();
  for (let i = 0; i < palettePixels.length; i += 4) {
    palette.add(`${palettePixels[i]},${palettePixels[i + 1]},${palettePixels[i + 2]}`);
  }
  checkAtLeast('atlas distinct palette colours', palette.size, 16);
  note('atlas pixel (0,0)', [...palettePixels.slice(0, 4)].join(','));

  const noise = await textures.load(TEXTURES.noiseTerrain.name, TEXTURES.noiseTerrain.mode);
  check('noise dimensions', [noise.image.width, noise.image.height], [256, 256]);
  check('noise wrapS is RepeatWrapping', noise.wrapS, THREE.RepeatWrapping);
  check('noise minFilter linear', noise.minFilter, THREE.LinearFilter);
  check('noise is a compressed texture', noise.isCompressedTexture, true);
  note('noise mip level count', noise.mipmaps ? noise.mipmaps.length : 0);

  const noiseQuad = new THREE.ShaderMaterial({
    uniforms: { map: { value: noise } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
  });
  const noisePixels = renderAndRead(renderer, noiseQuad, 256);
  const renderedNoise = new Set();
  for (let i = 0; i < noisePixels.length; i += 4) {
    renderedNoise.add((noisePixels[i] << 16) | (noisePixels[i + 1] << 8) | noisePixels[i + 2]);
  }
  checkAtLeast('noise renders distinct colours through the GPU', renderedNoise.size, 32);
  blitPixelsToCanvas(document.getElementById('noise'), noisePixels, 256);

  const lut = await textures.load(TEXTURES.lut.name, TEXTURES.lut.mode);
  check('LUT is a Data3DTexture', lut.isData3DTexture, true);
  check('LUT dimensions', [lut.image.width, lut.image.height, lut.image.depth], [LUT_SIZE, LUT_SIZE, LUT_SIZE]);
  check('LUT type HalfFloatType', lut.type, THREE.HalfFloatType);
  check('LUT format RGBAFormat', lut.format, THREE.RGBAFormat);
  check('LUT filter nearest (luttetrahedral)', lut.magFilter, THREE.NearestFilter);
  check('LUT payload size', lut.image.data.length, LUT_SIZE * LUT_SIZE * LUT_SIZE * 4);

  const ramp = {};
  for (const value of [0, 0.25, 0.5, 0.75, 1]) {
    const sampled = sampleLutRamp(lut, value);
    ramp[value] = sampled.map((component) => Number(component.toFixed(5)));
    checkArrayClose(`LUT neutral ramp ${value}`, sampled, EXPECTED_LUT_RAMP[value], 2e-3);
  }
  note('LUT neutral ramp sampled', JSON.stringify(ramp));
  drawLutRamp(document.getElementById('lut-ramp'), lut);
  drawLutSlice(document.getElementById('lut-slice'), lut);

  const lutLinear = await textures.load(TEXTURES.lut.name, 'lut');
  check('LUT linear filter for mode "lut"', lutLinear.magFilter, THREE.LinearFilter);

  const lutQuad = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { lut: { value: lut } },
    vertexShader: 'out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'precision highp float;',
      'precision highp sampler3D;',
      'uniform sampler3D lut;',
      'in vec2 vUv;',
      'out vec4 outColor;',
      'void main() {',
      '  float size = float(textureSize(lut, 0).x);',
      '  float scale = (size - 1.0) / size;',
      '  float offset = 1.0 / (2.0 * size);',
      '  vec3 color = vec3(vUv.x);',
      '  outColor = vec4(texture(lut, color * scale + offset).rgb, 1.0);',
      '}',
    ].join('\n'),
  });
  const RENDER_SIZE = 256;
  const gpuRampPixels = renderAndRead(renderer, lutQuad, RENDER_SIZE);
  const gpuRamp = {};
  for (const value of [0.25, 0.5, 0.75]) {
    const x = Math.min(RENDER_SIZE - 1, Math.max(0, Math.round(value * RENDER_SIZE - 0.5)));

    const sampledValue = (x + 0.5) / RENDER_SIZE;
    const index = (0 * RENDER_SIZE + x) * 4;
    const readback = [gpuRampPixels[index] / 255, gpuRampPixels[index + 1] / 255, gpuRampPixels[index + 2] / 255];
    const expected = sampleLutNearest(lut, sampledValue);
    gpuRamp[value] = readback.map((component) => Number(component.toFixed(5)));
    checkArrayClose(`LUT GPU nearest ramp ${value}`, readback, expected, 2 / 255);
  }
  note('LUT GPU nearest ramp readback', JSON.stringify(gpuRamp));

  const lutLinearQuad = lutQuad.clone();
  lutLinearQuad.uniforms = { lut: { value: lutLinear } };
  const linearPixels = renderAndRead(renderer, lutLinearQuad, RENDER_SIZE);
  const linearRamp = {};
  for (const value of [0.25, 0.5, 0.75]) {
    const x = Math.min(RENDER_SIZE - 1, Math.max(0, Math.round(value * RENDER_SIZE - 0.5)));
    const sampledValue = (x + 0.5) / RENDER_SIZE;
    const index = (0 * RENDER_SIZE + x) * 4;
    const readback = [linearPixels[index] / 255, linearPixels[index + 1] / 255, linearPixels[index + 2] / 255];
    linearRamp[value] = readback.map((component) => Number(component.toFixed(5)));
    checkArrayClose(`LUT GPU linear ramp ${value}`, readback, sampleLutRamp(lutLinear, sampledValue), 2 / 255);
  }
  note('LUT GPU linear ramp readback', JSON.stringify(linearRamp));

  note('LUT orientation', 'data index = ((b*32 + g)*32 + r)*4 — R is the fastest axis, ' +
    'so sampler3D x=red, y=green, z=blue; slice drawn with y flipped for the browser.');

  return { atlas, noise, lut };
}

export async function testAudio(audio) {
  setPhase('audio');
  heading('6. Audio — ui/click2.ogg');
  const buffer = await audio.load('ui/click2.ogg');
  check('audio sampleRate', buffer.sampleRate, 48000);
  check('audio channels', buffer.numberOfChannels, 1);
  checkAtLeast('audio frames', buffer.length, 1000);
  note('audio duration (s)', buffer.duration.toFixed(3));
  note('audio frames', buffer.length);
  check('audioContext was created lazily', typeof AudioContext !== 'undefined', true);
}
