export const NPC_DEFAULTS = Object.freeze({

  talkDistance: 2.5,

  visibilityThreshold: 30,

  hitboxOffset: 0.2,

  textsBubblesOptions: Object.freeze({
    font: 'UglyDave-Alternates-optimized',
    size: 0.12,
    color: '#1f1f1f',
    align: 'left',
    width: 1.25,
    letterSpacing: -0.02,
    lineHeight: 1,
    marginX: 0.125,
    marginY: 0.09,
  }),

  iconOptions: Object.freeze({
    sizeActive: 0.28,
    sizeInactive: 0.12,
    color1: '#f5fdff',
    color2: '#75B9B5',
    colorHighlight: '#75B9B5',
    files: ['ui/npc-icons/inactive.icon', 'ui/npc-icons/active.icon'],

    visibilityDistance: 20,
  }),

  clipNames: Object.freeze(['idle', 'talk', 'idleTalk', 'walk']),
});

export const NPC_BUNDLE_OPTIONS = Object.freeze({
  'office-worker': {
    bubbleOffset: [0, 0.6, 0.05],
    speeds: [1, 1, 1, 1],
    curve: { file: 'npcs/present/tall-man-curve', speed: 0.52 },
    line: 61098,
  },
  'office-worker-2': {
    bubbleOffset: [0, 0.65, 0.1],
    speeds: [1, 1, 1, 1],
    icon: true,
    line: 61124,
  },
  chef: {
    bubbleOffset: [0.2, 0.25, 0.3],
    speeds: [1, 1, 1, 1],
    line: 61148,
  },
  caveman: {
    bubbleOffset: [0, 0.25, 0],
    speeds: [1, 1, 1, 1],
    icon: true,
    line: 61171,
  },
  boss: {
    bubbleOffset: [0, 0.5, 0],
    speeds: [0.9, 0.9, 0.9, 0.9],
    icon: true,
    talkDistance: 2.2,
    line: 61196,
  },
  'flower-lady': {
    bubbleOffset: [0, 0, -0.2],
    speeds: [0.75, 1.1, 1, 1],
    icon: true,
    line: 61222,
  },
  scout: {
    bubbleOffset: [-0.15, 0.5, 0],
    speeds: [1, 1, 1, 1],
    line: 61247,
  },
  threekid: {
    bubbleOffset: [0, 0.4, 0],
    speeds: [0.9, 0.9, 0.9, 0.9],
    line: 61269,
  },
  'factory-worker-a': {
    bubbleOffset: [0, 0.6, 0],
    speeds: [1, 1, 1, 1],
    icon: true,
    line: 61297,
  },
  'factory-worker-b': {
    bubbleOffset: [0, 0.6, 0.1],
    speeds: [1, 1, 1, 1],
    curve: { file: 'npcs/present/factory-worker-b/curve-1', speed: 0.52 },
    line: 61321,
  },
  'female-scientist': {
    bubbleOffset: [0, 0.6, 0],
    speeds: [1, 1, 1, 1],
    icon: true,
    line: 61347,
  },
  'factory-worker-c': {
    bubbleOffset: [0, 0.6, 0],
    speeds: [1, 1, 1, 1],
    talkEnabled: false,
    line: 61371,
  },
  alien: {
    bubbleOffset: [0, -0.35, -0.7],
    speeds: [1, 1, 1, 1],
    line: 61394,
  },
  'male-scientist': {
    bubbleOffset: [0, 0.65, 0.2],
    speeds: [1, 1, 1, 1],
    icon: true,
    line: 61416,
  },
  diver: {
    bubbleOffset: [0, -0.2, 0.4],
    speeds: [1, 1, 1, 1],
    icon: true,
    talkDistance: 2.2,
    line: 61440,
  },
  mountainman: {
    bubbleOffset: [0, -0.2, 0],
    speeds: [1, 1, 1, 1],
    icon: true,
    line: 61466,
  },
  oldwoman: {
    bubbleOffset: [0, 0.3, 0],
    speeds: [1, 1, 1, 1],
    icon: true,
    line: 61494,
  },
  musician: {
    bubbleOffset: [0, 0.4, 0],
    speeds: [1, 1, 1, 1],
    icon: true,
    line: 61519,
  },
  fox: {
    bubbleOffset: [0, 0.6, 0],
    speeds: [1, 1, 1, 1],
    talkEnabled: false,
    line: 61544,
  },
  owl: {
    bubbleOffset: [0, 0.6, 0],
    speeds: [1, 1, 1, 1],
    talkEnabled: false,
    line: 61567,
  },
});

export function resolveNpcOptions(data) {
  const extra = NPC_BUNDLE_OPTIONS[data.id];
  if (!extra) {
    throw new Error(`npcOptions: no bundle options for NPC id "${data.id}"`);
  }
  const talkEnabled = extra.talkEnabled !== false;
  const iconOptions = NPC_DEFAULTS.iconOptions;
  return {
    id: data.id,

    animations: data.animations.slice(),
    animationsOptions: extra.speeds.map((speed) => ({ speed })),
    model: data.model,
    bones: data.bones,
    position: data.position.slice(),

    rotation: data.rotation.slice(),
    texts: (talkEnabled ? data.texts : ['']).map((text) => String(text).toUpperCase()),
    bubbleOffset: extra.bubbleOffset.slice(),
    iconOffset: data.iconOffset.slice(),
    lookatOffset: data.lookatOffset.slice(),
    visibilityThreshold: data.visibilityThreshold ?? NPC_DEFAULTS.visibilityThreshold,
    talkDistance: extra.talkDistance ?? NPC_DEFAULTS.talkDistance,
    alwaysFaceCharacter: talkEnabled ? Boolean(data.alwaysFaceCharacter) : false,
    talkFacingPlayer: talkEnabled ? Boolean(data.talkFacingPlayer) : false,
    talkEnabled,
    clickInteraction: talkEnabled,

    textsBubbles: talkEnabled,
    textsAutoClose: true,
    textsReset: true,
    textsRepeatLast: true,

    textsSpeed: 1 / 35,
    textsOpenTime: 0.75,
    textsCloseTime: 0.3,
    icon: Boolean(extra.icon),
    iconOptions: {
      ...iconOptions,
      color2: data.color,
      colorHighlight: data.color,
    },
    curve: extra.curve ?? null,
    extraData: { name: data.name, color: data.color, voice: data.voice },
    textsBubblesOptions: NPC_DEFAULTS.textsBubblesOptions,
    hitboxOffset: NPC_DEFAULTS.hitboxOffset,
  };
}
