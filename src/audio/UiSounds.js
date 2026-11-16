export const UI_SOUNDS = Object.freeze({
  hover: 'hover2',
  clickDown: 'click2',
  clickUp: 'click3',
  buttons: 'buttons',
  title: 'title',
  openBox2: 'open-box2',
  openBox1: 'open-box1',
  openBoxChecklist: 'open-box-checklist',
  openBoxEmote: 'open-box-emote',
  questComplete: 'quest-complete',
  customize: 'customize',
  paper: 'paper4',
  letters: 'intro-letters',
  buttonTurn: 'button-turn',
  buttonOut: 'button-out',
});

export const PAPER_MIX = 0.4;

export const PAPER_DEFAULT_VOLUME = 0.5;

export class UiSounds {

  constructor({ audio, random = Math.random }) {
    this.audio = audio;
    this._random = random;
    this._boxVolume = { value: 0 };
    this._attached = false;
  }

  play(name) {
    return this.audio.play(name);
  }

  stop(name) {
    return this.audio.stop(name);
  }

  hover() {
    return this.play(UI_SOUNDS.hover);
  }

  click(pressed) {
    return this.play(pressed ? UI_SOUNDS.clickDown : UI_SOUNDS.clickUp);
  }

  buttons() {
    return this.play(UI_SOUNDS.buttons);
  }

  title() {
    return this.play(UI_SOUNDS.title);
  }

  questComplete() {
    return this.play(UI_SOUNDS.questComplete);
  }

  customize() {
    return this.play(UI_SOUNDS.customize);
  }

  openBox(kind = 'panel') {
    let played = this.play(UI_SOUNDS.openBox2);
    if (kind === 'checklist') played = this.play(UI_SOUNDS.openBoxChecklist) || played;
    if (kind === 'emote') played = this.play(UI_SOUNDS.openBoxEmote) || played;
    return played;
  }

  closeBox() {
    return this.play(UI_SOUNDS.openBox1);
  }

  emoji(kind = 'start') {
    const variant = Math.floor(this._random() * 3) + 1;
    return this.play(`emoji-${kind === 'end' ? 'ends' : 'starts'}${variant}`);
  }

  rune() {
    return this.play(`rune${Math.floor(this._random() * 3) + 1}`);
  }

  clothes() {
    return this.play('clothes');
  }

  zoom(inward) {
    return this.play(inward ? 'zoom-in' : 'zoom-off');
  }

  whoosh() {
    return this.play('whoosh');
  }

  paper(e = PAPER_DEFAULT_VOLUME) {
    if (!this.audio.registry[UI_SOUNDS.paper]) return false;
    const timers = this.audio.timers;

    timers.tween({
      key: 'paper-attack',
      target: this._boxVolume,
      to: { value: 1 },
      duration: e * 0.05,
      onUpdate: () => this.audio.setVolume(UI_SOUNDS.paper, this._boxVolume.value * PAPER_MIX),
    });

    timers.tween({
      key: 'paper-decay',
      target: this._boxVolume,
      from: { value: 1 },
      to: { value: 0 },
      delay: e * (1 - 0.05),
      duration: e * 0.05 + 0.2,
      onUpdate: () => this.audio.setVolume(UI_SOUNDS.paper, this._boxVolume.value * PAPER_MIX),
    });
    return true;
  }

  stopPaper() {
    this._boxVolume.value = 0;
    this.audio.setVolume(UI_SOUNDS.paper, 0);
  }

  analyse() {
    return {
      paperVolume: this.audio.getVolume(UI_SOUNDS.paper),
      boxVolume: this._boxVolume.value,
    };
  }
}

export const UI_PLAY_EVENT = 'webgl_play_audio';
