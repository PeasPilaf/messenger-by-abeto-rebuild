import * as THREE from 'three';
import { ShaderChunk } from 'three';

import chunks from './shaders/chunks.glsl?raw';
import painterlyVert from './shaders/painterly.vert.glsl?raw';
import painterlyFrag from './shaders/painterly.frag.glsl?raw';

import { COLORS, FOG, LIGHTING, OUTLINE } from './constants.js';

let cachedTweakedLights = null;
function getTweakedLightsFragment() {
  if (cachedTweakedLights) return cachedTweakedLights;

  let source = ShaderChunk.lights_fragment_begin;
  const shadowLine =
    'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ],' +
    ' directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias,' +
    ' directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

  if (!source.includes(shadowLine)) {
    throw new Error('lights_fragment_begin changed: the _dirShadow patch needs updating');
  }
  source = source.replace(
    'DirectionalLight directionalLight;',
    'DirectionalLight directionalLight;\n        float _dirShadow = 1.0;',
  );
  source = source.replace(
    shadowLine,
    `float shadow = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ],
        directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity,
        directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius,
        vDirectionalShadowCoord[ i ] ) : 1.0;
      _dirShadow *= shadow;
      directLight.color *= shadow;`,
  );
  cachedTweakedLights = source;
  return source;
}

const fragmentShader = painterlyFrag
  .replace('/* INCLUDE_CHUNKS */', chunks)
  .replace('/* INCLUDE_LIGHTS_FRAGMENT_BEGIN */', getTweakedLightsFragment());

const uniformLibrary = THREE.UniformsUtils.merge([
  THREE.UniformsLib.common,
  THREE.UniformsLib.lights,
  {
    emissive: { value: new THREE.Color(0) },
    specular: { value: new THREE.Color('#111111') },
    shininess: { value: 1 },
    uShowChars: { value: 1 },
    tColors: { value: null },
    tNoise: { value: null },
    tNoiseTerrain: { value: null },
    uFadeDistance: { value: 100 },
  },
]);

export function createPainterlyMaterial({ kind = 'object', shared, hardShadowCut = false } = {}) {
  const defines = { USE_UV: '' };

  if (kind === 'terrain') defines.IS_TERRAIN = '';
  if (kind === 'character') defines.IS_CHARACTER = '';
  if (kind === 'npc') defines.IS_NPC = '';
  if (kind === 'give') defines.IS_GIVE = '';
  if (hardShadowCut || kind === 'character' || kind === 'npc') defines.HARD_CUT_SHADOW = '';
  if (kind === 'character') defines.USE_SKINNING = '';
  if (kind === 'npc') defines.USE_SKINNING = '';

  const uniforms = THREE.UniformsUtils.clone(uniformLibrary);

  for (const [key, box] of Object.entries(shared)) uniforms[key] = box;

  if (kind === 'character' || kind === 'npc') {
    uniforms.uSkinColor = shared.uSkinColor ?? { value: new THREE.Color(COLORS.skin) };
  }
  if (kind === 'npc') {
    uniforms.tMouth = shared.tMouth ?? { value: null };
    uniforms.uMouthColor = shared.uMouthColor ?? { value: new THREE.Color(COLORS.mouth) };
    uniforms.uIsTalking = shared.uIsTalking ?? { value: 0 };
    uniforms.uNPCSeed = { value: Math.random() };
  }
  if (kind === 'character') {
    uniforms.uWetHeight = shared.uWetHeight ?? { value: 0 };
  }

  const material = new THREE.ShaderMaterial({
    name: `painterly-${kind}`,
    defines,
    uniforms,
    vertexShader: painterlyVert,
    fragmentShader,
    lights: true,
  });

  if (kind === 'terrain' || kind === 'character' || kind === 'npc') {
    material.shadowSide = THREE.FrontSide;
  }

  return material;
}

export function createSharedUniforms(textures = {}) {
  return {
    uTime: { value: 0 },
    uFadeDistance: { value: 100 },

    tColors: { value: textures.palette ?? null },
    tNoise: { value: textures.noise ?? null },
    tNoiseTerrain: { value: textures.noiseTerrain ?? null },
    tEye: { value: textures.eye ?? null },
    tMouth: { value: textures.mouth ?? null },
    uSkinColor: { value: new THREE.Color(COLORS.skin) },
    uMouthColor: { value: new THREE.Color(COLORS.mouth) },

    uFogColorNear: { value: new THREE.Color(COLORS.fogNear) },
    uFogColorFar: { value: new THREE.Color(COLORS.fogFar) },
    uFogDistance: { value: FOG.distance },
    uFogDensity: { value: FOG.density },
  };
}

export { LIGHTING, OUTLINE };
