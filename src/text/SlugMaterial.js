import { ShaderMaterial, Vector2, Color } from 'three';
import vertexShader from './slug.vert.glsl?raw';
import fragmentShader from './slug.frag.glsl?raw';

export class SlugMaterial extends ShaderMaterial {

  constructor({ font, color = '#ffffff', overwriteColor = false, reveal, opacity = 1, small = false } = {}) {
    if (!font || !font.curveTexture || !font.bandTexture) {
      throw new Error('SlugMaterial: a font handle with curveTexture/bandTexture is required');
    }

    super({
      name: font.picture ? 'slug-picture' : 'slug-text',
      defines: small ? { SLUG_WEIGHT: 1 } : {},
      uniforms: {
        tCurve: { value: font.curveTexture },
        tBand: { value: font.bandTexture },
        uResolution: { value: new Vector2(1, 1) },
        uColor: { value: new Color(color) },
        uOverwriteColor: { value: overwriteColor },
        uShow: { value: 1 },
        uHide: { value: 0 },
        uReveal: { value: reveal ?? !font.picture },
        uRevealMargin: { value: 0.1 },
        uOpacity: { value: opacity },
      },
      vertexShader,
      fragmentShader,

      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
  }

  setResolution(width, height) {
    this.uniforms.uResolution.value.set(width, height);
    return this;
  }

  setShow(value) {
    this.uniforms.uShow.value = value;
    return this;
  }

  setHide(value) {
    this.uniforms.uHide.value = value;
    return this;
  }

  setOpacity(value) {
    this.uniforms.uOpacity.value = value;
    return this;
  }

  setOverwriteColor(color) {
    this.uniforms.uColor.value.set(color);
    this.uniforms.uOverwriteColor.value = true;
    return this;
  }

  dispose() {

    super.dispose();
  }
}
