import { Color, ShaderMaterial, Vector2 } from 'three';
import { createPainterlyMaterial } from '../../graphics/PainterlyMaterial.js';

const GINFO_DECL = 'layout(location = 1) out highp vec4 gInfo;\n';

export function patchSkinningChunk(material) {
  const shader = material?.vertexShader;
  if (typeof shader !== 'string' || !shader.includes('skinnormal_vertex')) return material;
  if (!shader.includes('skinbase_vertex')) {
    material.vertexShader = shader.replace(
      '        #include <skinnormal_vertex>',
      '        #include <skinbase_vertex>\n        #include <skinnormal_vertex>',
    );
  }
  return material;
}

function seedFor(id) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

export function createNpcMaterial({ shared, visibilityThreshold, id }) {
  const material = createPainterlyMaterial({ kind: 'npc', shared });
  material.name = `painterly-npc-${id}`;

  material.uniforms.uFadeDistance = { value: visibilityThreshold };
  material.uniforms.uNPCSeed = { value: seedFor(id) };
  return patchSkinningChunk(material);
}

export function patchSlugMaterialForWorld(material) {
  material.depthTest = true;
  material.depthWrite = false;
  if (material.userData.worldPatched) return material;
  material.userData.worldPatched = true;

  const vertexMarker = 'gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);';
  const fragmentMarker = 'gl_FragColor = vec4(color.rgb, alpha);';
  if (!material.vertexShader.includes(vertexMarker) || !material.fragmentShader.includes(fragmentMarker)) {

    console.warn('[npc] SlugMaterial world patch did not match; text has no MRT info output');
    return material;
  }

  material.vertexShader = material.vertexShader
    .replace('varying vec4 vColor;', 'varying vec4 vColor;\nvarying float vMrtDepth;')
    .replace(
      vertexMarker,
      `${vertexMarker}\n    vMrtDepth = 1.0 - (0.5 * gl_Position.z / gl_Position.w + 0.5);`,
    );

  material.fragmentShader = `${GINFO_DECL}varying float vMrtDepth;\n${material.fragmentShader.replace(
    fragmentMarker,
    `${fragmentMarker}\n    gInfo = vec4(vMrtDepth, 0.0, 0.0, 0.0);`,
  )}`;
  material.needsUpdate = true;
  return material;
}

const BUBBLE_POSITIONS = new Float32Array([
  -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 0, 0,
  -0.07, 0, 0, 0, -0.07, 0, 0.07, 0, 0,
]);
const BUBBLE_UVS = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
const BUBBLE_POINTERS = new Float32Array([0, 0, 0, 0, 1, 1, 1]);

const BUBBLE_VERTEX =  `
attribute float pointer;
uniform vec2 uSize;
varying vec2 vUv;
flat varying float vPointer;
varying float vMrtDepth;
varying vec3 vWorldNormal;

void main() {
    vUv = uv;
    vPointer = pointer;

    vec3 pos = position;
    if (pointer < 0.5) pos.xy *= uSize;
    pos.y += 0.07;
    pos.z -= 0.02;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorldNormal = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
    vMrtDepth = 1.0 - (0.5 * gl_Position.z / gl_Position.w + 0.5);
}
`;

const BUBBLE_FRAGMENT =  `${GINFO_DECL}
uniform vec2 uSize;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
flat varying float vPointer;
varying float vMrtDepth;
varying vec3 vWorldNormal;

vec2 encodeNormalSpheremap(vec3 n) {
    float f = sqrt(8.0 * n.z + 8.0);
    return n.xy / f * 2.0;
}

float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
    if (vPointer < 0.5) {
        vec2 aspectMult = mix(vec2(uSize.x / uSize.y, 1.0), vec2(1.0, uSize.y / uSize.x), step(uSize.x, uSize.y));
        float shape = sdRoundedBox((vUv - 0.5) * aspectMult, vec2(0.5) * aspectMult, 0.1 / min(uSize.x, uSize.y));
        if (shape > 0.001) discard;
    }
    gl_FragColor = vec4(uColor, uOpacity);
    gInfo = vec4(vMrtDepth, encodeNormalSpheremap(vWorldNormal), 0.0);
}
`;

export function createBubblePanelMaterial({ color = '#ffffff' } = {}) {
  return new ShaderMaterial({
    name: 'npc-bubble-panel',
    uniforms: {
      uSize: { value: new Vector2(1, 1) },
      uColor: { value: new Color(color) },
      uOpacity: { value: 1 },
    },
    vertexShader: BUBBLE_VERTEX,
    fragmentShader: BUBBLE_FRAGMENT,
    transparent: false,
    depthTest: true,
    depthWrite: true,
  });
}

export { BUBBLE_POSITIONS, BUBBLE_UVS, BUBBLE_POINTERS };
