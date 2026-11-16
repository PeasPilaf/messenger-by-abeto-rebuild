import * as THREE from 'three';

import chunks from '../graphics/shaders/chunks.glsl?raw';

const VERTEX_SURFACE =  `
    uniform float uTime;
    attribute float surfaceId;
    attribute int elementId;

    varying vec2 vUv;
    varying vec2 vHighPrecisionZW;
    varying vec3 wNormal;
    varying vec3 wPos;
    varying vec4 vPos;
    varying vec3 vNormal;
    varying float vSurfaceId;
    flat varying int vElementId;

    #include <common>
    #include <shadowmap_pars_vertex>

    void main() {
        vUv = uv;
        vElementId = elementId;
        vSurfaceId = surfaceId;

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);

        wNormal = normal;
        wPos = position.xyz;
        vNormal = normalize(normalMatrix * normal);

        vec3 transformedNormal = vNormal;
        #include <shadowmap_vertex>

        vPos = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * vPos;
        vHighPrecisionZW = gl_Position.zw;
    }
`;

const VERTEX_WATER = VERTEX_SURFACE
  .replace('attribute float surfaceId;', 'attribute float dist;\n    attribute float surfaceId;')
  .replace('varying float vSurfaceId;', 'varying float vSurfaceId;\n    varying float vDist;')
  .replace('vSurfaceId = surfaceId;', 'vSurfaceId = surfaceId;\n        vDist = dist;');

const VERTEX_CLOUD =  `
    uniform float uTime;
    uniform sampler2D tNoise;
    attribute float surfaceId;
    attribute int elementId;

    varying vec2 vUv;
    varying vec2 vHighPrecisionZW;
    varying vec3 wNormal;
    varying vec3 wPos;
    varying vec4 vPos;
    varying vec3 vNormal;
    varying float vSurfaceId;
    flat varying int vElementId;

    #include <common>
    #include <shadowmap_pars_vertex>

    vec4 triplanar(sampler2D tex, vec3 wNorm, vec3 p, float scale) {
        vec3 blend = normalize(abs(wNorm));
        blend /= dot(blend, vec3(1.0));
        vec4 cx = texture2D(tex, p.yz * scale) * blend.x;
        vec4 cy = texture2D(tex, p.zx * scale) * blend.y;
        vec4 cz = texture2D(tex, p.xy * scale) * blend.z;
        return cx + cy + cz;
    }

    void main() {
        vUv = uv;
        vElementId = elementId;
        vSurfaceId = surfaceId;

        vec3 pos = position;

        vec4 triplanarNoise = triplanar(tNoise, normal, pos.xyz * 0.07, 1.0);
        vec3 displacement = sin(triplanarNoise.r * 180.0 + floor(uTime * 6.0) * 0.25)
                          * normalize(pos) * 0.5;
        pos += displacement;

        vec4 worldPosition = modelMatrix * vec4(pos, 1.0);

        wNormal = normal;
        wPos = position.xyz;
        vNormal = normalize(normalMatrix * normal);

        vec3 transformedNormal = vNormal;
        #include <shadowmap_vertex>

        vPos = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * vPos;
        vHighPrecisionZW = gl_Position.zw;
    }
`;

const FRAGMENT_HEADER =  `
    layout(location = 1) out highp vec4 gInfo;

    uniform float uTime;
    uniform sampler2D tColors;
    uniform sampler2D tNoiseTerrain;
    uniform sampler2D tNoise;

    varying vec3 wPos;
    varying vec3 wNormal;
    varying vec3 vNormal;
    varying vec4 vPos;
    varying float vSurfaceId;
    flat varying int vElementId;
    varying vec2 vUv;
    varying vec2 vHighPrecisionZW;

    #include <common>
    #include <packing>
    /* INCLUDE_CHUNKS */
    #include <shadowmap_pars_fragment>

    vec3 twoTone(vec3 color) {
        vec3 colorShadow = rgb2hsv(color);
        colorShadow.r -= 0.02;
        colorShadow.b *= 0.5;
        colorShadow = hsv2rgb(colorShadow);

        float shadow = 1.0;
        #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
            DirectionalLightShadow directionalLightShadow;
            directionalLightShadow = directionalLightShadows[0];
            shadow = getShadow(
                directionalShadowMap[0],
                directionalLightShadow.shadowMapSize,
                directionalLightShadow.shadowIntensity,
                directionalLightShadow.shadowBias,
                directionalLightShadow.shadowRadius,
                vDirectionalShadowCoord[0]
            );
        #endif

        float shadowCut = smoothstep(0.2, 0.4, shadow);
        return mix(colorShadow, color, shadowCut);
    }

    float outlineMask(vec4 triplanarNoise) {
        return step(0.5, step(0.17, triplanarNoise.g * triplanarNoise.b));
    }
`;

const FRAGMENT_SURFACE =  `
    ${FRAGMENT_HEADER}

    void main() {
        float surfaceId = vSurfaceId;

        vec4 triplanarNoise = triplanar(tNoise, wNormal, wPos.xyz * 0.07, 1.0);
        float height = length(wPos);
        float grassMask = 0.0;

        if (vElementId == 1) {
            grassMask = step(0.15, max(0.0, -triplanarNoise.r * 1.5 + dot(wNormal, normalize(wPos)))
                                    - triplanarNoise.g * 0.35 + 0.1 - triplanarNoise.b * 0.05);
            float n1 = sin(height * 0.025 + (wNormal.x + wNormal.y + wNormal.z) * 0.05
                           + (wPos.x + wPos.y + wPos.z) * 1.5);
            float striations = texture2D(tNoise, vec2(n1 * 0.01, height * 0.07 - n1 * 0.02)).g;
            striations = step(0.47, striations + triplanarNoise.r * 0.2 + triplanarNoise.g * 0.05);
            surfaceId += striations * (1.0 - grassMask) * step(0.25, triplanarNoise.r);
        }

        vec2 colorUV = vUv;
        if (grassMask > 0.5) colorUV = vec2(0.15, 0.95);

        vec3 color = twoTone(texture2D(tColors, colorUV).rgb);
        surfaceId += grassMask * 0.1;

        gl_FragColor = vec4(color, surfaceId);

        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                     vec2(0.0), outlineMask(triplanarNoise));
    }
`;

const FRAGMENT_WATER =  `
    ${FRAGMENT_HEADER}
    varying float vDist;

    void main() {
        float surfaceId = vSurfaceId;

        vec4 triplanarNoise = triplanar(tNoise, wNormal, wPos.xyz * 0.07 + uTime * 0.05, 1.0);
        vec3 color = texture2D(tColors, vUv).rgb;

        float waves = fract(triplanarNoise.r * 0.7 + vDist * 3.0 + uTime * 0.1);
        waves *= 1.0 - step(0.7, vDist);
        waves *= step(0.3, vDist);
        waves *= triplanarNoise.r;
        waves = step(0.3, waves);
        color = mix(color, vec3(1.0), waves);

        color = twoTone(color);

        color += smoothstep(0.3, 0.0, step(0.2, vDist - triplanarNoise.r * 1.5)) * vec3(0.2, 0.8, 1.0) * 0.035;
        color += smoothstep(0.3, 0.0, step(1.15, vDist - triplanarNoise.b * 1.5)) * vec3(0.2, 0.8, 1.0) * 0.01;

        gl_FragColor = vec4(color, surfaceId);
        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                     vec2(0.0), outlineMask(triplanarNoise));
    }
`;

const FRAGMENT_CLOUD =  `
    ${FRAGMENT_HEADER}
    uniform vec3 uColor;

    void main() {
        vec4 triplanarNoise = triplanar(tNoise, wNormal, wPos.xyz * 0.07, 1.0);
        vec3 color = twoTone(uColor);
        gl_FragColor = vec4(color, vSurfaceId);

        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                     encodeNormalSpheremap(normalize(vNormal)), outlineMask(triplanarNoise));
    }
`;

function lightingUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.lights);
}

export function createIntroMaterial({ kind = 'surface', shared, textures, color = '#F8F8F8' } = {}) {
  if (!shared || !textures) throw new Error('createIntroMaterial: shared + textures are required');

  const uniforms = lightingUniforms();
  Object.assign(uniforms, {

    uTime: shared.uTime,
    tColors: { value: textures.palette ?? null },
    tNoise: { value: textures.noise ?? null },
    tNoiseTerrain: { value: textures.noiseTerrain ?? null },
    uColor: { value: new THREE.Color(color) },
  });

  let vertexShader = VERTEX_SURFACE;
  let fragmentShader = FRAGMENT_SURFACE;
  if (kind === 'water') {
    vertexShader = VERTEX_WATER;
    fragmentShader = FRAGMENT_WATER;
  } else if (kind === 'cloud') {
    vertexShader = VERTEX_CLOUD;
    fragmentShader = FRAGMENT_CLOUD;
  }

  fragmentShader = fragmentShader.replace('/* INCLUDE_CHUNKS */', chunks);

  const material = new THREE.ShaderMaterial({
    name: `intro-${kind}`,
    defines: { USE_UV: '' },
    uniforms,
    vertexShader,
    fragmentShader,
    lights: true,
  });

  if (kind === 'surface') material.shadowSide = THREE.FrontSide;
  return material;
}

export { chunks as introShaderChunks };
