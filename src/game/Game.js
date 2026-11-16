import * as THREE from 'three';

import { ticker } from '../core/Ticker.js';
import { events } from '../core/Events.js';
import { WebGLApp } from '../graphics/WebGLApp.js';
import { createSharedUniforms } from '../graphics/PainterlyMaterial.js';
import { AdaptiveDPR } from '../graphics/AdaptiveDPR.js';
import { OUTLINE, INTRO_OUTLINE } from '../graphics/constants.js';
import { GeometryLoader } from '../assets/GeometryLoader.js';
import { TextureLoader } from '../assets/TextureLoader.js';
import { AudioLoader } from '../assets/AudioLoader.js';
import { GlyphLoader } from '../text/GlyphLoader.js';
import { LoaderScreen } from '../boot/LoaderScreen.js';
import { createTween, updateTweens } from '../core/Tween.js';
import { FirstRun, wireDialogueCamera, wirePointerInput } from './FirstRun.js';
import { CustomizeController } from './CustomizeController.js';

import { IntroScene } from '../intro/IntroScene.js';
import { PresentScene } from './PresentScene.js';
import { Player } from './Player.js';
import { NpcManager } from '../gameplay/npc/NpcManager.js';
import { QuestSystem } from '../gameplay/quest/QuestSystem.js';
import { RewardProp } from '../gameplay/quest/RewardProp.js';
import { WorldExtras } from '../world/extras/WorldExtras.js';
import { UiLayer } from '../ui/UiLayer.js';
import { AudioSystem } from '../audio/AudioSystem.js';

export class Game {
  constructor() {
    this.loader = new LoaderScreen();
    this.app = new WebGLApp();
    this.geometryLoader = new GeometryLoader();
    this.app.geometryLoader = this.geometryLoader;
    this.textureLoader = new TextureLoader(this.app.renderer);
    this.audioLoader = new AudioLoader();
    this.glyphs = new GlyphLoader();

    this.state = 'boot';
    this.pipeline = null;
    this.textures = null;
    this.shared = null;
    this.intro = null;
    this.present = null;
    this.player = null;
    this.ui = null;
    this.audio = null;
    this.adaptiveDPR = null;
  }

  async start() {
    const t0 = performance.now();
    const mark = (label) => console.info(`[boot] ${label} +${((performance.now() - t0) / 1000).toFixed(2)}s`);
    this._mark = mark;
    this.loader.show();

    this.textures = await this.loadGlobalTextures();
    mark('textures');
    this.shared = createSharedUniforms(this.textures);

    this.adaptiveDPR = new AdaptiveDPR({
      applyResolution: (multiplier) => this.app.setDprMultiplier(multiplier),
      applyShadowQuality: (multiplier) => this.present?.sun.setShadowQuality?.(multiplier),
    });

    this.audioSystem = new AudioSystem({
      listener: null,
      resolveNPC: (id) => this.npcs?.getObject?.(id) ?? null,
    });
    this.attachAudio(this.audioSystem);
    this.audioReady = this.audioSystem.load();

    await this.startIntro();
    mark('intro-start');
  }

  async loadGlobalTextures() {
    const load = (name, mode) => this.textureLoader.load(name, mode);
    const [palette, noise, noiseTerrain, eye, eyeCharacter, mouth, clouds, waterNoise, lut] =
      await Promise.all([
        load('atlas.png', 'srgb-nearest'),
        load('noise-simplex-layered-pixellated-highq.ktx2', 'linearfilter-repeat'),
        load('noises-terrain.ktx2', 'linearfilter-repeat'),
        load('eye-highq.ktx2', 'repeat'),
        load('mainchar-eye-highq.ktx2', 'repeat'),
        load('mouth-highq.ktx2', 'repeat'),
        load('clouds_noise_512.ktx2', 'srgb-repeat'),
        load('water-noises-highq.ktx2', 'linearfilter-repeat'),
        load('lut.ktx2', 'luttetrahedral'),
      ]);
    return {
      palette,
      noise,
      noiseTerrain,
      eye,
      eyeCharacter,
      mouth,
      clouds,
      waterNoise,
      lut,

      ktx2Loader: this.textureLoader.ktx2Loader,
    };
  }

  async startIntro() {
    this.state = 'intro';

    this.intro = new IntroScene({
      app: this.app,
      textures: this.textures,
      shared: this.shared,
      glyphLoader: this.glyphs,
    });
    await this.intro.ready;
    this._mark('intro assets ready');
    this.audioSystem.setListenerCamera(this.intro.camera);

    this.pipeline = this.app.createPipeline(this.intro.camera);
    this.pipeline.setLut(this.textures.lut);
    this.pipeline.setOutlineTuning(INTRO_OUTLINE);

    this.app.renderer.compile(this.intro.scene, this.intro.camera);
    this._mark?.('intro compiled');
    this.intro.update(0, 0);
    this._mark?.('intro updated');
    this.pipeline.transition.uWipe1.value = this.intro.wipe.value;
    this.intro.render(this.pipeline);
    this._mark?.('intro rendered once');

    events.on('prerender', this.onUpdate, this);
    events.on('render', this.onRender, this);
    ticker.start();

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await this.loader.hide();
    this._mark?.('loader hidden');

    this.intro.on('begin', () => this.leaveIntro());
    await this.intro.playIn();
    this.state = 'intro-ready';
  }

  async leaveIntro() {
    if (this.state !== 'intro-ready' && this.state !== 'intro') return;
    this.state = 'transition';

    this.pipeline.transition.uFlash.value = 0;
    createTween(this.pipeline.transition.uFlash, { to: { value: 1 }, delay: 1, duration: 1, ease: 'inOut1' });
    createTween(this.pipeline.transition.uWipe2, { to: { value: 1 }, delay: 0.85, duration: 1.15, ease: 'inOut1' });

    await this.intro.playOut();
    events.off('render', this.onRender, this);
    this.intro.dispose();
    this.intro = null;

    this.loader.show();
    await this.startPresent();

    this.pipeline.transition.uFlash.value = 0;
    this.pipeline.transition.uWipe2.value = 0;
    this.pipeline.transition.uWipe1.value = 1;
    createTween(this.pipeline.transition.uWipe1, { to: { value: 0 }, duration: 2, ease: 'inOut1' });
    await this.loader.hide();
    this.state = 'present';
    this.adaptiveDPR.start();
  }

  async startPresent() {
    this.player = new Player({
      app: this.app,
      geometryLoader: this.geometryLoader,
      shared: this.shared,
    });
    await this.player.load();

    this.present = new PresentScene({
      app: this.app,
      camera: this.player.camera,
      textures: this.textures,
      shared: this.shared,
      geometryLoader: this.geometryLoader,
    });
    await this.present.load();

    this.app.resize();
    this.present.attachPlayer(this.player);
    this.player.snapToSpawn(this.present.spawn);

    this.pipeline.setCamera(this.player.camera);
    this.pipeline.setOutlineTuning(OUTLINE);
    this.app.renderer.compile(this.present.scene, this.player.camera);

    this.npcs = new NpcManager({
      scene: this.present.scene,
      camera: this.player.camera,
      geometryLoader: this.geometryLoader,
      glyphs: this.glyphs,
      shared: this.shared,

      voiceEvents: 'none',
    });
    await this.npcs.load();
    this.npcs.setPlayer(this.player);
    this.npcs.setResolution(...this.appResolution());
    this.app.onResize((width, height) => {
      this.npcs.setResolution(...this.appResolution());
      this.extras?.setSize(this.app.resolution.x, this.app.resolution.y);
    });
    this.present.addSystem(this.npcs);

    this.quests = new QuestSystem({ npcs: this.npcs });

    this.rewardProp = new RewardProp({
      scene: this.present.scene,
      geometryLoader: this.geometryLoader,
      shared: this.shared,
      player: this.player,
    });
    await this.rewardProp.load();
    this.present.addSystem(this.rewardProp);

    this.extras = new WorldExtras({
      app: this.app,
      scene: this.present,
      geometryLoader: this.geometryLoader,
      textureLoader: this.textureLoader,
      camera: this.player.camera,
    });
    await this.extras.load();
    for (const mesh of this.extras.waterMeshes) this.present.addToWaterScene(mesh);
    this.present.addSystem(this.extras);

    this.uiLayer = new UiLayer({
      glyphs: this.glyphs,
      textureLoader: this.textureLoader,
      app: this.app,
    });
    await this.uiLayer.load();
    this.uiLayer.resize(this.app.width, this.app.height);

    this.app.onResize(() => this.uiLayer.resize(this.app.width, this.app.height));
    this.attachUi(this.uiLayer);
    this.syncChecklist();
    events.on('quest_info_checklist_update', this.syncChecklist, this);
    events.on('quest_step_completed', this.syncChecklist, this);

    await this.audioReady;
    this.audioSystem.setListenerCamera(this.player.camera);

    this.customize = new CustomizeController(this).init();

    events.on('character_emoji_display', (emoji) => {
      this.extras?.emojis?.spawnAboveCharacter(this.player, emoji);
    });

    this.present.update(0, 0);
    wirePointerInput(this);
    wireDialogueCamera(this);
    events.on('render', this.onRender, this);
    this.firstRun = new FirstRun(this);
    this.firstRun.start();
  }

  syncChecklist() {
    if (!this.uiLayer || !this.quests) return;
    const entries = this.quests.describe().map((quest) => ({
      text: quest.description,
      done: quest.steps.filter((step) => step.done).length,
      total: quest.steps.length,
    }));

    const checklist = this.uiLayer.checklist;
    if (!checklist) return;
    checklist.setEntries(entries);
    if (checklist.shown) checklist.rebuild();
  }

  appResolution() {
    return [this.app.resolution.x, this.app.resolution.y];
  }

  onUpdate() {
    if (!this.pipeline) return;
    if (this.state === 'intro' || this.state === 'intro-ready') {
      this.intro.update(ticker.time, ticker.delta);
      this.pipeline.transition.uWipe1.value = this.intro.wipe.value;
    } else if (this.state === 'present') {

      updateTweens(ticker.delta);

      this.present.update(ticker.time, ticker.delta);
    } else if (this.state === 'transition') {

      if (this.intro) this.intro.update(ticker.time, ticker.delta);
      else updateTweens(ticker.delta);
    }

    this.ui?.update?.(ticker.time, ticker.delta);
    this.customize?.update(ticker.delta);

    this.audio?.update?.(ticker.time, ticker.delta, this.player?.ready ? this.player : null);
  }

  onRender() {
    if (!this.pipeline) return;
    if (this.state === 'intro' || this.state === 'intro-ready') {
      this.intro.render(this.pipeline);
    } else if (this.state === 'present') {
      this.present.render(this.pipeline);
    } else if (this.state === 'transition') {
      if (this.intro) this.intro.render(this.pipeline);
      else if (this.present) this.present.render(this.pipeline);
    }
  }

  attachUi(ui) {
    this.ui = ui;
    this.pipeline?.setOverlay(ui.overlay);
  }

  get uiScreen() {
    return this.ui;
  }

  attachAudio(audio) {
    this.audio = audio;
  }
}
