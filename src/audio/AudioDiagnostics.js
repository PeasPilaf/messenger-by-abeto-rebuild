export function soundState(audio, name) {
  const source = audio._bank?.audio(name);
  if (!source) return null;
  return {
    name,
    playing: source.isPlaying,
    volume: source.individualVolume,
    gain: source.gain.gain.value,
    offset: source.offset,
    progress: source._progress,
    positional: Boolean(audio.registry[name]?.positional),
    parent: source.parent?.name || source.parent?._id || null,
  };
}

export function snapshot(audio) {
  const bank = audio._bank;
  const diagnose = bank ? bank.diagnose() : null;
  return {
    loaded: Boolean(bank),
    lowMemoryDevice: audio.lowMemoryDevice,
    registrySize: Object.keys(audio.registry).length,
    context: audio.session.analyse(),
    frame: audio.frame,
    clock: audio._clock,
    dt: audio._dt,
    ratio: audio._ratio,
    decode: diagnose
      ? {
        registered: diagnose.registered,
        decoded: diagnose.decoded,
        playable: diagnose.playable,
        totalDuration: bank.totalDuration,
        errors: diagnose.errors,
      }
      : null,
    music: audio.music.analyse(),
    ambience: audio.ambience.state,
    footsteps: audio.footsteps.state,
    dialogue: audio.dialogue.analyse(),
    ui: audio.ui.analyse(),
    sync: diagnose ? { skew: diagnose.syncSkew } : null,
    active: diagnose ? diagnose.active : [],
    sounds: diagnose ? diagnose.sounds : [],
    stats: { ...audio.stats },
  };
}
