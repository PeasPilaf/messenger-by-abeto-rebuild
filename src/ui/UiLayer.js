import { Scene } from 'three';
import { client } from '../core/Client.js';
import { events } from '../core/Events.js';
import { UiInput } from './UiInput.js';
import { UiOutline } from './UiOutline.js';
import { Tweens } from './UiTween.js';
import { createScreenCamera, responsive } from './UiLayout.js';
import { setTextResolution } from './UiText.js';
import { SideButtonsUI } from './SideButtonsUI.js';
import { DialogueUI } from './DialogueUI.js';
import { QuestCardUI } from './QuestCardUI.js';
import { ChecklistUI } from './ChecklistUI.js';
import { EmotePanelUI } from './EmotePanelUI.js';
import { ZoneTitlesUI } from './ZoneTitlesUI.js';
import { EndScreenUI } from './EndScreenUI.js';

export class UiLayer {

  constructor({ glyphs, textureLoader, app }) {
    this.glyphs = glyphs;
    this.textureLoader = textureLoader;
    this.app = app;
    this.renderer = app.renderer;

    this.scene = new Scene();
    this.scene.name = 'ui-scene';
    this.camera = createScreenCamera(1, 1);

    this.tweens = new Tweens();
    this.input = new UiInput({ cursorTarget: this.renderer.domElement });
    this.input.onKey = (code, type) => this._onKey(code, type);
    this.outline = new UiOutline(this.renderer);

    this.overlay = this.outline.overlay;

    this.width = 1;
    this.height = 1;
    this.responsive = responsive(1, 1);
    this.loaded = false;

    this.ctx = {
      scene: this.scene,
      glyphs,
      tweens: this.tweens,
      input: this.input,
      outline: this.outline,
      ui: this,
      responsive: this.responsive,
      boxAudio: (amount = 0.5) => this.playBoxAudio(amount),
    };
  }

  async load() {
    const { ctx } = this;
    this.sideButtons = new SideButtonsUI(ctx);
    this.dialogue = new DialogueUI(ctx);
    this.questCard = new QuestCardUI(ctx);
    this.checklist = new ChecklistUI(ctx);
    this.emotePanel = new EmotePanelUI(ctx);
    this.zoneTitles = new ZoneTitlesUI(ctx);
    this.endScreen = new EndScreenUI(ctx);

    await Promise.all([
      this.sideButtons.load(),
      this.dialogue.load(),
      this.questCard.load(),
      this.checklist.load(),
      this.emotePanel.load(),
      this.zoneTitles.load(),
      this.endScreen.load(),
    ]);

    this._wireEvents();
    this.input.bindKeyboard();
    this.screensReady = true;
    this.resize(client.screen.w, client.screen.h);
    this.loaded = true;
    return this;
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.responsive = responsive(this.width, this.height);
    this.ctx.responsive = this.responsive;

    this.camera = createScreenCamera(this.width, this.height);

    if (!this.screensReady) return this;

    for (const screen of [
      this.sideButtons, this.dialogue, this.questCard, this.checklist,
      this.emotePanel, this.zoneTitles, this.endScreen,
    ]) {
      screen?.resize(this.width, this.height);
    }

    const dpr = client.screen.dpr || 1;
    const deviceWidth = Math.max(1, Math.floor(this.width * dpr));
    const deviceHeight = Math.max(1, Math.floor(this.height * dpr));
    this.deviceResolution = { width: deviceWidth, height: deviceHeight };
    this.outline.setSize(deviceWidth, deviceHeight);
    setTextResolution(this.scene, deviceWidth, deviceHeight);
    return this;
  }

  update(time, dt, render = true) {
    this.tweens.update(Math.min(dt, 0.1));

    if (render) this.outline.render(this.scene, this.camera);
  }

  showDialogue(payload = {}) {
    return this.dialogue.show(payload);
  }

  advanceDialogue() {
    return this.dialogue.advance();
  }

  hideDialogue() {
    this.dialogue.hideFinal();
    return this;
  }

  showQuestCard(payload = {}) {
    return this.questCard.display(payload);
  }

  async showChecklist(entries) {
    this.checklist.setEntries(entries);
    if (!this.checklist.shown) await this.checklist.show();
    else await this.checklist.rebuild();
    return this;
  }

  toggleChecklist() {
    this.checklist.toggle();
    return this;
  }

  setSideButtonsVisible(visible) {
    this.sideButtons.setVisible(Boolean(visible));
    return this;
  }

  setEmotePanelOpen(open) {
    this.emotePanel.setOpen(Boolean(open));
    return this;
  }

  showZoneTitle(text) {
    return this.zoneTitles.show(text);
  }

  showEndScreen() {
    return this.endScreen.show();
  }

  hideEndScreen() {
    return this.endScreen.hide();
  }

  handlePointerDown(x, y) {
    return this.input.handlePointerDown(x, y);
  }

  handlePointerUp(x, y) {
    return this.input.handlePointerUp(x, y);
  }

  handlePointerMove(x, y) {
    return this.input.handlePointerMove(x, y);
  }

  _onKey(code, type) {

    this.dialogue.onKey(code, type);
    if (code === 'KeyL' && type === 'keydown') events.emit('character_change_traits_show');
  }

  _wireEvents() {
    const hideCombatUI = () => {
      this.sideButtons.hide();
      this.questCard.hide();
      this.checklist.hide();
      this.emotePanel.hide();
      this.zoneTitles.hideAll();
    };

    events.on('npc_dialog_open', (id, text, data = {}, opts = {}) => {
      if (opts?.bubblesEnabled) return;
      this.showDialogue({ id, text, name: data.name, color: data.color, voice: data.voice });
    });
    events.on('npc_dialog_close', () => this.dialogue.hide());
    events.on('npc_dialog_finished', (id) => this.dialogue.hideFinal(id));
    events.on('npc_dialog_interrupted', (id) => this.dialogue.hideFinal(id));
    events.on('npc_dialog_shown', hideCombatUI);
    events.on('npc_dialog_hidden', () => this.sideButtons.show(0.2));

    events.on('quest_box_display_after_step', (title, icon, text, color, isComplete) => {
      this.showQuestCard({ title, icon, text, color, isComplete });
    });
    events.on('quest_info_checklist_update', (showDot, allDone) => {
      this.checklist.update(showDot, allDone);
    });

    events.on('ui_show_sideicons', () => this.sideButtons.show(0));
    events.on('ui_hide_sideicons', () => this.sideButtons.hide(0));
    events.on('ui_sideicons_shown', () => this.checklist.setSideIconsVisible(true));
    events.on('ui_sideicons_hidden', () => this.checklist.setSideIconsVisible(false));
    events.on('audio_update_mute', (muted) => this.sideButtons.setMuteState(muted));

    events.on('ui_quest_log_toggle', () => {
      this.emotePanel.hide();
      this.checklist.toggle();
    });
    events.on('ui_emojis_toggle', () => {
      this.checklist.hide();
      this.questCard.hide();
      this.zoneTitles.hideAll();
      this.emotePanel.toggle();
    });

    events.on('character_change_traits_shown', hideCombatUI);
    events.on('character_change_traits_hiddden', () => this.sideButtons.show(0.2));

    events.on('end_screen_show', () => {
      hideCombatUI();
      this.showEndScreen();
    });
    events.on('end_screen_hide', () => {
      this.hideEndScreen();
      this.sideButtons.show(0.2);
    });

    events.on('touch_click', () => {
      this.checklist.hide();
      this.emotePanel.hide();
    });
  }

  playBoxAudio(amount = 0.5) {
    const rise = { value: 0 };
    this.tweens.to(rise, {
      from: { value: 0 }, to: { value: 1 }, duration: amount * 0.05,
      onUpdate: () => events.emit('webgl_set_audio_volume', 'paper4', rise.value * 0.4),
    });
    this.tweens.after(amount * 0.95, () => {
      const fall = { value: 1 };
      this.tweens.to(fall, {
        from: { value: 1 }, to: { value: 0 }, duration: amount * 0.05 + 0.2,
        onUpdate: () => events.emit('webgl_set_audio_volume', 'paper4', fall.value * 0.4),
      });
    });
  }

  dispose() {
    events.removeAllListeners();
    this.glyphs?.dispose?.();
    this.outline.target.dispose();
  }
}
