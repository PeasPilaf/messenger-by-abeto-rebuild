const DEFAULTS = Object.freeze({
  volume: 1,
  loop: false,
  autoplay: false,
  sync: false,
  syncOffset: 0,
  offset: 0,
  minTimeBetweenPlays: 0,
  positional: null,
});

const POSITIONAL_DEFAULTS = Object.freeze({
  refDistance: 1,
  rolloffFactor: 1,
  distanceModel: 'inverse',
  maxDistance: 10000,
  directionalCone: Object.freeze([360, 0, 0]),
});

export const SOUNDS = Object.freeze({

  bgmusic: { file: 'music/bgmusic-highq.ogg', volume: 0.1, loop: true, autoplay: true, category: 'music' },

  'intro-letters': { file: 'intro/letters.ogg', volume: 0.1, category: 'intro' },
  'button-turn': { file: 'intro/button-turn.ogg', volume: 0.1, minTimeBetweenPlays: 0.2, category: 'intro' },
  'button-out': { file: 'intro/button-out.ogg', volume: 0.075, category: 'intro' },
  rune1: { file: 'intro/rune1.ogg', volume: 0.1, minTimeBetweenPlays: 0.2, category: 'intro' },
  rune2: { file: 'intro/rune2.ogg', volume: 0.1, minTimeBetweenPlays: 0.2, category: 'intro' },
  rune3: { file: 'intro/rune3.ogg', volume: 0.1, minTimeBetweenPlays: 0.2, category: 'intro' },

  rune4: { file: 'intro/rune4.ogg', volume: 0.1, minTimeBetweenPlays: 0.2, category: 'intro' },

  'ambiance-base': { file: 'ambiances/base.ogg', volume: 0, loop: true, autoplay: true, category: 'ambience' },
  'ambiance-forest': { file: 'ambiances/forest.ogg', volume: 0, loop: true, autoplay: true, category: 'ambience' },
  'ambiance-city': { file: 'ambiances/city.ogg', volume: 0, loop: true, autoplay: true, category: 'ambience' },
  'ambiance-factory': { file: 'ambiances/factory.ogg', volume: 0, loop: true, autoplay: true, category: 'ambience' },
  'ambiance-beach': { file: 'ambiances/beach.ogg', volume: 0, loop: true, autoplay: true, category: 'ambience' },
  'ambiance-waterfalls': { file: 'ambiances/waterfalls.ogg', volume: 0, loop: true, autoplay: true, category: 'ambience' },
  'ambiance-temple': { file: 'ambiances/temple.ogg', volume: 0, loop: true, autoplay: true, category: 'ambience' },

  footsteps: { file: 'character/footsteps4.ogg', volume: 0, loop: true, autoplay: true, sync: true, category: 'footsteps' },
  'footsteps-water': { file: 'character/footsteps-water.ogg', volume: 0, loop: true, autoplay: true, sync: true, category: 'footsteps' },

  jump: { file: 'character/jump-start.ogg', volume: 0.1, category: 'character' },
  land: { file: 'character/jump-land.ogg', volume: 0.125, category: 'character' },
  'emoji-starts1': { file: 'character/emoji-starts1.ogg', volume: 0.15, category: 'character' },
  'emoji-starts2': { file: 'character/emoji-starts2.ogg', volume: 0.15, category: 'character' },
  'emoji-starts3': { file: 'character/emoji-starts3.ogg', volume: 0.15, category: 'character' },
  'emoji-ends1': { file: 'character/emoji-ends1.ogg', volume: 0.1, category: 'character' },
  'emoji-ends2': { file: 'character/emoji-ends2.ogg', volume: 0.1, category: 'character' },
  'emoji-ends3': { file: 'character/emoji-ends3.ogg', volume: 0.1, category: 'character' },
  clothes: { file: 'character/clothes.ogg', volume: 0.2, category: 'character' },

  'zoom-off': { file: 'camera/zoom-off-5.ogg', volume: 0.1, category: 'camera' },
  'zoom-in': { file: 'camera/zoom-in-5.ogg', volume: 0.1, category: 'camera' },
  whoosh: { file: 'camera/whoosh2.ogg', volume: 0.2, category: 'camera' },

  title: { file: 'ui/title.ogg', volume: 0.25, category: 'ui' },
  buttons: { file: 'ui/buttons2.ogg', volume: 0.05, category: 'ui' },
  hover2: { file: 'ui/hover2.ogg', volume: 0.2, category: 'ui' },
  click2: { file: 'ui/click2.ogg', volume: 0.15, category: 'ui' },
  click3: { file: 'ui/click3.ogg', volume: 0.05, category: 'ui' },
  'open-box1': { file: 'ui/openbox1.ogg', volume: 0.1, category: 'ui' },
  'open-box2': { file: 'ui/openbox2.ogg', volume: 0.15, category: 'ui' },
  'open-box-emote': { file: 'ui/openbox-emote.ogg', volume: 0.15, category: 'ui' },
  'open-box-checklist': { file: 'ui/openbox-checklist.ogg', volume: 0.6, category: 'ui' },

  paper1: { file: 'ui/paper1.ogg', volume: 0, loop: true, autoplay: true, category: 'ui' },

  paper4: { file: 'ui/paper4.ogg', volume: 0, loop: true, autoplay: true, offset: 3, category: 'ui' },
  customize: { file: 'ui/customize.ogg', volume: 0.06, category: 'ui' },
  'quest-complete': { file: 'ui/quest-complete.ogg', volume: 0.25, category: 'ui' },

  'dialogue-quest': { file: 'dialogues/quest.ogg', volume: 0, loop: true, autoplay: true, category: 'dialogue' },

  'dialogue-male1': { file: 'dialogues/male1.ogg', volume: 0, loop: true, positional: { refDistance: 2, rolloffFactor: 1 }, category: 'dialogue' },
  'dialogue-male2': { file: 'dialogues/male2.ogg', volume: 0, loop: true, positional: { refDistance: 2, rolloffFactor: 1 }, category: 'dialogue' },
  'dialogue-male3': { file: 'dialogues/male3.ogg', volume: 0, loop: true, positional: { refDistance: 2, rolloffFactor: 1 }, category: 'dialogue' },
  'dialogue-female1': { file: 'dialogues/female1.ogg', volume: 0, loop: true, positional: { refDistance: 2, rolloffFactor: 1 }, category: 'dialogue' },
  'dialogue-female2': { file: 'dialogues/female2.ogg', volume: 0, loop: true, positional: { refDistance: 2, rolloffFactor: 1 }, category: 'dialogue' },
  'dialogue-female3': { file: 'dialogues/female3.ogg', volume: 0, loop: true, positional: { refDistance: 2, rolloffFactor: 1 }, category: 'dialogue' },
  'dialogue-wtf': { file: 'dialogues/wtf.ogg', volume: 0, loop: true, positional: { refDistance: 2, rolloffFactor: 1 }, category: 'dialogue' },

  'bubble-starts': { file: 'character/bubble-starts.ogg', volume: 0, positional: { refDistance: 2, rolloffFactor: 0.3 }, category: 'character' },
  'bubble-ends': { file: 'character/bubble-ends.ogg', volume: 0, positional: { refDistance: 2, rolloffFactor: 0.3 }, category: 'character' },

  'dialogue-music-dave': {
    file: 'music/musician.ogg',
    volume: 0,
    loop: true,
    positional: { distanceModel: 'linear', refDistance: 2.5, rolloffFactor: 1, maxDistance: 12 },
    category: 'music',
  },
});

export const LOW_MEMORY_MUSIC_FILE = 'music/bgmusic-mobile.ogg';

export const LOW_MEMORY_NAMES = Object.freeze(['bgmusic', 'quest-complete']);

const normalized = new Map();

export function soundFor(name) {
  const raw = SOUNDS[name];
  if (!raw) return null;
  if (!normalized.has(name)) {
    const positional = raw.positional
      ? Object.freeze({ ...POSITIONAL_DEFAULTS, ...raw.positional })
      : null;
    normalized.set(name, Object.freeze({ ...DEFAULTS, ...raw, positional }));
  }
  return normalized.get(name);
}

export function allSoundNames() {
  return Object.keys(SOUNDS);
}

export function isPositional(name) {
  return Boolean(SOUNDS[name]?.positional);
}

export function registryFor({ lowMemoryDevice = false } = {}) {
  const names = lowMemoryDevice ? LOW_MEMORY_NAMES : allSoundNames();
  const registry = {};
  for (const name of names) {
    const entry = soundFor(name);
    if (!entry) continue;
    registry[name] = lowMemoryDevice && name === 'bgmusic'
      ? Object.freeze({ ...entry, file: LOW_MEMORY_MUSIC_FILE })
      : entry;
  }
  return registry;
}

export const AUDIO_FILES = Object.freeze([
  ...new Set([...allSoundNames().map((name) => SOUNDS[name].file), LOW_MEMORY_MUSIC_FILE]),
]);

export function detectLowMemoryDevice(
  navigatorLike = globalThis.navigator,
  screenLike = globalThis.screen,
) {
  if (!navigatorLike || !screenLike) return false;
  const userAgent = navigatorLike.userAgent || '';
  let iOS = /(ipod|iphone|ipad)/i.test(userAgent);
  if (!iOS && /safari/i.test(userAgent) && !/chrome|android/i.test(userAgent)) {
    iOS = (navigatorLike.maxTouchPoints || 0) > 0;
  }
  if (!iOS) return false;
  const width = screenLike.width || 1;
  const height = screenLike.height || 1;
  return Math.min(width, height) / Math.max(width, height) < 0.65;
}
