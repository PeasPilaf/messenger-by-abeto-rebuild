export const ASSETS_ROOT = '/assets/';
export const GEOMETRY_ROOT = '/assets/geometries/';
export const IMAGE_ROOT = '/assets/images/';
export const AUDIO_ROOT = '/assets/audio/';
export const BASIS_TRANSCODER_ROOT = '/assets/libs/basis/';
export const DRACO_ROOT = '/assets/libs/draco/';

export const DRACO_WRAPPER_FILE = '/assets/libs/draco/draco_wasm_wrapper.js';
export const DRACO_WASM_FILE = '/assets/libs/draco/draco_decoder.wasm';

export const TEXTURES = {
  atlas: { name: 'atlas.png', mode: 'srgb-nearest' },
  lut: { name: 'lut.ktx2', mode: 'luttetrahedral' },
  noiseTerrain: { name: 'noises-terrain.ktx2', mode: 'linearfilter-repeat' },
  noiseWater: { name: 'water-noises-highq.ktx2', mode: 'linearfilter-repeat' },
  noiseClouds64: { name: 'clouds_noise_64.ktx2', mode: 'repeat' },
  noiseClouds512: { name: 'clouds_noise_512.ktx2', mode: 'repeat' },
  noiseTrails: { name: 'trails-noise.ktx2', mode: 'repeat' },
  noiseSimplexBlur: { name: 'noise-simplex-layered-blur-highq.ktx2', mode: 'repeat' },
  noiseSimplexPixellated: { name: 'noise-simplex-layered-pixellated-highq.ktx2', mode: 'repeat' },
  treeLeaves: { name: 'tree-leaves.ktx2', mode: 'repeat' },
  treeLeavesDetail: { name: 'tree-leaves-detail.ktx2', mode: 'repeat' },
  grassBlades: { name: 'grass-blades-highq.ktx2', mode: 'repeat' },
  particleSprites: { name: 'particle_sprites.ktx2', mode: 'repeat' },
  galaxy: { name: 'galaxy.ktx2', mode: 'repeat' },
  butterfly: { name: 'butterfly-highq.ktx2', mode: 'linearfilter' },
  butterflyFront: { name: 'butterfly-front-highq.ktx2', mode: 'linearfilter' },
  eye: { name: 'eye-highq.ktx2', mode: 'linearfilter' },
  mainCharEye: { name: 'mainchar-eye-highq.ktx2', mode: 'linearfilter' },
  mouth: { name: 'mouth-highq.ktx2', mode: 'linearfilter' },
  uvChecker: { name: 'uv/uvchecker-srgb.png', mode: 'srgb' },
  uvCheckerKtx2: { name: 'uv/uvchecker-srgb.ktx2', mode: 'srgb' },
};

export const FALLBACK_TEXTURE_PNG = 'uv/uvchecker-srgb.png';
export const FALLBACK_TEXTURE_KTX2 = 'uv/uvchecker-srgb.ktx2';

export const TERRAIN = {
  chunkCount: 10,

  lod: {
    0: [
      'planets/present/full_0', 'planets/present/full_1', 'planets/present/full_2',
      'planets/present/full_3', 'planets/present/full_4', 'planets/present/full_5',
      'planets/present/full_6', 'planets/present/full_7', 'planets/present/full_8',
      'planets/present/full_9',
    ],
    1: [
      'planets/present/full-lod-1_0', 'planets/present/full-lod-1_1', 'planets/present/full-lod-1_2',
      'planets/present/full-lod-1_3', 'planets/present/full-lod-1_4', 'planets/present/full-lod-1_5',
      'planets/present/full-lod-1_6', 'planets/present/full-lod-1_7', 'planets/present/full-lod-1_8',
      'planets/present/full-lod-1_9',
    ],
    2: [
      'planets/present/full-lod-2_0', 'planets/present/full-lod-2_1', 'planets/present/full-lod-2_2',
      'planets/present/full-lod-2_3', 'planets/present/full-lod-2_4', 'planets/present/full-lod-2_5',
      'planets/present/full-lod-2_6', 'planets/present/full-lod-2_7', 'planets/present/full-lod-2_8',
      'planets/present/full-lod-2_9',
    ],
    3: [
      'planets/present/full-lod-3_0', 'planets/present/full-lod-3_1', 'planets/present/full-lod-3_2',
      'planets/present/full-lod-3_3', 'planets/present/full-lod-3_4', 'planets/present/full-lod-3_5',
      'planets/present/full-lod-3_6', 'planets/present/full-lod-3_7', 'planets/present/full-lod-3_8',
      'planets/present/full-lod-3_9',
    ],
  },

  hitmesh: [
    'planets/present/hitmesh_0', 'planets/present/hitmesh_1', 'planets/present/hitmesh_2',
    'planets/present/hitmesh_3', 'planets/present/hitmesh_4',
  ],

  treeLeaves: [
    'planets/present/tree-leaves_0', 'planets/present/tree-leaves_1',
    'planets/present/tree-leaves_2', 'planets/present/tree-leaves_3',
    'planets/present/tree-leaves_4',
  ],

  grass: 'planets/present/grass',
  butterflies: 'planets/present/butterflies',
  water: 'planets/present/water',
  cables: ['planets/present/cables-1', 'planets/present/cables-2'],
  smoke: 'planets/present/smoke-1',
  vfx: [
    'planets/present/beachfoam_vfx',
    'planets/present/waterfall_inlet_vfx',
    'planets/present/waterfall_vfx',
    'planets/present/waterfallsplash_vfx',
  ],

  curves: ['npcs/present/tall-man-curve'],

  intro: {
    planet: 'planets/present/intro/planet',
    water: 'planets/present/intro/water',
    trees: 'planets/present/intro/trees',
    clouds: 'planets/present/intro/clouds',
    points: 'planets/intro/points',
    button: 'planets/present/intro/button',
    galaxies: 'planets/present/intro/galaxies',
    titleVertical: 'planets/present/intro/title_vertical',
  },
};

export const NPCS = {
  alien: {
    model: 'npcs/present/alien/alien',
    bones: 'npcs/present/alien/alien-bones',
    animations: ['npcs/present/alien/alien-idle'],
    curves: [],
  },
  boss: {
    model: 'npcs/present/boss/boss',
    bones: 'npcs/present/boss/boss-bones',
    animations: ['npcs/present/boss/boss-idle'],
    curves: [],
  },
  caveman: {
    model: 'npcs/present/caveman/caveman',
    bones: 'npcs/present/caveman/caveman-bones',
    animations: ['npcs/present/caveman/caveman-idle'],
    curves: [],
  },
  chef: {
    model: 'npcs/present/chef/chef',
    bones: 'npcs/present/chef/chef-bones',
    animations: ['npcs/present/chef/chef-idle'],
    curves: [],
  },
  diver: {
    model: 'npcs/present/diver/diver',
    bones: 'npcs/present/diver/diver-bones',
    animations: ['npcs/present/diver/diver-idle', 'npcs/present/diver/diver-talk-idle', 'npcs/present/diver/diver-talk'],
    curves: [],
  },
  factoryWorkerA: {
    model: 'npcs/present/factory-worker-a/factory-worker-a',
    bones: 'npcs/present/factory-worker-a/factory-worker-a-bones',
    animations: ['npcs/present/factory-worker-a/factory-worker-a-idle'],
    curves: [],
  },
  factoryWorkerB: {
    model: 'npcs/present/factory-worker-b/factory-worker-b',
    bones: 'npcs/present/factory-worker-b/factory-worker-b-bones',
    animations: ['npcs/present/factory-worker-b/factory-worker-b-talk', 'npcs/present/factory-worker-b/factory-worker-b-walk'],
    curves: ['npcs/present/factory-worker-b/curve-1'],
  },
  factoryWorkerC: {
    model: 'npcs/present/factory-worker-c/factory-worker-c',
    bones: 'npcs/present/factory-worker-c/factory-worker-c-bones',
    animations: ['npcs/present/factory-worker-c/factory-worker-c-idle'],
    curves: [],
  },
  femaleScientist: {
    model: 'npcs/present/female-scientist/female-scientist',
    bones: 'npcs/present/female-scientist/female-scientist-bones',
    animations: ['npcs/present/female-scientist/female-scientist-idle'],
    curves: [],
  },
  fox: {
    model: 'npcs/present/fox/fox',
    bones: 'npcs/present/fox/fox-bones',
    animations: ['npcs/present/fox/fox-idle'],
    curves: [],
  },
  maleScientist: {
    model: 'npcs/present/male-scientist/male-scientist',
    bones: 'npcs/present/male-scientist/male-scientist-bones',
    animations: ['npcs/present/male-scientist/male-scientist-idle'],
    curves: [],
  },
  mountainman: {
    model: 'npcs/present/mountainman/mountainman',
    bones: 'npcs/present/mountainman/mountainman-bones',
    animations: ['npcs/present/mountainman/mountainman-idle'],
    curves: [],
  },
  musician: {
    model: 'npcs/present/musician/musician',
    bones: 'npcs/present/musician/musician-bones',
    animations: ['npcs/present/musician/musician-idle', 'npcs/present/musician/musician-talk'],
    curves: [],
  },
  officeWorker: {
    model: 'npcs/present/office-worker/office-worker',
    bones: 'npcs/present/office-worker/office-worker-bones',
    animations: [
      'npcs/present/office-worker/office-worker-idle',
      'npcs/present/office-worker/office-worker-idle-talk',
      'npcs/present/office-worker/office-worker-talk',
      'npcs/present/office-worker/office-worker-walk',
      'npcs/present/office-worker/office-worker-walk-alt',
    ],
    curves: [],
  },

  officeWorkerAlt: {
    model: 'npcs/present/office-worker/office-worker-alt',
    bones: 'npcs/present/office-worker/office-worker-bones',
    animations: ['npcs/present/office-worker/office-worker-idle'],
    curves: [],
  },
  oldwoman: {
    model: 'npcs/present/oldwoman/oldwoman',
    bones: 'npcs/present/oldwoman/oldwoman-bones',
    animations: ['npcs/present/oldwoman/oldwoman-idle'],
    curves: [],
  },
  owl: {
    model: 'npcs/present/owl/owl',
    bones: 'npcs/present/owl/owl-bones',
    animations: ['npcs/present/owl/owl-idle'],
    curves: [],
  },
  scout: {
    model: 'npcs/present/scout/scout',
    bones: 'npcs/present/scout/scout-bones',
    animations: ['npcs/present/scout/scout-idle'],
    curves: [],
  },
  threekid: {
    model: 'npcs/present/threekid/threekid',
    bones: 'npcs/present/threekid/threekid-bones',
    animations: ['npcs/present/threekid/threekid-idle'],
    curves: [],
  },
  youngLady: {
    model: 'npcs/present/young-lady/young-lady',
    bones: 'npcs/present/young-lady/young-lady-bones',
    animations: [
      'npcs/present/young-lady/young-lady-idle',
      'npcs/present/young-lady/young-lady-idle-talk',
      'npcs/present/young-lady/young-lady-talk',
    ],
    curves: [],
  },
};

export const AVATAR = {
  bones: 'avatar/avatar-bones',
  body: 'avatar/avatar',
  animations: [
    'avatar/avatar-idle',
    'avatar/avatar-run',
    'avatar/avatar-sprint',
    'avatar/avatar-air',
    'avatar/avatar-afk1',
    'avatar/avatar-afk2',
    'avatar/avatar-afk3',
  ],

  accessories: {
    base: ['avatar/accessories/base'],
    hair: [
      'avatar/accessories/hair1', 'avatar/accessories/hair2', 'avatar/accessories/hair3',
      'avatar/accessories/hair4', 'avatar/accessories/hair5', 'avatar/accessories/hair6',
      'avatar/accessories/hair7',
    ],
    top: [
      'avatar/accessories/top1', 'avatar/accessories/top2', 'avatar/accessories/top3',
      'avatar/accessories/top4', 'avatar/accessories/top5', 'avatar/accessories/top6',
      'avatar/accessories/top7', 'avatar/accessories/top8', 'avatar/accessories/top9',
    ],
    bottom: [
      'avatar/accessories/bottom1', 'avatar/accessories/bottom2', 'avatar/accessories/bottom3',
      'avatar/accessories/bottom4', 'avatar/accessories/bottom5', 'avatar/accessories/bottom6',
      'avatar/accessories/bottom7',
    ],
    shoes: [
      'avatar/accessories/shoes1', 'avatar/accessories/shoes2', 'avatar/accessories/shoes3',
      'avatar/accessories/shoes4', 'avatar/accessories/shoes5', 'avatar/accessories/shoes6',
      'avatar/accessories/shoes7',
    ],
  },
};

export const BIRDS = {
  meshes: ['birds/1', 'birds/2'],
  curves: ['birds/curve-1', 'birds/curve-2'],
};

export const DELIVERIES = [
  'deliveries/clothes',
  'deliveries/letterwet',
  'deliveries/note',
  'deliveries/offering',
  'deliveries/postcard',
  'deliveries/samplebox',
];

export const EMOJIS = [
  'emojis/1', 'emojis/2', 'emojis/3', 'emojis/4', 'emojis/5',
  'emojis/6', 'emojis/7', 'emojis/8', 'emojis/9', 'emojis/10',
];

export const AUDIO = {
  ambiances: [
    'ambiances/base.ogg', 'ambiances/beach.ogg', 'ambiances/city.ogg', 'ambiances/factory.ogg',
    'ambiances/forest.ogg', 'ambiances/temple.ogg', 'ambiances/waterfalls.ogg',
  ],
  camera: ['camera/whoosh2.ogg', 'camera/zoom-in-5.ogg', 'camera/zoom-off-5.ogg'],
  character: [
    'character/bubble-ends.ogg', 'character/bubble-starts.ogg', 'character/clothes.ogg',
    'character/emoji-ends1.ogg', 'character/emoji-ends2.ogg', 'character/emoji-ends3.ogg',
    'character/emoji-starts1.ogg', 'character/emoji-starts2.ogg', 'character/emoji-starts3.ogg',
    'character/footsteps-water.ogg', 'character/footsteps4.ogg', 'character/jump-land.ogg',
    'character/jump-start.ogg',
  ],
  dialogues: [
    'dialogues/female1.ogg', 'dialogues/female2.ogg', 'dialogues/female3.ogg',
    'dialogues/male1.ogg', 'dialogues/male2.ogg', 'dialogues/male3.ogg',
    'dialogues/quest.ogg', 'dialogues/wtf.ogg',
  ],
  intro: [
    'intro/button-out.ogg', 'intro/button-turn.ogg', 'intro/letters.ogg', 'intro/rune1.ogg',
    'intro/rune2.ogg', 'intro/rune3.ogg', 'intro/rune4.ogg',
  ],
  music: ['music/bgmusic-highq.ogg', 'music/bgmusic-mobile.ogg', 'music/musician.ogg'],
  ui: [
    'ui/buttons2.ogg', 'ui/click2.ogg', 'ui/click3.ogg', 'ui/customize.ogg', 'ui/hover2.ogg',
    'ui/openbox-checklist.ogg', 'ui/openbox-emote.ogg', 'ui/openbox1.ogg', 'ui/openbox2.ogg',
    'ui/paper1.ogg', 'ui/paper4.ogg', 'ui/quest-complete.ogg', 'ui/title.ogg',
  ],
};

export const ALL_AUDIO = [
  ...AUDIO.ambiances, ...AUDIO.camera, ...AUDIO.character, ...AUDIO.dialogues,
  ...AUDIO.intro, ...AUDIO.music, ...AUDIO.ui,
];
