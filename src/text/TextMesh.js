import { Mesh, Vector2 } from 'three';
import { SlugMaterial } from './SlugMaterial.js';

const TAG_REGEX = /({#[\s\S]*?})/g;

export function stripTags(text = '') {
  return text.replace(TAG_REGEX, '');
}

export class TextMesh extends Mesh {

  constructor({ glyphs, font, text = '', textOptions = {}, anchor = 'center', material = null } = {}) {

    super();
    this.name = `Text (${font})`;
    this.glyphs = glyphs;
    this.fontName = font;
    this.textOptions = { ...textOptions, font };
    this.anchor = anchor;
    this.material = material;
    this.geometry.dispose();

    this.width = 0;
    this.height = 0;
    this.bounds = null;
    this.metrics = null;
    this.typewriterProgress = 1;

    this._buildPromise = this.setText(text);
  }

  get ready() {
    return this._buildPromise;
  }

  async setText(text = '') {
    const { geometry, font } = await this.glyphs.buildText(text, this.textOptions);
    this.text = text;
    this.font = font;
    this.metrics = font.metrics;
    this.bounds = geometry._bounds;

    translateToAnchor(geometry, this.bounds, this.anchor);
    this._applyBounds();

    if (!this.material) this.material = new SlugMaterial({ font });

    const previous = this.geometry;
    this.geometry = geometry;
    if (previous && previous.dispose) previous.dispose();
    return this;
  }

  setResolution(width, height) {
    if (this.material && this.material.setResolution) this.material.setResolution(width, height);
    return this;
  }

  typewriter({ charsPerSecond = 35, restart = true } = {}) {
    const length = Math.max(1, stripTags(this.text).length);
    const duration = (length / charsPerSecond) * 1000;

    if (this._cancelTypewriter) this._cancelTypewriter();
    if (restart) this.material.setShow(0);
    this.material.setHide(0);

    const start = performance.now();
    const from = this.material.uniforms.uShow.value;

    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        this.typewriterProgress = from + (1 - from) * t;
        this.material.setShow(this.typewriterProgress);
        if (t < 1 && !this._cancelled) {
          this._frame = requestAnimationFrame(step);
        } else {
          this._frame = 0;
          this._cancelTypewriter = null;
          resolve();
        }
      };
      this._cancelled = false;
      this._cancelTypewriter = () => {
        this._cancelled = true;
        if (this._frame) cancelAnimationFrame(this._frame);
        this._frame = 0;
        this._cancelTypewriter = null;
        resolve();
      };
      this._frame = requestAnimationFrame(step);
    });
  }

  dispose() {
    if (this._cancelTypewriter) this._cancelTypewriter();
    this.geometry.dispose();
    if (this.material) this.material.dispose();
  }

  _applyBounds() {
    this.width = this.bounds.width;
    this.height = this.bounds.height;
    this.size = new Vector2(this.width, this.height);
  }
}

function translateToAnchor(geometry, bounds, anchor) {
  const { min, max, width, height } = bounds;
  let x = 0;
  let y = 0;

  switch (anchor) {
    case 'left': x = min[0]; y = 0; break;
    case 'right': x = max[0]; y = 0; break;
    case 'top': x = 0; y = max[1]; break;
    case 'bottom': x = 0; y = min[1]; break;
    case 'top-left': x = min[0]; y = max[1]; break;
    case 'bottom-left': x = min[0]; y = min[1]; break;
    case 'center':
    default:
      x = min[0] + width / 2;
      y = min[1] + height / 2;
      break;
  }

  geometry.translate(-x, -y, 0);
  return { x, y };
}
