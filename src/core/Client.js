export function clampedDevicePixelRatio() {
  const dpr = window.devicePixelRatio || 1;

  return dpr <= 2 ? Math.min(dpr, 1.15) : Math.min(dpr, 1.5);
}

export class Client {
  constructor() {
    this.screen = { w: 1, h: 1, dpr: 1, aspectRatio: 1 };
    this.capabilities = {
      webgl2: false,
      touch: false,
      imageBitmap: false,
      opus: false,
      gamepad: false,
    };
    this.absolutePath = '/assets/';
    this.query = new URLSearchParams(window.location.search);
    this.lowMemoryDevice = false;
    this.refreshScreen();
  }

  refreshScreen() {
    this.screen.w = window.innerWidth;
    this.screen.h = window.innerHeight;
    this.screen.dpr = clampedDevicePixelRatio();
    this.screen.aspectRatio = this.screen.w / this.screen.h;
  }

  get resolution() {
    const { w, h, dpr } = this.screen;
    return { x: Math.max(1, Math.floor(w * dpr)), y: Math.max(1, Math.floor(h * dpr)) };
  }

  detectCapabilities(renderer) {
    this.capabilities.webgl2 = renderer.capabilities.isWebGL2 === true;
    this.capabilities.floatLinearFiltering = renderer.extensions.has('OES_texture_float_linear');
    this.capabilities.floatRenderTarget = renderer.extensions.has('EXT_color_buffer_float');
    this.capabilities.multiDraw = renderer.extensions.has('WEBGL_multi_draw');
    this.capabilities.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.capabilities.imageBitmap = typeof createImageBitmap === 'function';
    this.capabilities.opus = new Audio().canPlayType('audio/ogg; codecs="opus"') !== '';
    this.capabilities.gamepad = 'getGamepads' in navigator;
  }

  asset(relativePath) {
    return this.absolutePath + relativePath.replace(/^\/+/, '');
  }
}

export const client = new Client();
