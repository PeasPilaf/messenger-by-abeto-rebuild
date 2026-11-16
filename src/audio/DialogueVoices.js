import { events } from '../core/Events.js';

export const VOICE_TO_SOUND = Object.freeze({
  male1: 'dialogue-male1',
  male2: 'dialogue-male2',
  male3: 'dialogue-male3',
  female1: 'dialogue-female1',
  female2: 'dialogue-female2',
  female3: 'dialogue-female3',
  wtf: 'dialogue-wtf',
  quest: 'dialogue-quest',
});

export const DEFAULT_VOICE = 'male1';

export const VOICE_VOLUME = 0.5;

export const VOICE_FADE = 0.2;

export const QUEST_SOUND = 'dialogue-quest';

export const QUEST_VOLUME = 0.075;

export const QUEST_FADE = 0.25;

export const DIALOG_START_DELAY = 0.45;

export const BUBBLE_START_DELAY = 0.35;

export const DIALOG_CHARS_PER_SECOND = 35;

export const BUBBLE_CHARS_PER_SECOND = 15;
export const BUBBLE_TYPING_SCALE = 0.3;

export const BUBBLE_TYPING_MINIMUM = 1;

const TAGS = /({#[\s\S]*?})/g;

export function textWithoutTags(text = '') {
  return String(text).replace(TAGS, '');
}

export function typingSeconds(text, {
  charsPerSecond = DIALOG_CHARS_PER_SECOND,
  minimum = 0,
  scale = 1,
} = {}) {
  const characters = textWithoutTags(text).length;
  return Math.max(minimum, characters / charsPerSecond) * scale;
}

export function soundForVoice(voice) {
  return VOICE_TO_SOUND[voice] ?? VOICE_TO_SOUND[DEFAULT_VOICE];
}

export class DialogueVoices {

  constructor({ audio, resolveNPC = null, random = Math.random }) {
    this.audio = audio;
    this._resolveNPC = resolveNPC;
    this._random = random;
    this._attached = false;

    this._active = new Map();

    this._objects = new Map();

    this.unresolved = [];

    this._questValue = { value: 0 };
    this._onDialogOpen = this._onDialogOpen.bind(this);
    this._onDialogStop = this._onDialogStop.bind(this);
    this._onBubbleStarts = this._onBubbleStarts.bind(this);
    this._onBubbleEnds = this._onBubbleEnds.bind(this);
  }

  attach() {
    if (this._attached) return this;
    this._attached = true;
    events.on('npc_dialog_open', this._onDialogOpen, this);
    events.on('npc_dialog_typing_end', this._onDialogStop, this);
    events.on('npc_dialog_close', this._onDialogStop, this);
    events.on('npc_dialog_finished', this._onDialogStop, this);
    events.on('npc_dialog_interrupted', this._onDialogStop, this);
    events.on('npc_dialog_hidden', this._onDialogStop, this);
    events.on('npc_bubble_text_starts', this._onBubbleStarts, this);
    events.on('npc_bubble_text_ends', this._onBubbleEnds, this);
    return this;
  }

  detach() {
    if (!this._attached) return;
    this._attached = false;
    events.off('npc_dialog_open', this._onDialogOpen, this);
    events.off('npc_dialog_typing_end', this._onDialogStop, this);
    events.off('npc_dialog_close', this._onDialogStop, this);
    events.off('npc_dialog_finished', this._onDialogStop, this);
    events.off('npc_dialog_interrupted', this._onDialogStop, this);
    events.off('npc_dialog_hidden', this._onDialogStop, this);
    events.off('npc_bubble_text_starts', this._onBubbleStarts, this);
    events.off('npc_bubble_text_ends', this._onBubbleEnds, this);
    this.stopAll();
  }

  registerNPC(id, object3D) {
    this._objects.set(id, object3D);
  }

  resolveNPC(id) {
    if (this._objects.has(id)) return this._objects.get(id);
    return this._resolveNPC ? this._resolveNPC(id) : null;
  }

  startDialogue({ id = 'dialog', text = '', voice = DEFAULT_VOICE, bubbles = false, delay = null, object = null } = {}) {
    const sound = soundForVoice(voice);
    if (!sound) return false;

    const duration = bubbles
      ? typingSeconds(text, {
        charsPerSecond: BUBBLE_CHARS_PER_SECOND,
        minimum: BUBBLE_TYPING_MINIMUM,
        scale: BUBBLE_TYPING_SCALE,
      })
      : typingSeconds(text, { charsPerSecond: DIALOG_CHARS_PER_SECOND });
    const startDelay = delay ?? (bubbles ? BUBBLE_START_DELAY : DIALOG_START_DELAY);

    this.stopDialogue(id);
    const token = {
      id,
      voice,
      sound,
      text,
      object,
      quest: sound === QUEST_SOUND,
      started: false,
      duration,
      startDelay,
    };
    this._active.set(id, token);

    this.audio.after(startDelay, () => {

      if (this._active.get(id) !== token) return;

      if (token.quest) {
        this.raiseQuest();
      } else {
        const target = token.object ?? this.resolveNPC(id);
        if (!target) {
          this.unresolved.push({ id, voice });
          this._active.delete(id);
          return;
        }
        token.object = target;
        const started = this.audio.playPositional(sound, target, { volume: VOICE_VOLUME });
        if (!started) {
          this._active.delete(id);
          return;
        }
      }
      token.started = true;
      this.audio.stats.voices++;
      this.audio.after(duration, () => {
        if (this._active.get(id) === token) this.stopDialogue(id);
      });
    });
    return true;
  }

  stopDialogue(id) {
    const token = this._active.get(id);
    if (!token) return false;
    this._active.delete(id);

    if (!token.started) return true;
    if (token.quest) this.lowerQuest();
    else this.audio.stopPositional(token.sound);
    return true;
  }

  stopAll() {
    for (const id of [...this._active.keys()]) this.stopDialogue(id);
  }

  raiseQuest() {
    this._tweenQuest(QUEST_VOLUME);
  }

  lowerQuest() {
    this._tweenQuest(0);
  }

  _tweenQuest(target) {
    this._questValue.value = this.audio.getVolume(QUEST_SOUND);
    this.audio.timers.tween({
      key: 'quest-narration',
      target: this._questValue,
      to: { value: target },
      duration: QUEST_FADE,
      onUpdate: () => this.audio.setVolume(QUEST_SOUND, this._questValue.value),
    });
  }

  _onDialogOpen(id, text, extraData = null, options = null) {

    if (options?.bubblesEnabled) return;
    this.startDialogue({
      id,
      text,
      voice: extraData?.voice || DEFAULT_VOICE,
      bubbles: false,
    });
  }

  _onDialogStop(id) {
    if (id !== undefined && id !== null) this.stopDialogue(id);
  }

  _onBubbleStarts(payload = {}) {
    const object = payload.object ?? null;
    const id = payload.npc ?? object?._id ?? 'bubble';
    const voice = payload.voice
      ?? object?.userData?.voice
      ?? object?.extraData?.voice
      ?? DEFAULT_VOICE;
    this.startDialogue({
      id,
      text: payload.text ?? '',
      voice,
      bubbles: true,
      object,
    });
  }

  _onBubbleEnds(payload = {}) {
    const id = payload.npc ?? payload.object?._id ?? 'bubble';
    this.stopDialogue(id);
  }

  analyse() {
    return {
      active: [...this._active.values()].map((token) => ({
        id: token.id,
        voice: token.voice,
        sound: token.sound,
        started: token.started,
        quest: token.quest,
        duration: token.duration,
        delay: token.startDelay,
      })),
      questVolume: this.audio.getVolume(QUEST_SOUND),
      unresolved: this.unresolved.length,
    };
  }

  nextRandomOffset(duration) {
    return this._random() * duration;
  }
}
