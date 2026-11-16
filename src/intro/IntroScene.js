import * as THREE from 'three';

import { events as bus } from '../core/Events.js';
import { createTween, createDelayedCall, updateTweens, wait } from '../core/Tween.js';
import { client } from '../core/Client.js';
import { GeometryLoader } from '../assets/GeometryLoader.js';
import { loadKtx2 } from '../graphics/Textures.js';
import { INTRO_OUTLINE } from '../graphics/constants.js';

import { IntroCamera } from './IntroCamera.js';
import { IntroPlanet } from './IntroPlanet.js';
import { IntroSky } from './IntroSky.js';
import { Atmosphere } from './Atmosphere.js';
import { TitleLetters } from './TitleLetters.js';
import { BeginButton } from './BeginButton.js';
import { IntroParticles } from './IntroParticles.js';
import { Galaxies } from './Galaxies.js';
import { IntroBirds } from './IntroBirds.js';

export const INTRO_TIMELINE = {
  wipe: { delay: 0, duration: 2, ease: 'inOut1' },
  planet: { delay: 0.2, riseDuration: 2.25, scaleDuration: 6.3, rotationDuration: 2, spinDuration: 5.65 },
  particles: { delay: 0.5, fadeDuration: 2, rotateDelay: 0.5, rotateDuration: 4 },
  atmosphere: { delay: 1.45, duration: 2.5, ease: 'sine.out' },
  galaxies: { delay: 2.2, duration: 3 },
  title: { delay: 2.35, stagger: 0.075 },
  birds: { delay: 2.7, duration: 2 },
  button: { delay: 3.3, duration: 3.25 },
  interactionsAt: 3,
  audio: [
    [0.16, 'whoosh'],
    [1.8, 'whoosh'],
    [2.5, 'intro-letters'],
    [3.45, 'button-turn'],
  ],
};

export class IntroScene {

  constructor({ app, textures, shared, glyphLoader, events = bus }) {
    if (!app || !textures || !shared || !glyphLoader) {
      throw new Error('IntroScene: app, textures, shared and glyphLoader are required');
    }
    this.app = app;
    this.textures = textures;
    this.shared = shared;
    this.glyphLoader = glyphLoader;
    this.events = events;

    this.geometryLoader = app.geometryLoader ?? new GeometryLoader();

    this.scene = new THREE.Scene();
    this.scene.name = 'intro-scene';
    this.camera = new IntroCamera({ width: client.screen.w, height: client.screen.h });
    this.time = 0;
    this.loaded = false;
    this.interactionsEnabled = false;
    this.listeners = new Map();

    this.wipe = { value: 1 };
    this.outlineTuning = INTRO_OUTLINE;

    this.planetGroup = new THREE.Group();
    this.planetGroup.name = 'Planet Group';
    this.scene.add(this.planetGroup);

    this._pointer = new THREE.Vector2();
    this._ready = this._load();
  }

  get ready() {
    return this._ready;
  }

  load() {
    return this._ready.then(() => this);
  }

  async _load() {

    const [cloudNoise64, galaxy, particleSprites] = await Promise.all([
      loadKtx2(this.textures.ktx2Loader, 'clouds_noise_64.ktx2', { srgb: true, repeat: true }),
      loadKtx2(this.textures.ktx2Loader, 'galaxy.ktx2', { srgb: true, repeat: true }),
      loadKtx2(this.textures.ktx2Loader, 'particle_sprites.ktx2', { srgb: true, repeat: true }),
    ]);
    this.textures = { ...this.textures, cloudNoise64, galaxy, particleSprites };
    const introTextures = { ...this.textures };

    this._setupLights();

    this.planet = new IntroPlanet(this.planetGroup, {
      geometryLoader: this.geometryLoader,
      shared: this.shared,
      textures: introTextures,
    });
    this.sky = new IntroSky(this.scene);
    this.atmosphere = new Atmosphere(this.scene, cloudNoise64);
    this.title = new TitleLetters({
      scene: this.scene,
      camera: this.camera,
      app: this.app,
      geometryLoader: this.geometryLoader,
      shared: this.shared,
      textures: introTextures,
      events: this.events,
    });
    this.button = new BeginButton({
      scene: this.scene,
      camera: this.camera,
      app: this.app,
      geometryLoader: this.geometryLoader,
      glyphLoader: this.glyphLoader,
      shared: this.shared,
      textures: introTextures,
      events: this.events,
    });
    this.particles = new IntroParticles({
      scene: this.scene,
      geometryLoader: this.geometryLoader,
      shared: this.shared,
      sprites: particleSprites,
      resolution: this.app.resolution,
    });
    this.galaxies = new Galaxies({
      scene: this.scene,
      geometryLoader: this.geometryLoader,
      shared: this.shared,
      textures: introTextures,
    });
    this.birds = new IntroBirds({
      scene: this.scene,
      geometryLoader: this.geometryLoader,
      shared: this.shared,
      textures: introTextures,

      flocks: [{ count: 15, groups: 5, curve: 'birds/curve-1', bird: 'birds/1' }],
    });

    await Promise.all([
      this.planet.load(),
      this.sky.ready,
      this.title.ready,
      this.button.ready,
      this.particles.ready,
      this.galaxies.ready,
      this.birds.ready,
    ]);

    this._bindEvents();
    this._resize();
    this.loaded = true;
    return this;
  }

  _setupLights() {

    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.position.set(100, 100, 0);
    this.light._originalPosition = this.light.position.clone();
    this.light.castShadow = true;
    this.light.shadow.mapSize.width = 1024;
    this.light.shadow.mapSize.height = 1024;
    this.light.shadow.camera.near = 50;
    this.light.shadow.camera.far = 180;
    this.light.shadow.bias = 0.002;
    this.light.shadow.normalBias = 0.3;
    const shadowSize = 100;
    this.light.shadow.camera.left = -shadowSize;
    this.light.shadow.camera.right = shadowSize;
    this.light.shadow.camera.top = shadowSize;
    this.light.shadow.camera.bottom = -shadowSize;
    this.light.shadow.camera.zoom = 3.25;
    this.light.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.light);
    this.scene.add(this.light.target);
  }

  _bindEvents() {
    this._onResize = (width, height) => this._resize(width, height);
    this.app.onResize(this._onResize);

    this._onPointerMove = (event) => {
      const rect = this.app.renderer.domElement.getBoundingClientRect();
      this._pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.camera.pointer.copy(this._pointer);
    };
    this.app.renderer.domElement.addEventListener('pointermove', this._onPointerMove);

    this.button.onBegin(() => {
      this.disableInteractions();
      for (const handler of this.listeners.get('begin') ?? []) handler();
    });
  }

  _resize(width = client.screen.w, height = client.screen.h) {
    const mobileLayout = width < height && width < 700;
    this.mobileLayout = mobileLayout;
    this.camera.setViewportSize(width, height);
    this.title.resize(mobileLayout);
    this.button.resize(mobileLayout);
    this.button.setResolution(this.app.resolution.x, this.app.resolution.y);
    this.particles.setResolution(this.app.resolution.x, this.app.resolution.y);
  }

  applyOutlineTuning(pipeline) {
    const uniforms = pipeline.compositeMaterial.uniforms;
    const tuning = this.outlineTuning;
    uniforms.uOutlineFade.value.set(...tuning.fade);
    uniforms.uOutlineThickness.value = tuning.thickness;
    uniforms.uOutlineColor.value.set(tuning.color);
    uniforms.uInfoRange.value.set(...tuning.infoRange);
    uniforms.uInfoMinScale.value = tuning.infoMinScale;
    uniforms.uDepthRange.value.set(...tuning.depthRange);
    uniforms.uNormalRange.value.set(...tuning.normalRange);
    uniforms.uOutlineScale.value = tuning.scale;
    uniforms.uSmoothMargin.value = tuning.smoothMargin;
    pipeline.setCamera(this.camera);
    return this;
  }

  update(time, dt) {
    if (!this.loaded) return;
    this.time = time;

    this.shared.uTime.value = time;

    updateTweens(dt);

    this.camera.update(dt, dt * 60);

    this.light.position.copy(this.light._originalPosition);
    this.light.position.y += this.planetGroup.position.y;
    this.light.target.position.y = this.planetGroup.position.y;
    this.light.target.updateMatrixWorld();

    this.title.update(dt, dt * 60);
    this.button.update();
    this.birds.setLightPosition(this.light.position);
    this.birds.update(time);
  }

  render(pipeline) {
    pipeline.render(this.scene, this.camera, null);
  }

  async playIn() {
    await this.ready;

    this.wipe.value = 1;
    createTween(this.wipe, {
      from: { value: 1 },
      to: { value: 0 },
      duration: INTRO_TIMELINE.wipe.duration,
      delay: INTRO_TIMELINE.wipe.delay,
      ease: INTRO_TIMELINE.wipe.ease,
    });

    this.planetGroup.position.y = -80;
    createTween(this.planetGroup.position, {
      to: { x: 0, y: 0, z: 0 },
      duration: INTRO_TIMELINE.planet.riseDuration,
      delay: INTRO_TIMELINE.planet.delay,
      ease: 'inOut1',
    });
    this.planetGroup.scale.setScalar(0.3);
    createTween(this.planetGroup.scale, {
      to: { x: 1, y: 1, z: 1 },
      duration: INTRO_TIMELINE.planet.scaleDuration,
      delay: INTRO_TIMELINE.planet.delay,
      ease: 'inOut3',
    });
    const spinEnd = Math.PI * 0.35;
    this.planetGroup.rotation.y = spinEnd - Math.PI * 1.5;
    createTween(this.planetGroup.rotation, {
      to: { y: spinEnd },
      delay: INTRO_TIMELINE.planet.delay + 0.15,
      duration: INTRO_TIMELINE.planet.spinDuration,
      ease: 'inOut3',
    });
    createTween(this.planetGroup.rotation, {
      from: { x: -Math.PI },
      to: { x: 0 },
      delay: INTRO_TIMELINE.planet.delay,
      duration: INTRO_TIMELINE.planet.rotationDuration,
      ease: 'inOut1',
    });

    this.particles.playInAnimation(INTRO_TIMELINE.particles.delay);
    createTween(this.atmosphere.show, {
      from: { value: 0 },
      to: { value: 1 },
      duration: INTRO_TIMELINE.atmosphere.duration,
      delay: INTRO_TIMELINE.atmosphere.delay,
      ease: INTRO_TIMELINE.atmosphere.ease,
    });
    this.galaxies.playInAnimation(INTRO_TIMELINE.galaxies.delay);
    this.title.playInAnimation(INTRO_TIMELINE.title.delay);
    this.birds.playInAnimation(INTRO_TIMELINE.birds.delay);
    this.button.playInAnimation(INTRO_TIMELINE.button.delay);

    for (const [delay, sound] of INTRO_TIMELINE.audio) {
      createDelayedCall(delay, () => this.events.emit('webgl_play_audio', sound));
    }

    await wait(INTRO_TIMELINE.interactionsAt);
    this.enableInteractions();
    return this;
  }

  async playOut() {
    await this.ready;
    this.disableInteractions();
    this.button.spinOut();
    createTween(this.camera, {
      to: { autoRotateSpeed: 0 },
      duration: 1,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.camera.touchAmount = this.camera.autoRotateSpeed;
      },
    });
    createTween(this.camera.sphericalTarget, {
      to: { theta: this.camera.sphericalTarget.theta - Math.PI * 0.25, phi: 1.7 },
      duration: 2.5,
      ease: 'tweaked',
    });
    createTween(this.camera.sphericalTarget, {
      to: { radius: 40 },
      duration: 2.75,
      delay: 0.4,
      ease: 'inOut1',
    });
    createTween(this.camera.roll, {
      to: { value: -Math.PI * 0.25 },
      duration: 3.35,
      delay: 0.2,
      ease: 'inOut1',
    });

    this.button.playOutAnimation();
    this.title.playOutAnimation();
    createDelayedCall(1, () => this.events.emit('webgl_play_audio', 'whoosh'));

    await wait(2);
    return this;
  }

  enableInteractions() {
    this.interactionsEnabled = true;
    this.title.enable();
    this.button.enable();
  }

  disableInteractions() {
    this.interactionsEnabled = false;
    this.title.disable();
    this.button.disable();
  }

  on(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(handler);
    return () => {
      const list = this.listeners.get(name);
      const index = list?.indexOf(handler) ?? -1;
      if (index >= 0) list.splice(index, 1);
    };
  }

  dispose() {
    this.loaded = false;
    this.app.resizeCallbacks = this.app.resizeCallbacks.filter((callback) => callback !== this._onResize);
    this.app.renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.title.dispose();
    this.button.dispose();
    this.particles.dispose();
    this.galaxies.dispose();
    this.birds.dispose();
    this.atmosphere.dispose();
    this.sky.dispose();
    this.planet.dispose();
    this.scene.clear();
    this.listeners.clear();
  }
}
