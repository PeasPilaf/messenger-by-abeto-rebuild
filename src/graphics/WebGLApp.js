import * as THREE from 'three';

import { client } from '../core/Client.js';
import { events } from '../core/Events.js';
import { RenderPipeline } from './RenderPipeline.js';

export class WebGLApp {
  constructor() {
    this.canvasHost = document.createElement('div');
    this.canvasHost.id = 'canvas-host';
    document.body.appendChild(this.canvasHost);

    this.renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: false,
      stencil: false,
      depth: false,
      powerPreference: 'high-performance',
    });
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = true;
    this.canvasHost.appendChild(this.renderer.domElement);

    client.detectCapabilities(this.renderer);

    this.resizeCallbacks = [];

    this.dprMultiplier = 1;
    window.addEventListener('resize', () => this.resize());
  }

  get resolution() {
    return client.resolution;
  }

  get width() {
    return client.screen.w;
  }

  get height() {
    return client.screen.h;
  }

  onResize(callback) {
    this.resizeCallbacks.push(callback);
    return callback;
  }

  setDprMultiplier(multiplier) {
    this.dprMultiplier = Math.min(1, Math.max(0.5, multiplier));
    this.resize();
  }

  resize() {
    client.refreshScreen();
    client.screen.dpr *= this.dprMultiplier;
    const { x, y } = client.resolution;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(x, y, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    for (const callback of this.resizeCallbacks) callback(x, y);
    events.emit('resize', x, y);
  }

  createPipeline(camera) {
    this.pipeline = new RenderPipeline(this.renderer, camera);
    this.resize();
    this.pipeline.setSize(this.resolution.x, this.resolution.y);
    this.onResize((x, y) => this.pipeline.setSize(x, y));
    return this.pipeline;
  }

  render(scene, camera, waterPass) {
    this.pipeline.render(scene, camera, waterPass);
  }
}
