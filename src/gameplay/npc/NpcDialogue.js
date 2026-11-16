import { Vector3 } from 'three';

import { events } from '../../core/Events.js';
import { NpcBeacon } from './NpcBeacon.js';
import { NpcBubble } from './NpcBubble.js';

const TAG_REGEX = /({#[\s\S]*?})/g;

const BUBBLE_SPEED = 1 / 15;
const BUBBLE_CLOSE_TIME = 0.4;

const QUEST_SPEED = 1 / 35;
const QUEST_CLOSE_TIME = 0.3;

const scratchPosition = new Vector3();

function visibleLength(text) {
  return String(text ?? '').replace(TAG_REGEX, '').length;
}

export class NpcDialogue {

  constructor({ actor, manager, glyphs, camera }) {
    this.actor = actor;
    this.manager = manager;
    this.glyphs = glyphs;
    this.camera = camera;

    const options = actor.options;
    this.id = options.id;
    this.options = options;
    this.extraData = options.extraData;

    this._texts = options.texts.slice();
    this._textsObjectRef = this._texts;
    this._textsCurrent = 0;
    this._textsStart = -1;
    this._textsEnd = -1;
    this._textsCloseRequested = false;
    this._textsBubbles = options.textsBubbles;
    this._textsBubblesEnabled = options.textsBubbles;
    this._textsBubblesShown = false;
    this._bubbleKey = null;
    this._bubbleHiddenEventPending = false;
    this._textsSpeed = options.textsSpeed;
    this._textsAutoClose = options.textsAutoClose;
    this._textsReset = options.textsReset;
    this._textsRepeatLast = options.textsRepeatLast;
    this._textsCloseTime = options.textsCloseTime;
    this._textsOpenTime = options.textsOpenTime;
    this._talkNeedsToStart = true;
    this._talkingDone = false;
    this._clickInteracted = false;

    this._clickInteractionEnabled = false;
    this._clickInteractionActive = false;
    this._questEnabled = false;
    this._questStepExtraData = {};
    this._questTextPreviousCurrent = 0;
    this._typingForced = false;
    this._time = 0;

    this.distance = Infinity;
    this.isClose = false;
    this.visible = false;
    this.talking = false;

    this.bubble = null;
    this.beacon = options.icon ? new NpcBeacon({ actor, glyphs, iconOptions: options.iconOptions }) : null;
  }

  async load() {
    if (this._textsBubbles) {
      this.bubble = new NpcBubble({
        actor: this.actor,
        glyphs: this.glyphs,
        style: this.options.textsBubblesOptions,
        camera: this.camera,
      });
      await this.bubble.setText(this._textsObjectRef[0] ?? '');
    }
    await this.beacon?.ready;

    this.enableBubbles();
    this._subscribe();
    return this;
  }

  _subscribe() {
    events.on('quest_enable_id', this._onQuestEnable, this);
    events.on('quest_disable_id', this._onQuestDisable, this);
    events.on('npc_force_next_dialog', this._onForceNextDialog, this);
    events.on('npc_force_close_dialog', this._onForceCloseDialog, this);
  }

  update(time, delta, ctx) {
    this._time = time;
    const mesh = this.actor.mesh;
    const playerPosition = ctx.playerPosition;
    this.distance = playerPosition.distanceTo(mesh.position);

    this.isClose = this.distance < this.options.talkDistance && this._textsObjectRef.length > 0;
    this.visible = this.distance < this.options.visibilityThreshold;

    if (this._clickInteractionEnabled) {
      this._clickInteractionActive = this.isClose && Boolean(ctx.controlsEnabled);
      if (!this.isClose) this._clickInteracted = false;
    } else {
      this._clickInteractionActive = false;
    }

    const other = managerElement(this.manager);
    if (this._clickInteractionEnabled && (this._talkingDone || (other !== null && other !== this))) {
      this._clickInteracted = false;
    }

    this._resetTalkingDone();

    let wantsTalk = this.options.talkEnabled && this.visible && this.isClose && !this._talkingDone;
    if (wantsTalk && this._clickInteractionEnabled && !this._clickInteracted) wantsTalk = false;
    if (wantsTalk) {
      if (managerElement(this.manager) === null) this.manager.interactingElement = this;
    } else if (managerElement(this.manager) === this && !this._textsBubblesShown) {
      this.manager.interactingElement = null;
    }
    this.talking = wantsTalk && managerElement(this.manager) === this;

    if (this.talking) this._updateTalking(time);
    else {
      this._closeTextIfNeeded();
      this._talkNeedsToStart = true;
    }

    this._updateBubbles(time, delta);
  }

  _updateTalking(time) {
    if (this._textsStart === -1) {

      if (this._textsEnd === -1) {
        if (this._talkNeedsToStart) {
          this._talkNeedsToStart = false;
          events.emit('quest_step_texts_check', this);
          if (this._textsCurrent < this._textsObjectRef.length - 1 || this._textsReset) this._textsCurrent = 0;
        }
        this._textsCloseRequested = false;
        this._typingForced = false;
        this._openText();
        this._updateTalkAnimation(true);
      }
      return;
    }

    const text = this._textsObjectRef[this._textsCurrent];
    const typingDuration = Math.max(1, visibleLength(text) * this._textsSpeed);
    const shownTime = time - this._textsStart - this._textsOpenTime;
    if (shownTime > typingDuration) this._updateTalkAnimation(false);

    let closeAt = Infinity;
    if (this._textsCloseRequested || this._typingForced) closeAt = -Infinity;
    else if (this._textsAutoClose) closeAt = typingDuration;

    if (shownTime > closeAt) {
      if (this._textsEnd === -1) {
        this._closeText();
        if (this._textsCurrent === this._textsObjectRef.length - 1) {
          this._talkingDone = true;
          events.emit('npc_dialog_finished', this.id);
          events.emit('quest_step_check', this);
        } else {
          this._textsCurrent++;
        }
      } else if (this._textsEnd + this._textsCloseTime < time) {
        this._textsStart = -1;
        this._textsEnd = -1;
      }
    }
  }

  _resetTalkingDone() {
    if (!this._talkingDone) return;
    if (!this._textsRepeatLast && !this._textsReset) return;
    if (!this.isClose || this._clickInteractionEnabled) this._talkingDone = false;
  }

  _openText() {
    this._textsStart = this._time;
    this._textsEnd = -1;
    const text = this._textsObjectRef[this._textsCurrent];
    if (this._textsBubblesEnabled) {
      events.emit('npc_bubble_show', { object: this.actor.mesh, npc: this.id, text, index: this._textsCurrent });
      events.emit('npc_bubble_text_starts', { object: this.actor.mesh, npc: this.id, text, index: this._textsCurrent });
      this._textsBubblesShown = true;
    } else {
      events.emit('npc_dialog_open', this.id, text, this.extraData, {
        currentText: this._textsCurrent,
        totalTexts: this._textsObjectRef.length,
        bubblesEnabled: this._textsBubblesEnabled,
        stepExtraData: this._questStepExtraData,
      });
    }
    this._playVoice();
  }

  _closeText() {
    this._textsCloseRequested = true;
    this._textsEnd = this._time;
    events.emit('npc_dialog_close', this.id);
    if (this._textsBubblesEnabled) {
      events.emit('npc_bubble_text_ends', {
        object: this.actor.mesh,
        npc: this.id,
        text: this._textsObjectRef[this._textsCurrent],
        index: this._textsCurrent,
      });
      events.emit('npc_bubble_hide', {
        object: this.actor.mesh,
        npc: this.id,
        text: this._textsObjectRef[this._textsCurrent],
        index: this._textsCurrent,
      });
      this._textsBubblesShown = false;
    }
    this._stopVoice();
    this._updateTalkAnimation(false);
  }

  _closeTextIfNeeded() {
    if (this._textsStart !== -1 && this._textsEnd === -1) {
      this._closeText();
      events.emit('npc_dialog_interrupted', this.id);
    }
  }

  _updateTalkAnimation(playing) {
    if (this.actor.talkAnimationPlaying === playing) return;
    this.actor.setTalkAnimationPlaying(playing);
    events.emit('npc_talk_update', { id: this.id, object: this.actor.mesh, talking: playing });
  }

  _playVoice() {
    if (this.manager.voiceEvents !== 'direct') return;
    const voice = this.extraData?.voice || 'male1';
    events.emit('webgl_play_positional', `dialogue-${voice}`, this.actor.mesh);
  }

  _stopVoice() {
    if (this.manager.voiceEvents !== 'direct') return;
    const voice = this.extraData?.voice || 'male1';
    events.emit('webgl_stop_positional', `dialogue-${voice}`, this.actor.mesh);
  }

  _updateBubbles(time, delta) {
    if (this.bubble) {
      const text = this._textsObjectRef[this._textsCurrent];
      const shouldShow =
        this._textsBubblesEnabled &&
        this._textsStart !== -1 &&
        this._textsEnd === -1 &&
        typeof text === 'string';
      const key = shouldShow ? `${this._textsCurrent}:${text}` : null;
      if (shouldShow && this._bubbleKey !== key) {
        this._bubbleKey = key;
        this.bubble.show(text);
      } else if (!shouldShow && this._bubbleKey !== null) {
        this._bubbleKey = null;
        this.bubble.hide();
        this._bubbleHiddenEventPending = true;
      }
      this.bubble.update(delta);
      this.bubble.setResolution(this.manager.resolution.width, this.manager.resolution.height);
      if (this._bubbleHiddenEventPending && !this.bubble.visible) {
        this._bubbleHiddenEventPending = false;
        events.emit('npc_bubble_hidden', { object: this.actor.mesh, npc: this.id });
      }
    }
    if (this._textsBubblesShown) this._textsBubblesShown = Boolean(this.bubble?.visible);

    this.beacon?.setResolution(this.manager.resolution.width, this.manager.resolution.height);
    this.beacon?.update(delta, {
      camera: this.camera,
      isClose: this.isClose,
      talking: this.talking,
      textsCount: this._textsObjectRef.length,
    });
  }

  onClick() {
    if (!this._clickInteractionActive || !this.isClose) return false;
    this._clickInteracted = true;
    return true;
  }

  onHover(entered) {
    if (entered) this.beacon?.pulse();
  }

  requestAdvance() {
    if (!this.talking || this._textsStart === -1 || this._textsEnd !== -1) return false;
    const text = this._textsObjectRef[this._textsCurrent];
    const typingDuration = Math.max(1, visibleLength(text) * this._textsSpeed);
    const shownTime = this._time - this._textsStart - this._textsOpenTime;
    if (shownTime <= typingDuration) {
      this._typingForced = true;
      return true;
    }
    this._textsCloseRequested = true;
    return true;
  }

  forceClose() {
    if (!this.talking) return false;
    if (this._textsCurrent === this._textsObjectRef.length - 1) this._textsCloseRequested = true;
    else this._talkingDone = true;
    return true;
  }

  _onForceNextDialog(id) {
    if (id !== this.id || !this.talking) return;
    this._textsCloseRequested = true;
  }

  _onForceCloseDialog(id) {
    if (id !== this.id) return;
    this.forceClose();
  }

  enableBubbles() {
    if (this._textsBubblesEnabled === false) this._forceClose();
    this._textsBubblesEnabled = Boolean(this._textsBubbles);
    this._clickInteractionEnabled = false;
    this._clickInteractionActive = false;
    this._clickInteracted = false;
    this._textsAutoClose = true;
    this._textsReset = true;
    this._talkingDone = true;
    this._textsSpeed = BUBBLE_SPEED;
    this._textsCloseTime = BUBBLE_CLOSE_TIME;
    this.beacon?.setActive(false);
    if (managerElement(this.manager) === this) this.manager.interactingElement = null;
  }

  disableBubbles() {
    this._forceClose();
    this._textsBubblesEnabled = false;
    this.bubble?.hide({ immediate: true });
    this._textsBubblesShown = false;

    this._clickInteractionEnabled = Boolean(this.options.clickInteraction);
    this._clickInteractionActive = false;
    this._clickInteracted = false;
    this._textsAutoClose = false;
    this._textsReset = false;
    this._talkingDone = true;
    this._textsSpeed = QUEST_SPEED;
    this._textsCloseTime = QUEST_CLOSE_TIME;
    this.beacon?.setActive(true);
  }

  _forceClose() {
    this._closeTextIfNeeded();
    this._talkingDone = true;
    if (managerElement(this.manager) === this) this.manager.interactingElement = null;
  }

  setTexts(texts, current = 0, permanent = false, recreateBubbles = false) {
    this._textsObjectRef = texts;
    this._textsCurrent = current;
    if (permanent) this._texts = texts;
    if (recreateBubbles && this.bubble) {
      this.bubble.setText(this._textsObjectRef[this._textsCurrent] ?? '');
    }
  }

  _onQuestEnable(id) {
    if (id !== this.id) return;
    this._questEnabled = true;
    this.actor.setQuestEnabled(true);
    this.beacon?.setQuestEnabled(true);
    if (this._texts === this._textsObjectRef) this._questTextPreviousCurrent = this._textsCurrent;
    if (this._textsObjectRef.length === 0) this.setTexts(['-'], 0, false, true);
    this.disableBubbles();
  }

  _onQuestDisable(id) {
    if (id !== this.id) return;
    this._questEnabled = false;
    this.actor.setQuestEnabled(false);
    this.beacon?.setQuestEnabled(false);
    if (this._textsObjectRef !== this._texts) this.setTexts(this._texts, this._questTextPreviousCurrent);
    this._questTextPreviousCurrent = 0;
    this._questStepExtraData = {};
    this.enableBubbles();
  }

  get questStepExtraData() {
    return this._questStepExtraData;
  }

  set questStepExtraData(extraData) {
    this._questStepExtraData = extraData ?? {};
  }

  get textsObjectRef() {
    return this._textsObjectRef;
  }

  get textsBubblesEnabled() {
    return this._textsBubblesEnabled;
  }

  get questEnabled() {
    return this._questEnabled;
  }

  get currentTextIndex() {
    return this._textsCurrent;
  }

  setResolution(width, height) {
    this.bubble?.setResolution(width, height);
    this.beacon?.setResolution(width, height);
  }

  dispose() {
    events.off('quest_enable_id', this._onQuestEnable, this);
    events.off('quest_disable_id', this._onQuestDisable, this);
    events.off('npc_force_next_dialog', this._onForceNextDialog, this);
    events.off('npc_force_close_dialog', this._onForceCloseDialog, this);
    this._closeTextIfNeeded();
    this.bubble?.dispose();
    this.beacon?.dispose();
  }
}

function managerElement(manager) {
  return manager?.interactingElement ?? null;
}

export { scratchPosition };
