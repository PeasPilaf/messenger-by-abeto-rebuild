import * as THREE from 'three';

import sharedChunks from '../../graphics/shaders/chunks.glsl?raw';
import { COLORS, FOG } from '../../graphics/constants.js';

export const VERTEX_CHUNKS =  `

float efit(float x, float a1, float a2, float b1, float b2) {
    return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1);
}
float fit(float x, float a1, float a2, float b1, float b2) {
    return clamp(efit(x, a1, a2, b1, b2), min(b1, b2), max(b1, b2));
}
float linearstep(float begin, float end, float t) {
    return clamp((t - begin) / (end - begin), 0.0, 1.0);
}
#define sinlayer(frX, frY, frZ) val += sin(dot(p, vec3(frX, frY, frZ)));
float sinenoise1(vec3 p) {
    float val = 0.0;
    sinlayer(1.5, 3.4598, 1.234);
    sinlayer(3.12, -3.234, 4.221);
    sinlayer(0.355, 2.3, -1.375);
    sinlayer(-0.156, -3.34, -0.4566);
    sinlayer(-4.1235, -0.485, -1.45);
    sinlayer(2.54, -0.879, -2.123);
    return val / 6.0;
}

mat3 rotateZ(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}
mat4 rotation3D(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    return mat4(
        oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
        oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s, 0.0,
        oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c, 0.0,
        0.0, 0.0, 0.0, 1.0);
}

vec3 getViewRight() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 getViewUp() { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
vec3 getViewBack() { return vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); }

struct DirectionalLight { vec3 direction; vec3 color; };
uniform DirectionalLight directionalLights[1];

uniform float time;
uniform vec2 resolution;
uniform vec3 charPos;
uniform float charSpeed;
uniform vec2 uNearFar;
`;

const FRAGMENT_HEAD = '#include <common>\n#include <packing>\n';

const FRAGMENT_GLOBALS =  `
uniform float time;
uniform vec2 resolution;
uniform vec2 uNearFar;
`;

const SHADOW_FRAGMENT =  `
#include <shadowmap_pars_fragment>

float extrasShadow() {
    float shadow = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow directionalLightShadow = directionalLightShadows[0];
        shadow = getShadow(
            directionalShadowMap[0],
            directionalLightShadow.shadowMapSize,
            directionalLightShadow.shadowIntensity,
            directionalLightShadow.shadowBias,
            directionalLightShadow.shadowRadius,
            vDirectionalShadowCoord[0]
        );
    #endif
    return shadow;
}
`;

export const SHADOW_VERTEX = '#include <shadowmap_pars_vertex>\n';

const VERTEX_SHADOW_COORDS =  `

`;

export function createExtrasFragment(body, { shadows = false } = {}) {
  return FRAGMENT_HEAD + FRAGMENT_GLOBALS + sharedChunks + (shadows ? SHADOW_FRAGMENT : '') + body;
}

const VERTEX_INVERSE_TRANSFORM_DIRECTION =  `
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
    return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
`;

export function createExtrasVertex(body, { shadows = false } = {}) {
  return VERTEX_INVERSE_TRANSFORM_DIRECTION + VERTEX_CHUNKS
    + (shadows ? SHADOW_VERTEX + VERTEX_SHADOW_COORDS : '') + body;
}

export function createExtrasShared() {
  return {

    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    charPos: { value: new THREE.Vector3() },
    charSpeed: { value: 0 },

    uNearFar: { value: new THREE.Vector2(0.2, 175) },

    uFogColorNear: { value: new THREE.Color(COLORS.fogNear) },
    uFogColorFar: { value: new THREE.Color(COLORS.fogFar) },
    uFogDistance: { value: FOG.distance },
    uFogDensity: { value: FOG.density },
  };
}

export function createExtrasMaterial({
  name,
  vertexShader,
  fragmentShader,
  uniforms = {},
  shared = {},
  lights = false,
  ...materialOptions
}) {
  const merged = lights ? THREE.UniformsUtils.clone(THREE.UniformsLib.lights) : {};
  Object.assign(merged, uniforms, shared);
  return new THREE.ShaderMaterial({
    name,
    uniforms: merged,
    vertexShader,
    fragmentShader,
    lights,
    ...materialOptions,
  });
}

export function createInstancedGeometry(baseGeometry, instanceCount, attributeNames) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.instanceCount = instanceCount;
  geometry.index = baseGeometry.index;
  for (const [name, attribute] of Object.entries(baseGeometry.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  for (const [name, itemSize] of Object.entries(attributeNames)) {
    geometry.setAttribute(
      name,
      new THREE.InstancedBufferAttribute(new Float32Array(instanceCount * itemSize), itemSize),
    );
  }
  return geometry;
}

export function computeInstanceBounds(geometry, matrixArray, count, padding) {
  const center = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    center.x += matrixArray[i * 16 + 12];
    center.y += matrixArray[i * 16 + 13];
    center.z += matrixArray[i * 16 + 14];
  }
  center.divideScalar(Math.max(1, count));
  let radius = padding;
  const point = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    point.set(matrixArray[i * 16 + 12], matrixArray[i * 16 + 13], matrixArray[i * 16 + 14]);
    radius = Math.max(radius, center.distanceTo(point) + padding);
  }
  geometry.boundingSphere = new THREE.Sphere(center, radius);
  return geometry.boundingSphere;
}

export function isWithinVisibility(sphere, characterPosition, threshold, scratch = new THREE.Vector3()) {
  if (!sphere || !characterPosition) return true;
  scratch.copy(characterPosition).sub(sphere.center);
  const distance = scratch.length();
  if (distance === 0) return true;
  scratch.divideScalar(distance);
  const reach = Math.min(distance, sphere.radius);
  scratch.multiplyScalar(reach).add(sphere.center);
  return characterPosition.distanceTo(scratch) < threshold;
}

export const MRT_COMMENT =  `

`;
