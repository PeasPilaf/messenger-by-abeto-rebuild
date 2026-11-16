import { events } from '../core/Events.js';

export const MUSIC_NAME = 'bgmusic';

export const MUSIC_VOLUME = 0.1;

export const MUSICIAN_NAME = 'dialogue-music-dave';

export const MUSICIAN_VOLUME = 0.1;

export const MUSICIAN_NPC_ID = 'musician';

export class MusicSystem {

  constructor({ audio }) {
    this.audio = audio;
    this._attached = false;
    this._onTalkUpdate = this._onTalkUpdate.bind(this);
  }

  attach() {
    if (this._attached) return this;
    this._attached = true;
    events.on('npc_talk_update', this._onTalkUpdate, this);
    return this;
  }

  detach() {
    if (!this._attached) return;
    this._attached = false;
    events.off('npc_talk_update', this._onTalkUpdate, this);
  }

  start() {
    return this.audio.play(MUSIC_NAME);
  }

  stop() {
    return this.audio.stop(MUSIC_NAME);
  }

  setVolume(volume = MUSIC_VOLUME) {
    return this.audio.setVolume(MUSIC_NAME, volume);
  }

  get playing() {
    return this.audio.analyseSound(MUSIC_NAME)?.playing ?? false;
  }

  playMusician(object3D) {
    if (!object3D) return false;
    return this.audio.playPositional(MUSICIAN_NAME, object3D, { volume: MUSICIAN_VOLUME });
  }

  stopMusician() {
    return this.audio.stopPositional(MUSICIAN_NAME);
  }

  _onTalkUpdate({ id, object, talking } = {}) {
    if (id !== MUSICIAN_NPC_ID) return;
    if (talking) this.stopMusician();
    else this.playMusician(object);
  }

  analyse() {
    const music = this.audio.analyseSound(MUSIC_NAME);
    const musician = this.audio.analyseSound(MUSICIAN_NAME);
    return {
      name: MUSIC_NAME,
      volume: music?.volume ?? MUSIC_VOLUME,
      playing: music?.playing ?? false,
      musician: {
        playing: musician?.playing ?? false,
        parent: musician?.parent ?? null,
        volume: musician?.volume ?? 0,
      },
    };
  }
}
