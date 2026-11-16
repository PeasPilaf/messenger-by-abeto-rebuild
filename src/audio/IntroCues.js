export const INTRO_IN_TIMELINE = Object.freeze([
  Object.freeze({ at: 0.16, sound: 'whoosh' }),
  Object.freeze({ at: 1.8, sound: 'whoosh' }),
  Object.freeze({ at: 2.5, sound: 'intro-letters' }),
  Object.freeze({ at: 3.45, sound: 'button-turn' }),
]);

export const INTRO_OUT_TIMELINE = Object.freeze([
  Object.freeze({ at: 0.3, sound: 'button-out' }),
  Object.freeze({ at: 1.3, sound: 'whoosh' }),
]);

export const PRESENT_IN_TIMELINE = Object.freeze([
  Object.freeze({ at: 0.3, sound: 'whoosh' }),
]);

export class IntroCues {

  constructor({ audio }) {
    this.audio = audio;
    this._token = 0;
    this._pending = [];
  }

  play(timeline) {
    this.cancel();
    const token = ++this._token;
    for (const cue of timeline) {
      this._pending.push(this.audio.after(cue.at, () => {
        if (token !== this._token) return;
        this.audio.play(cue.sound);
      }));
    }
    return this;
  }

  playIn() {
    return this.play(INTRO_IN_TIMELINE);
  }

  playOut() {
    return this.play(INTRO_OUT_TIMELINE);
  }

  playPresent() {
    return this.play(PRESENT_IN_TIMELINE);
  }

  playRune() {
    return this.audio.play(`rune${Math.floor(Math.random() * 3) + 1}`);
  }

  cancel() {
    this._token++;
    for (const tween of this._pending) tween.cancel();
    this._pending.length = 0;
    return this;
  }
}
