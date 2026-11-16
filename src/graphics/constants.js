export const COLORS = {

  fogNear: '#93a2bf',
  fogFar: '#9ea7b8',

  outlinePresent: '#363a3c',
  outlineIntro: '#373f42',

  lightColor: '#ffffff',
  lightIntensity: 3,

  skin: '#ebced0',
  mouth: '#2f1013',

  clear: '#000000',
};

export const CAMERA = {
  fov: 45,
  near: 0.2,
  far: 175,

  introFar: 1000,
  introNear: 2,
  introStartRadius: 120,
  introEndRadius: 40,
};

export const CHARACTER = {

  gravity: -0.00981,
  positionForce: 0.0045,
  jumpForce: 0.15,
  walkForce: 0.005,

  maxChars: 15,
  updateDistance: 75,
  updateDistanceMultiplier: 0.3,

  waterRadius: 22,
  wetDecay: 2e-4,
};

export const TERRAIN = {
  chunks: 10,

  lod1Distance: 6,
  lod2Distance: 12,
  lod3Distance: 20,

  dotThreshold: 0.45,
};

export const FOG = {
  distance: 0.8,
  density: 0.011,
};

export const SHADOW = {

  mapSize: 2400,
  orthoHalfSize: 24,
  normalBias: 0.07,
  bias: -1e-4,

  distance: 100,
  polarAngle: Math.PI * 0.2,
  azimuthAngle: Math.PI * -0.25,
  forwardOffset: 6,
};

export const OUTLINE = {

  fade: [5, 80],
  thickness: 1,
  color: COLORS.outlinePresent,
  infoRange: [1e-4, 2e-4, 0.1],
  infoMinScale: 0.6,
  depthRange: [1e-4, 0.01001, 0.1],
  normalRange: [0.4, 0.5, 0.3],
  scale: 1,
  smoothMargin: 0.2,
  resolutionDivisor: 1300,
};

export const INTRO_OUTLINE = {

  fade: [50, 300],
  thickness: 1,
  color: COLORS.outlineIntro,
  infoRange: [1e-4, 2e-4, 0.1],
  infoMinScale: 0.6,
  depthRange: [1e-4, 0.01001, 0.25],
  normalRange: [0.4, 0.5, 0.3],
  scale: 1,
  smoothMargin: 0.2,
};

export const LIGHTING = {

  softCut: [0.2, 0.4],
  hardCut: [0.1, 0.15],
  shadowHueShift: -0.02,
  shadowValueScale: 0.5,
  specularAmount: 0.075,
  specularGate: [0.01, 0.011],
  upFacingMask: [0.95, 0.9],
};

export const TERRAIN_SHADING = {
  terrainNoiseScale: 0.4,
  colorNoiseScale: 0.035,
  grassThreshold: 0.15,
  wetThreshold: 0.334,
  grassUv: [0.15, 0.95],
  wetUv: [0.21, 0.54],
  striationThreshold: 0.47,
  grassIdShift: 0.1,
  wetIdShift: 0.12,
  batchIdShift: 0.02535,
  elementIdDivisor: 1e6,
  colorNoiseDarken: 0.03,
  colorNoiseLighten: 0.05,
};

export const FACE = {

  blinkIntervals: [22, 34, 57],
  blinkTimeScale: 3,
  blinkPhaseSpread: 23.73464,

  mouthSpriteRate: 8,
  spriteWidth: 0.25,
};

export const RENDER = {

  adaptiveDpr: {
    minMultiplier: 0.6,
    maxMultiplier: 1.0,
    step: 0.1,
    lowFpsThreshold: 30,
    highFpsThreshold: 60,
    sampleMs: 4000,
    minFrames: 5,
    maxDirectionChanges: 4,
  },
  visibility: {

    cables: 25,
    smoke: 25,
    treeLeaves: 30,
    grass: 30,
    butterflies: 25,
    npc: 20,
  },
};
