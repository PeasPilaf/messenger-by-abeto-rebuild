import { events } from '../core/Events.js';

export const POSITIONAL_DEFAULT_VOLUME = 0.5;

export const GLOBAL_VOLUME_TIME = 0.2;

export function parseGlobalVolume(payload) {
  if (typeof payload === 'number') return { volume: payload, time: GLOBAL_VOLUME_TIME };
  if (payload && typeof payload === 'object') {
    return {
      volume: typeof payload.volume === 'number' ? payload.volume : 1,
      time: typeof payload.time === 'number' ? payload.time : GLOBAL_VOLUME_TIME,
    };
  }
  return { volume: 1, time: GLOBAL_VOLUME_TIME };
}

export function attachAudioBus(audio) {
  const handlers = {
    setVolume: (name, volume = 1) => audio.setVolume(name, volume),
    play: (name) => audio.play(name),
    stop: (name) => audio.stop(name),
    playPositional: (name, object3D, volume = POSITIONAL_DEFAULT_VOLUME, offset = 0, attach = false) =>
      audio.playPositional(name, object3D, { volume, offset, attach }),
    stopPositional: (name) => audio.stopPositional(name),
    muteToggle: () => audio.toggleMute(),
    globalVolume: (payload) => {
      const { volume, time } = parseGlobalVolume(payload);
      audio.setGlobalVolume(volume, time);
    },
  };
  events.on('webgl_set_audio_volume', handlers.setVolume);
  events.on('webgl_play_audio', handlers.play);
  events.on('webgl_stop_audio', handlers.stop);
  events.on('webgl_play_positional', handlers.playPositional);
  events.on('webgl_stop_positional', handlers.stopPositional);
  events.on('audio_mute_toggle', handlers.muteToggle);
  events.on('audio_global_volume', handlers.globalVolume);
  return handlers;
}

export function detachAudioBus(handlers) {
  if (!handlers) return;
  events.off('webgl_set_audio_volume', handlers.setVolume);
  events.off('webgl_play_audio', handlers.play);
  events.off('webgl_stop_audio', handlers.stop);
  events.off('webgl_play_positional', handlers.playPositional);
  events.off('webgl_stop_positional', handlers.stopPositional);
  events.off('audio_mute_toggle', handlers.muteToggle);
  events.off('audio_global_volume', handlers.globalVolume);
}
